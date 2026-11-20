#!/usr/bin/env node
import { errorMessage } from "@theseus/core";
import { exitCodeFor } from "./commands.js";
import { buildProgram } from "./program.js";

let exitCode = 0;
const program = buildProgram((code) => {
  exitCode = code;
});

try {
  await program.parseAsync(process.argv);
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`theseus: ${errorMessage(error)}\n`);
  process.exitCode = exitCodeFor(error);
}
