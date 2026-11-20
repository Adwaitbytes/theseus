import { Command, InvalidArgumentError, Option } from "commander";
import { PHASES, type PhaseName } from "@theseus/core";
import { demo, runPhases, serve, type PhaseOptions } from "./commands.js";

function parsePositive(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new InvalidArgumentError("expected a positive number");
  return number;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new InvalidArgumentError("expected a port between 0 and 65535");
  return port;
}

function parsePhase(value: string, previous: PhaseName[] = []): PhaseName[] {
  if (!(PHASES as readonly string[]).includes(value)) throw new InvalidArgumentError(`expected one of ${PHASES.join(", ")}`);
  return [...previous, value as PhaseName];
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

interface RawPhaseOptions {
  json?: boolean;
  forcePhase?: PhaseName[];
  force?: boolean;
  target?: string[];
  redraft?: boolean;
}

function phaseOptions(raw: RawPhaseOptions, phase?: PhaseName): PhaseOptions {
  const force = raw.force === true && phase !== undefined ? [phase] : raw.forcePhase;
  return {
    ...(raw.json === undefined ? {} : { json: raw.json }),
    ...(force === undefined ? {} : { forcePhase: force }),
    ...(raw.target === undefined ? {} : { target: raw.target }),
    ...(raw.redraft === undefined ? {} : { redraft: raw.redraft }),
  };
}

export function buildProgram(setExitCode: (code: number) => void): Command {
  const program = new Command()
    .name("theseus")
    .description("Delete an app's code and regrow it in any stack while Kane CLI proves every behavior matches the original.")
    .version("0.1.0")
    .showHelpAfterError();

  const json = new Option("--json", "print engine events as NDJSON instead of the live view");

  program
    .command("voyage")
    .description("run the whole pipeline: capture, baseline, strength, regrow, parity (resumes where it stopped)")
    .argument("<config>", "path to theseus.config.json")
    .addOption(json)
    .option("--force-phase <phase>", `redo a completed phase (${PHASES.join(", ")}); repeatable`, parsePhase)
    .option("--target <id>", "regrow only this target; repeatable", collect)
    .option("--no-redraft", "do not let the drafting agent rewrite behaviors Kane blames on the test")
    .action(async (config: string, raw: RawPhaseOptions) => setExitCode(await runPhases(config, undefined, phaseOptions(raw))));

  const single: { name: PhaseName; description: string }[] = [
    { name: "capture", description: "crawl the running original and draft behaviors" },
    { name: "baseline", description: "run every behavior on the original; keep what passes" },
    { name: "strength", description: "plant bugs in a copy of the original and score the spec" },
    { name: "parity", description: "compare stored values between the original and each regrown target" },
  ];
  for (const { name, description } of single) {
    program
      .command(name)
      .description(description)
      .argument("<config>", "path to theseus.config.json")
      .addOption(json)
      .option("--force", `redo ${name} even if it is complete`)
      .option("--target <id>", "limit to this target; repeatable", collect)
      .action(async (config: string, raw: RawPhaseOptions) => setExitCode(await runPhases(config, [name], phaseOptions(raw, name))));
  }

  program
    .command("regrow")
    .description("regrow one target in a clean room until Kane proves every behavior")
    .argument("<config>", "path to theseus.config.json")
    .requiredOption("--target <id>", "target id from the config; repeatable", collect)
    .addOption(json)
    .option("--force", "start this target over from an empty clean room")
    .action(async (config: string, raw: RawPhaseOptions) => setExitCode(await runPhases(config, ["regrow"], phaseOptions(raw, "regrow"))));

  program
    .command("serve")
    .description("serve a static directory, such as an original app, on localhost")
    .argument("<dir>", "directory to serve")
    .option("--port <port>", "port to listen on", parsePort, 4170)
    .option("--host <host>", "interface to bind", "127.0.0.1")
    .action(async (dir: string, options: { port: number; host: string }) => setExitCode(await serve(dir, options)));

  program
    .command("demo")
    .description("replay a recorded voyage through the live view; needs no credentials")
    .argument("[run]", "runs/<voyage-id> or an events.ndjson file (default: newest under ./runs)")
    .option("--speed <n>", "playback speed multiplier", parsePositive, 1)
    .addOption(json)
    .action(async (run: string | undefined, options: { speed: number; json?: boolean }) => setExitCode(await demo(run, options)));

  return program;
}
