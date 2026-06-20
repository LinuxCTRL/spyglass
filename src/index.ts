import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface GraphNode {
  name: string;
  version: string;
  path: string;
  depth: number;
  dependencies: GraphNode[];
}

export interface CircularResult {
  cycle: string[];
  files: string[];
}

export interface UnusedResult {
  name: string;
  version: string;
  from: string;
}

export interface WhyResult {
  name: string;
  version: string;
  resolvedBy: string[];
  path: string[];
}

export interface GraphOptions {
  path?: string;
  production?: boolean;
}

export interface ParseResult {
  graph: GraphNode[];
  circular: CircularResult[];
  unused: UnusedResult[];
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  try {
    const filePath = join(dir, "package.json");
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function getDeps(pkg: Record<string, unknown>, production: boolean): Record<string, string> {
  const deps = { ...(pkg.dependencies as Record<string, string> || {}) };
  if (!production) {
    Object.assign(deps, pkg.devDependencies as Record<string, string> || {});
  }
  return deps;
}

export async function parseGraph(options: GraphOptions = {}): Promise<ParseResult> {
  const rootDir = options.path ?? process.cwd();
  const production = options.production ?? false;
  const pkg = readPackageJson(rootDir);
  if (!pkg) {
    throw new Error(`No package.json found in ${rootDir}`);
  }

  const deps = getDeps(pkg, production);
  const visited = new Set<string>();
  const stack = new Set<string>();
  const circular: CircularResult[] = [];
  const allDeps = new Set(Object.keys(deps));

  async function buildNode(name: string, depth: number): Promise<GraphNode | null> {
    if (depth > 10) return null;
    const key = `${name}@${depth}`;
    if (stack.has(name)) {
      circular.push({ cycle: [name], files: [] });
      return null;
    }
    if (visited.has(key)) return null;
    visited.add(key);
    stack.add(name);

    const nodePath = join(rootDir, "node_modules", name);
    const nodePkg = readPackageJson(nodePath);
    const version = (nodePkg?.version as string) ?? "unknown";
    const children = nodePkg ? getDeps(nodePkg, production) : {};
    const dependencies: GraphNode[] = [];

    for (const child of Object.keys(children)) {
      const childNode = await buildNode(child, depth + 1);
      if (childNode) dependencies.push(childNode);
    }

    stack.delete(name);
    return { name, version, path: nodePath, depth, dependencies };
  }

  const graph: GraphNode[] = [];
  for (const dep of Object.keys(deps)) {
    const node = await buildNode(dep, 0);
    if (node) graph.push(node);
  }

  const usedInGraph = new Set<string>();
  function collectNames(nodes: GraphNode[]) {
    for (const n of nodes) {
      usedInGraph.add(n.name);
      collectNames(n.dependencies);
    }
  }
  collectNames(graph);

  const unused: UnusedResult[] = [];
  for (const dep of allDeps) {
    if (!usedInGraph.has(dep)) {
      unused.push({ name: dep, from: rootDir, version: deps[dep] ?? "unknown" });
    }
  }

  return { graph, circular, unused };
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

  function findPath(
    nodes: GraphNode[],
    target: string,
    path: string[],
  ): string[] | null {
    for (const n of nodes) {
      if (n.name === target) return [...path, n.name];
      const found = findPath(n.dependencies, target, [...path, n.name]);
      if (found) return found;
    }
    return null;
  }

  for (const root of result.graph) {
    const p = findPath(root.dependencies, name, [root.name]);
    if (p) {
      return { name, version: "unknown", resolvedBy: p.slice(0, -1), path: p };
    }
  }

  const direct = result.graph.find((n) => n.name === name);
  if (direct) {
    return { name, version: direct.version, resolvedBy: [], path: [name] };
  }

  return null;
}
