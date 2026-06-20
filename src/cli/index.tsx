#!/usr/bin/env node

import { parseGraph, why } from "../index";
import type { GraphNode, CircularResult, UnusedResult, WhyResult } from "../index";

const args = process.argv.slice(2);
const command = args[0];

const options: Record<string, string | boolean> = {};
for (let i = 1; i < args.length; i++) {
  const arg = args[i]!;
  if (arg.startsWith("--")) {
    const key = arg.replace(/^--/, "");
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      i++;
    } else {
      options[key] = true;
    }
  }
}

async function main() {
  const opts = {
    path: (options.path as string) || undefined,
    production: options.production === true,
    npm: options["no-npm"] !== true,
  };

  try {
    switch (command) {
      case "graph": {
        const result = await parseGraph(opts);
        printGraph(result.tree, result.summary);
        break;
      }
      case "circular": {
        const result = await parseGraph({ ...opts, npm: false });
        printCircular(result.circular);
        break;
      }
      case "unused": {
        const result = await parseGraph(opts);
        printUnused(result.unused);
        break;
      }
      case "why": {
        const name = args[1];
        if (!name) {
          console.error("Usage: spyglass why <package-name>");
          process.exit(1);
        }
        const result = await why(name, opts);
        printWhy(result);
        break;
      }
      default:
        printHelp();
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  }
}

function printGraph(tree: GraphNode[], summary: { total: number; outdated: number; diskSize: string }) {
  if (tree.length === 0) {
    console.log("No dependencies found.");
    return;
  }

  console.log(`\n  ${bold("spyglass")} — Dependency Graph`);
  console.log(`  ${dim("─".repeat(50))}\n`);

  for (const node of tree) {
    printNode(node, "");
  }

  // Summary panel
  console.log(`\n  ${dim("─".repeat(50))}`);
  console.log(`  ${bold("Summary")}`);
  console.log(`  ${dim("Packages:")}   ${tree.length} roots, ${summary.total} total`);
  console.log(`  ${dim("Disk:")}       ${summary.diskSize}`);
  if (summary.outdated > 0) {
    console.log(`  ${dim("Outdated:")}   ${yellow(String(summary.outdated))}`);
  } else {
    console.log(`  ${dim("Outdated:")}   0`);
  }
  console.log();
}

function printNode(node: GraphNode, prefix: string) {
  const isLast = node === node.children[node.children.length - 1];
  const connector = prefix === "" ? "" : (isLast ? "  └── " : "  ├── ");
  const childPrefix = prefix === "" ? "" : (isLast ? "     " : "  │  ");

  const label = prefix === ""
    ? `  ● ${node.name}`
    : `${connector}${node.name}`;

  const versionStr = dim(node.version);
  const outdated = node.info?.outdated ? ` ${yellow("(! " + (node.info?.latest ?? "") + " available)")}` : "";
  const downloads = node.info?.weeklyDownloads !== undefined
    ? ` ${dim(formatDownloads(node.info.weeklyDownloads) + "/wk")}`
    : "";
  const size = node.info?.diskSize ? ` ${dim(node.info.diskSize)}` : "";

  console.log(`  ${prefix}${label} ${versionStr}${downloads}${size}${outdated}`);

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!;
    const childIsLast = i === node.children.length - 1;
    const nextPrefix = prefix === ""
      ? (childIsLast ? "   " : "  │")
      : (isLast ? prefix + "    " : prefix + "  │ ");

    printNode(child, nextPrefix);
  }
}

function printCircular(cycles: CircularResult[]) {
  if (cycles.length === 0) {
    console.log("\n  No circular dependencies found.\n");
    return;
  }
  console.log(`\n  ${bold("spyglass")} — Circular Dependencies`);
  console.log(`  ${dim("─".repeat(50))}\n`);
  for (const cycle of cycles) {
    console.log(`  ${red("⚠")}  ${cycle.chain.join(" → ")}`);
  }
  console.log();
}

function printUnused(unused: UnusedResult[]) {
  if (unused.length === 0) {
    console.log("\n  No unused dependencies found.\n");
    return;
  }
  console.log(`\n  ${bold("spyglass")} — Unused Dependencies`);
  console.log(`  ${dim("─".repeat(50))}\n`);
  for (const dep of unused) {
    const downloads = dep.info?.weeklyDownloads !== undefined
      ? ` ${dim(formatDownloads(dep.info.weeklyDownloads) + "/wk")}`
      : "";
    console.log(`  ${yellow("✖")}  ${dep.name} ${dim(dep.version)}${downloads}`);
  }
  console.log();
}

function printWhy(result: WhyResult | null) {
  if (!result) {
    console.log("\n  Package not found in dependency tree.\n");
    return;
  }
  console.log(`\n  ${bold("spyglass")} — Why ${result.name}?`);
  console.log(`  ${dim("─".repeat(50))}\n`);

  for (let i = 0; i < result.path.length; i++) {
    const isLast = i === result.path.length - 1;
    const indent = "     ".repeat(i);
    const joiner = isLast ? "  └── " : "  ├── ";
    const name = result.path[i];
    if (isLast) {
      const version = result.version ? ` ${dim(result.version)}` : "";
      const outdated = result.info?.outdated ? ` ${yellow("(" + (result.info?.latest ?? "") + " available)")}` : "";
      console.log(`  ${indent}${joiner}${name}${version}${outdated}`);
    } else {
      console.log(`  ${indent}${joiner}${name}`);
    }
  }

  if (result.info?.description) {
    console.log(`\n  ${dim(result.info.description)}`);
  }
  if (result.info?.weeklyDownloads !== undefined) {
    console.log(`  ${dim(formatDownloads(result.info.weeklyDownloads) + " weekly downloads")}`);
  }
  console.log();
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[22m`;
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[22m`;
}

function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[39m`;
}

function red(s: string): string {
  return `\x1b[31m${s}\x1b[39m`;
}

function printHelp() {
  console.log(`
  ${bold("spyglass")} — Dependency Graph Visualizer

  ${bold("Commands:")}
    graph                    Show dependency tree with npm info
    circular                 Find circular dependencies
    unused                   Find unused dependencies
    why <package>            Show why a package is in the tree

  ${bold("Options:")}
    --path <dir>             Root project directory
    --production             Only check dependencies
    --no-npm                 Skip npm registry lookups (faster)
`);
}

main();
