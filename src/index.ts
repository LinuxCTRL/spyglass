import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { join } from "path";

export interface PackageInfo {
  description?: string;
  latest?: string;
  weeklyDownloads?: number;
  diskSize?: string;
  outdated: boolean;
}

export interface GraphNode {
  name: string;
  version: string;
  depth: number;
  children: GraphNode[];
  info?: PackageInfo;
}

export interface CircularResult {
  chain: string[];
}

export interface UnusedResult {
  name: string;
  version: string;
  info?: PackageInfo;
}

export interface WhyResult {
  name: string;
  version: string;
  path: string[];
  info?: PackageInfo;
}

export interface GraphOptions {
  path?: string;
  production?: boolean;
  npm?: boolean;
}

export interface GraphSummary {
  total: number;
  outdated: number;
  diskSize: string;
}

interface NpmCache {
  [name: string]: { description?: string; latest?: string; weeklyDownloads?: number } | null;
}

const npmCache: NpmCache = {};

async function fetchNpmInfo(names: string[]): Promise<void> {
  const uncached = names.filter((n) => !(n in npmCache));
  if (uncached.length === 0) return;

  const batchSize = 10;
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (name) => {
        try {
          const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
          if (!res.ok) { npmCache[name] = null; return; }
          const data = await res.json() as Record<string, unknown>;
          const downloadsRes = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`);
          let weeklyDownloads: number | undefined;
          if (downloadsRes.ok) {
            const dlData = await downloadsRes.json() as Record<string, unknown>;
            weeklyDownloads = dlData.downloads as number;
          }
          npmCache[name] = {
            description: (data.description as string) || undefined,
            latest: (data.version as string) || undefined,
            weeklyDownloads,
          };
        } catch {
          npmCache[name] = null;
        }
      }),
    );
  }
}

function getNpmInfo(name: string): { description?: string; latest?: string; weeklyDownloads?: number } | undefined {
  return npmCache[name] ?? undefined;
}

function getDiskSize(dir: string): string {
  try {
    if (!existsSync(dir)) return "";
    let total = 0;
    function walk(d: string) {
      try {
        const entries = readdirSync(d);
        for (const entry of entries) {
          const full = join(d, entry);
          try {
            const stat = statSync(full);
            if (stat.isDirectory()) walk(full);
            else total += stat.size;
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
    walk(dir);
    return formatBytes(total);
  } catch {
    return "";
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  try {
    const filePath = join(dir, "package.json");
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function getDeps(pkg: Record<string, unknown>): Record<string, string> {
  return { ...(pkg.dependencies as Record<string, string> || {}) };
}

export async function parseGraph(options: GraphOptions = {}): Promise<{
  tree: GraphNode[];
  circular: CircularResult[];
  unused: UnusedResult[];
  summary: GraphSummary;
}> {
  const rootDir = options.path ?? process.cwd();
  const pkg = readPackageJson(rootDir);
  if (!pkg) throw new Error(`No package.json found in ${rootDir}`);

  const rootDeps: Record<string, string> = {
    ...(pkg.dependencies as Record<string, string> || {}),
  };
  if (!options.production) {
    Object.assign(rootDeps, pkg.devDependencies as Record<string, string> || {});
  }

  // Fetch npm info for all root deps
  if (options.npm !== false) {
    await fetchNpmInfo(Object.keys(rootDeps));
  }

  const visited = new Set<string>();
  const depMap = new Map<string, string>();

  function resolveVersion(name: string, fromDir: string): string | null {
    const key = `${fromDir}:${name}`;
    if (depMap.has(key)) return depMap.get(key)!;
    const p = join(fromDir, "node_modules", name, "package.json");
    if (existsSync(p)) {
      const pkgData = JSON.parse(readFileSync(p, "utf-8"));
      const ver = (pkgData.version as string) ?? null;
      if (ver) depMap.set(key, ver);
      return ver;
    }
    const parent = join(fromDir, "..");
    if (parent !== fromDir) return resolveVersion(name, parent);
    return null;
  }

  function buildNode(name: string, fromDir: string, depth: number): GraphNode | null {
    if (depth > 8) return null;
    const version = resolveVersion(name, fromDir) ?? "unknown";
    const key = `${name}@${version}`;
    if (visited.has(key)) return null;
    visited.add(key);

    const pkgDir = join(fromDir, "node_modules", name);
    const childPkg = readPackageJson(pkgDir);
    const childDeps = childPkg ? getDeps(childPkg) : {};
    const children: GraphNode[] = [];
    for (const child of Object.keys(childDeps)) {
      const node = buildNode(child, pkgDir, depth + 1);
      if (node) children.push(node);
    }

    const info = getNpmInfo(name);
    const diskSize = getDiskSize(pkgDir);
    const outdated = info?.latest ? info.latest !== version : false;

    return {
      name,
      version,
      depth,
      children,
      info: info ? { ...info, diskSize: diskSize || undefined, outdated } : undefined,
    };
  }

  const tree: GraphNode[] = [];
  const circular: CircularResult[] = [];
  const seen = new Set<string>();

  for (const dep of Object.keys(rootDeps)) {
    if (seen.has(dep)) {
      circular.push({ chain: [dep] });
      continue;
    }
    seen.add(dep);
    const node = buildNode(dep, rootDir, 0);
    if (node) tree.push(node);
  }

  const usedNames = new Set<string>();
  function collectNames(nodes: GraphNode[]) {
    for (const n of nodes) {
      usedNames.add(n.name);
      collectNames(n.children);
    }
  }
  collectNames(tree);

  const unused: UnusedResult[] = [];
  for (const [name, version] of Object.entries(rootDeps)) {
    if (!usedNames.has(name)) {
      unused.push({ name, version, info: npmInfoToPackageInfo(getNpmInfo(name)) });
    }
  }

  function findCycles(nodes: GraphNode[], ancestors: string[]) {
    for (const n of nodes) {
      if (ancestors.includes(n.name)) {
        const idx = ancestors.indexOf(n.name);
        circular.push({ chain: [...ancestors.slice(idx), n.name] });
      } else {
        findCycles(n.children, [...ancestors, n.name]);
      }
    }
  }
  findCycles(tree, []);

  // Summary
  let total = 0;
  let outdatedCount = 0;
  function countNodes(nodes: GraphNode[]) {
    for (const n of nodes) {
      total++;
      if (n.info?.outdated) outdatedCount++;
      countNodes(n.children);
    }
  }
  countNodes(tree);

  // Total disk size (sum of all packages in node_modules)
  const nodeModulesDir = join(rootDir, "node_modules");
  const diskSize = getDiskSize(nodeModulesDir);

  return {
    tree,
    circular,
    unused,
    summary: { total, outdated: outdatedCount, diskSize },
  };
}

export async function findCircular(options: GraphOptions = {}): Promise<CircularResult[]> {
  const result = await parseGraph(options);
  return result.circular;
}

export async function findUnused(options: GraphOptions = {}): Promise<UnusedResult[]> {
  const result = await parseGraph(options);
  return result.unused;
}

export async function why(name: string, options: GraphOptions = {}): Promise<WhyResult | null> {
  const result = await parseGraph(options);

  function findNode(nodes: GraphNode[], target: string, path: string[]): { node: GraphNode; path: string[] } | null {
    for (const n of nodes) {
      if (n.name === target) return { node: n, path: [...path, n.name] };
      const found = findNode(n.children, target, [...path, n.name]);
      if (found) return found;
    }
    return null;
  }

  for (const root of result.tree) {
    const found = findNode(root.children, name, [root.name]);
    if (found) {
      return {
        name,
        version: found.node.version,
        path: found.path,
        info: found.node.info ?? npmInfoToPackageInfo(getNpmInfo(name)),
      };
    }
  }

  const direct = result.tree.find((n) => n.name === name);
  if (direct) return { name, version: direct.version, path: [name], info: direct.info };

  return null;
}

function npmInfoToPackageInfo(info: ReturnType<typeof getNpmInfo>): PackageInfo | undefined {
  if (!info) return undefined;
  return { ...info, diskSize: undefined, outdated: false };
}

export { getNpmInfo, npmInfoToPackageInfo };
