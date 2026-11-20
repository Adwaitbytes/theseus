#!/usr/bin/env node
// Stand-in for kane-cli in process tests. Behaviour comes from the JSON file named by FAKE_KANE_SCENARIO:
// { stdoutFile?, stdout?, stderr?, exitCode?, chunkSize?, hang?, grandchildPidFile?, argsFile?,
//   counterFile?, infraFailures? }
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const scenarioPath = process.env.FAKE_KANE_SCENARIO;
if (!scenarioPath) {
  process.stderr.write("FAKE_KANE_SCENARIO is not set\n");
  process.exit(64);
}
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));

if (scenario.argsFile) {
  writeFileSync(scenario.argsFile, JSON.stringify({ args: process.argv.slice(2), env: { KANE_CLI_USER_AGENT: process.env.KANE_CLI_USER_AGENT ?? null }, stdinIsTTY: Boolean(process.stdin.isTTY) }));
}

if (scenario.counterFile) {
  const count = existsSync(scenario.counterFile) ? Number(readFileSync(scenario.counterFile, "utf8")) + 1 : 1;
  writeFileSync(scenario.counterFile, String(count));
  if (count <= (scenario.infraFailures ?? 0)) {
    process.stdout.write('{"type":"error","message":"Chrome failed to launch"}\n');
    process.stderr.write("error: Chrome failed to launch\n");
    process.exit(2);
  }
}

if (scenario.hang) {
  if (scenario.grandchildPidFile) {
    // Mirrors kane-cli's launcher, which re-spawns itself: the grandchild must die with the group.
    const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    writeFileSync(scenario.grandchildPidFile, String(grandchild.pid));
  }
  process.stdout.write('{"step":1,"status":"running","remark":"Step 1"}\n');
  setInterval(() => {}, 1000);
} else {
  const text = scenario.stdoutFile ? readFileSync(scenario.stdoutFile, "utf8") : (scenario.stdout ?? "");
  const size = scenario.chunkSize ?? text.length;
  const chunks = [];
  for (let i = 0; i < text.length; i += Math.max(1, size)) chunks.push(text.slice(i, i + size));
  const writeNext = () => {
    const chunk = chunks.shift();
    if (chunk === undefined) {
      if (scenario.stderr) process.stderr.write(scenario.stderr);
      process.exitCode = scenario.exitCode ?? 0;
      return;
    }
    process.stdout.write(chunk, () => setTimeout(writeNext, 1));
  };
  writeNext();
}
