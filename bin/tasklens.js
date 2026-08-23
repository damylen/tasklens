#!/usr/bin/env bun
import { main } from "../src/cli.ts";

main().catch((error) => {
  console.error(`tasklens: ${error?.message ?? error}`);
  process.exit(1);
});
