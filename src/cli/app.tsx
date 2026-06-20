import React, { useEffect, useState } from "react";
import { Box, Text, Newline } from "ink";
import { parseGraph, why } from "../index";
import type { GraphNode, CircularResult, UnusedResult, WhyResult } from "../index";

interface AppProps {
  command: string;
  options: Record<string, string | boolean>;
}

export function App({ command, options }: AppProps) {
  switch (command) {
    case "graph":
      return React.createElement(GraphView, { options });
    case "circular":
      return React.createElement(CircularView, { options });
    case "unused":
      return React.createElement(UnusedView, { options });
    case "why": {
      const name = (options["_"] as string) ?? (Object.keys(options).find((k) => k !== "path" && k !== "production") ?? "");
      return React.createElement(WhyView, { name, options });
    }
    default:
      return React.createElement(HelpView);
  }
}

function GraphView({ options }: { options: Record<string, string | boolean> }) {
  const [data, setData] = useState<{ graph: GraphNode[]; error?: string }>({ graph: [] });

  useEffect(() => {
    parseGraph({
      path: (options.path as string) || undefined,
      production: options.production === true,
    })
      .then((result) => setData({ graph: result.graph }))
      .catch((err) => setData({ graph: [], error: err.message }));
  }, []);

  if (data.error) {
    return React.createElement(
      Box,
      { flexDirection: "column", paddingX: 2, paddingY: 1 },
      React.createElement(Text, { color: "red" }, "✖ ", data.error),
    );
  }

  function renderNode(node: GraphNode, depth: number = 0): React.ReactNode[] {
    const indent = "  ".repeat(depth);
    const prefix = depth === 0 ? "●" : "‧";
    const color = depth === 0 ? "cyan" : depth === 1 ? "yellow" : "green";

    const children = node.dependencies.flatMap((c) => renderNode(c, depth + 1));
    return [
      React.createElement(
        Box,
        { key: node.name + depth },
        React.createElement(Text, { dimColor: true }, indent),
        React.createElement(Text, { color }, ` ${prefix} ${node.name}`),
        React.createElement(Text, { dimColor: true }, ` ${node.version}`),
      ),
      ...children,
    ];
  }

  return React.createElement(
    Box,
    { flexDirection: "column", paddingX: 2, paddingY: 1 },
    React.createElement(
      Text,
      { bold: true },
      `Dependency graph (${data.graph.length} roots)`,
    ),
    React.createElement(Newline),
    ...data.graph.flatMap((node) => renderNode(node)),
  );
}

function CircularView({ options }: { options: Record<string, string | boolean> }) {
  const [results, setResults] = useState<CircularResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    parseGraph({
      path: (options.path as string) || undefined,
      production: options.production === true,
    })
      .then((r) => {
        if (r.circular.length === 0) {
          setResults([{ cycle: ["No circular dependencies found"], files: [] }]);
        } else {
          setResults(r.circular);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return React.createElement(Box, { paddingX: 2, paddingY: 1 },
      React.createElement(Text, { color: "red" }, "✖ ", error),
    );
  }

  return React.createElement(
    Box,
    { flexDirection: "column", paddingX: 2, paddingY: 1 },
    React.createElement(Text, { bold: true, color: "yellow" }, "Circular Dependencies"),
    React.createElement(Newline),
    ...results.map((r, i) =>
      React.createElement(
        Box,
        { key: i, flexDirection: "column" },
        React.createElement(Text, { color: "red" }, `  ${r.cycle.join(" → ")}`),
      ),
    ),
  );
}

function UnusedView({ options }: { options: Record<string, string | boolean> }) {
  const [results, setResults] = useState<UnusedResult[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    parseGraph({
      path: (options.path as string) || undefined,
      production: options.production === true,
    })
      .then((r) => setResults(r.unused))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return React.createElement(Box, { paddingX: 2, paddingY: 1 },
      React.createElement(Text, { color: "red" }, "✖ ", error),
    );
  }

  if (results.length === 0) {
    return React.createElement(Box, { paddingX: 2, paddingY: 1 },
      React.createElement(Text, { color: "green" }, "✓ No unused dependencies"),
    );
  }

  return React.createElement(
    Box,
    { flexDirection: "column", paddingX: 2, paddingY: 1 },
    React.createElement(Text, { bold: true, color: "yellow" }, `Unused Dependencies (${results.length})`),
    React.createElement(Newline),
    ...results.map((r, i) =>
      React.createElement(
        Box,
        { key: i },
        React.createElement(Text, { color: "red" }, "  ✖ "),
        React.createElement(Text, null, r.name),
        React.createElement(Text, { dimColor: true }, ` ${r.version}`),
      ),
    ),
  );
}

function WhyView({ name, options }: { name: string; options: Record<string, string | boolean> }) {
  const [result, setResult] = useState<WhyResult | null | "loading">("loading");

  useEffect(() => {
    if (!name) {
      setResult(null);
      return;
    }
    why(name, {
      path: (options.path as string) || undefined,
      production: options.production === true,
    })
      .then((r: WhyResult | null) => setResult(r))
      .catch(() => setResult(null));
  }, [name]);

  if (!name) {
    return React.createElement(Box, { paddingX: 2, paddingY: 1 },
      React.createElement(Text, { color: "red" }, "Usage: spyglass why <package-name>"),
    );
  }

  if (result === "loading") {
    return React.createElement(Box, { paddingX: 2, paddingY: 1 },
      React.createElement(Text, { dimColor: true }, "Scanning..."),
    );
  }

  if (!result) {
    return React.createElement(Box, { paddingX: 2, paddingY: 1 },
      React.createElement(Text, { color: "yellow" }, `? ${name} not found in dependency tree`),
    );
  }

  return React.createElement(
    Box,
    { flexDirection: "column", paddingX: 2, paddingY: 1 },
    React.createElement(Text, { bold: true }, `Why ${name} is in your tree`),
    React.createElement(Newline),
    React.createElement(Text, null, "  Resolution path:"),
    ...result.path.map((p, i) =>
      React.createElement(
        Box,
        { key: i, marginLeft: 2 },
        React.createElement(Text, { dimColor: true }, "  ".repeat(i)),
        React.createElement(Text, { color: "cyan" }, "└─ "),
        React.createElement(Text, null, p),
      ),
    ),
  );
}

function HelpView() {
  return React.createElement(
    Box,
    { flexDirection: "column", paddingX: 2, paddingY: 1 },
    React.createElement(Text, { bold: true }, "spyglass — Dependency Graph Visualizer"),
    React.createElement(Newline),
    React.createElement(Text, { bold: true }, "Commands:"),
    React.createElement(Text, null, "  spyglass graph                Interactive tree view"),
    React.createElement(Text, null, "  spyglass circular             Find circular deps"),
    React.createElement(Text, null, "  spyglass unused               Find unused deps"),
    React.createElement(Text, null, "  spyglass why <pkg>            Show why pkg is in tree"),
    React.createElement(Newline),
    React.createElement(Text, { bold: true }, "Options:"),
    React.createElement(Text, null, "  --path <dir>                 Root project directory"),
    React.createElement(Text, null, "  --production                 Only check dependencies"),
  );
}
