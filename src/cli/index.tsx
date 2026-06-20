#!/usr/bin/env bun

import { render } from "ink";
import React from "react";
import { App } from "./app";

const args = process.argv.slice(2);
const command = args[0] ?? "graph";

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

const { waitUntilExit } = render(
  React.createElement(App, { command: command as string, options }),
);

await waitUntilExit();
