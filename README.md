# spyglass

> Dependency graph visualizer for monorepos and JS/TS projects.

**Stack:** TypeScript, Ink (terminal UI), npm-published CLI + library

📖 **Documentation:** [linuxctrl-docs.vercel.app/docs/spyglass](https://linuxctrl-docs.vercel.app/docs/spyglass)

```
npm install -g @linuxctrl/spyglass
spyglass graph                  # Interactive terminal tree
spyglass circular               # Find circular dependencies
spyglass unused                 # Find unused dependencies
spyglass why react              # Show why react is in your tree
```

- Works with npm, yarn, pnpm, bun workspaces.
- Terminal TUI shows zoomable tree with color-coded depths.
- Library: `import { parseGraph, findCircular, findUnused, why } from '@linuxctrl/spyglass'`.
