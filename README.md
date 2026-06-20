# spyglass

> Dependency graph visualizer for monorepos and JS/TS projects.

**Stack:** TypeScript, Ink (terminal UI), d3-force (for HTML export), npm-published CLI + library

```
npm install -g spyglass
spyglass graph                  # Interactive terminal tree
spyglass graph --html           # Export interactive HTML graph
spyglass circular               # Find circular dependencies
spyglass unused                 # Find unused dependencies
spyglass why react              # Show why react is in your tree
```

- Works with npm, yarn, pnpm, bun workspaces.
- Terminal TUI shows zoomable tree with color-coded depths.
- HTML export for sharing on CI/PRs.
- Library: `import { parseGraph, findCircular } from 'spyglass'`.
