import { Command, InvalidArgumentError, Option } from "commander";
import { AgentName, PHASES, STACK_PRESETS, TheseusError, type PhaseName, type RegrowRequest } from "@theseus/core";
import { demo, interruptSignal, runPhases, serve, type PhaseOptions } from "./commands.js";
import { doctor } from "./doctor.js";
import { suite } from "./suite.js";
import { verify } from "./verify.js";
import { init, regrowUrl } from "./zero-config.js";

function parsePositive(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new InvalidArgumentError("expected a positive number");
  return number;
}

function parseCount(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new InvalidArgumentError("expected a whole number of 1 or more");
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

function parseAgent(value: string): AgentName {
  const parsed = AgentName.safeParse(value);
  if (!parsed.success) throw new InvalidArgumentError(`expected one of ${AgentName.options.join(", ")}`);
  return parsed.data;
}

function parseAgentList(value: string): AgentName[] {
  return value.split(",").map((item) => parseAgent(item.trim()));
}

function parseStacks(value: string, previous: string[] = []): string[] {
  const stacks = value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  const known = STACK_PRESETS.map((preset) => preset.id);
  const unknown = stacks.filter((stack) => !known.includes(stack));
  if (unknown.length > 0) throw new InvalidArgumentError(`unknown stack ${unknown.join(", ")}; expected ${known.join(", ")}`);
  return [...previous, ...stacks];
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function examples(lines: readonly string[]): string {
  return `\nExamples:\n${lines.map((line) => `  $ ${line}`).join("\n")}\n`;
}

interface RawPhaseOptions {
  json?: boolean;
  forcePhase?: PhaseName[];
  force?: boolean;
  target?: string[];
  redraft?: boolean;
}

interface RawRegrowOptions extends RawPhaseOptions {
  to?: string[];
  agent?: AgentName;
  race?: AgentName[];
  docs?: string[];
  name?: string;
  budget?: number;
  rounds?: number;
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

function regrowRequest(url: string, raw: RawRegrowOptions): RegrowRequest {
  if (raw.to === undefined || raw.to.length === 0) {
    throw new TheseusError("config-invalid", `--to <stacks> is required with a URL, e.g. --to nextjs,sveltekit`);
  }
  return {
    url,
    to: raw.to,
    ...(raw.agent === undefined ? {} : { agent: raw.agent }),
    ...(raw.race === undefined ? {} : { race: raw.race }),
    ...(raw.docs === undefined ? {} : { docs: raw.docs }),
    ...(raw.name === undefined ? {} : { name: raw.name }),
    ...(raw.budget === undefined ? {} : { budget: raw.budget }),
    ...(raw.rounds === undefined ? {} : { rounds: raw.rounds }),
  };
}

/** Runs a command with Ctrl-C wired to an AbortSignal, so Kane and launched apps stop cleanly. */
async function interruptible(run: (signal: AbortSignal) => Promise<number>): Promise<number> {
  const { signal, dispose } = interruptSignal();
  try {
    return await run(signal);
  } finally {
    dispose();
  }
}

const STACK_LIST = STACK_PRESETS.map((preset) => preset.id).join(", ");

function addSynthesisOptions(command: Command): Command {
  return command
    .option("--to <stacks>", `stacks to regrow into, comma separated (${STACK_LIST})`, parseStacks)
    .option("--agent <agent>", "builder agent for every target: claude-code or codex (default: claude-code)", parseAgent)
    .option("--race <agents>", "regrow each stack once per agent and compare them, e.g. codex,claude-code", parseAgentList)
    .option("--docs <file>", "documentation for the drafting agent; repeatable", collect)
    .option("--name <id>", "voyage id, kebab-case (default: derived from the URL)")
    .option("--budget <credits>", "hard cap on Kane credits for the whole voyage", parsePositive)
    .option("--rounds <n>", "build and verify rounds per target before giving up (default: 5)", parseCount);
}

export function buildProgram(setExitCode: (code: number) => void): Command {
  const program = new Command()
    .name("theseus")
    .description("Delete an app's code and regrow it in any stack while Kane CLI proves every behavior matches the original.")
    .version("0.1.0")
    .showHelpAfterError()
    .addHelpText(
      "after",
      examples([
        "theseus doctor",
        "theseus regrow http://localhost:4170 --to nextjs,sveltekit,expo-android,expo-ios",
        "theseus verify runs/localhost-4170 --behavior add-todo --target nextjs",
        "theseus suite runs/localhost-4170 --target nextjs --parallel 4",
      ]),
    );

  const json = (): Option => new Option("--json", "print machine-readable output (NDJSON events for voyages) instead of the live view");

  addSynthesisOptions(
    program
      .command("regrow")
      .summary("Regrow a running app into new stacks and prove parity")
      .description(
        [
          "Regrow a running app into new stacks and prove parity with Kane.",
          "",
          "With a URL, Theseus builds the config from your flags, saves it under .theseus/configs/,",
          "and runs the whole voyage: capture, baseline, strength, regrow, parity. Run it again to resume.",
          "With a config file, it regrows only the targets named by --target.",
        ].join("\n"),
      )
      .argument("<url|config>", "URL of the running original, or a theseus.config.json"),
  )
    .option("--target <id>", "with a config: regrow only this target; repeatable", collect)
    .option("--force", "with a config: start the targets over from empty clean rooms")
    .option("--no-redraft", "do not let the drafting agent rewrite behaviors Kane blames on the test")
    .addOption(json())
    .addHelpText(
      "after",
      examples([
        "theseus regrow http://localhost:4170 --to nextjs,sveltekit,expo-android,expo-ios",
        "theseus regrow http://localhost:4170 --to nextjs --race codex,claude-code --budget 3000",
        "theseus regrow https://app.example.com --to sveltekit --agent codex --docs docs/spec.md --name billing",
        "theseus regrow theseus.config.json --target nextjs",
      ]),
    )
    .action(async (input: string, raw: RawRegrowOptions) => {
      if (isUrl(input)) {
        setExitCode(await regrowUrl(regrowRequest(input, raw), phaseOptions(raw)));
        return;
      }
      if (raw.target === undefined) throw new TheseusError("config-invalid", "--target <id> is required with a config file; pass a URL to regrow everything");
      setExitCode(await runPhases(input, ["regrow"], phaseOptions(raw, "regrow")));
    });

  addSynthesisOptions(
    program
      .command("init")
      .summary("Write a config file from flags, without running anything")
      .description("Write the config `theseus regrow <url>` would run, so you can review and edit it first.")
      .argument("<url>", "URL of the running original"),
  )
    .option("--out <file>", "where to write the config", "theseus.config.json")
    .option("--force", "replace the file if it exists")
    .addHelpText(
      "after",
      examples([
        "theseus init http://localhost:4170 --to nextjs,expo-ios --agent codex",
        "theseus init http://localhost:4170 --to nextjs --race codex,claude-code --out configs/race.json",
      ]),
    )
    .action(async (url: string, raw: RawRegrowOptions & { out: string }) => {
      if (!isUrl(url)) throw new TheseusError("config-invalid", `"${url}" is not an http or https URL`);
      setExitCode(await init(regrowRequest(url, raw), { out: raw.out, ...(raw.force === undefined ? {} : { force: raw.force }) }));
    });

  program
    .command("voyage")
    .summary("Run every phase from a config file")
    .description("Run every phase from a config file: capture, baseline, strength, regrow, parity. Resumes where it stopped.")
    .argument("<config>", "path to theseus.config.json")
    .addOption(json())
    .option("--force-phase <phase>", `redo a completed phase (${PHASES.join(", ")}); repeatable`, parsePhase)
    .option("--target <id>", "regrow only this target; repeatable", collect)
    .option("--no-redraft", "do not let the drafting agent rewrite behaviors Kane blames on the test")
    .addHelpText("after", examples(["theseus voyage theseus.config.json", "theseus voyage theseus.config.json --force-phase parity --target nextjs"]))
    .action(async (config: string, raw: RawPhaseOptions) => setExitCode(await runPhases(config, undefined, phaseOptions(raw))));

  const single: { name: PhaseName; summary: string }[] = [
    { name: "capture", summary: "Crawl the running original and draft behaviors" },
    { name: "baseline", summary: "Run every behavior on the original and keep what passes" },
    { name: "strength", summary: "Plant bugs in a copy of the original and score the spec" },
    { name: "parity", summary: "Compare stored values between the original and each regrown target" },
  ];
  for (const { name, summary } of single) {
    program
      .command(name)
      .summary(summary)
      .description(`${summary}. One phase of \`theseus voyage\`.`)
      .argument("<config>", "path to theseus.config.json")
      .addOption(json())
      .option("--force", `redo ${name} even if it is complete`)
      .option("--target <id>", "limit to this target; repeatable", collect)
      .addHelpText("after", examples([`theseus ${name} theseus.config.json`, `theseus ${name} theseus.config.json --force`]))
      .action(async (config: string, raw: RawPhaseOptions) => setExitCode(await runPhases(config, [name], phaseOptions(raw, name))));
  }

  program
    .command("verify")
    .summary("Re-prove certificate cells live with Kane")
    .description(
      [
        "Re-prove certificate cells live with Kane and show the recorded and fresh outcomes side by side.",
        "Web targets launch from their clean room unless --url is given; mobile targets build unless --app is given.",
        "Exits 1 when any cell no longer matches the certificate.",
      ].join("\n"),
    )
    .argument("<run>", "run directory, e.g. runs/<voyage-id>")
    .requiredOption("--target <id>", "target id, or original")
    .option("--behavior <id>", "the behavior to re-prove")
    .option("--all", "re-prove every behavior on the target")
    .option("--url <url>", "verify a running deployment instead of launching the clean room")
    .option("--app <path>", "verify this .apk or simulator .zip instead of building one")
    .option("--work-dir <dir>", "clean-room root, as in the config's workDir", ".theseus/work")
    .option("--timeout <seconds>", "wall-clock limit per Kane run", parseCount, 300)
    .addOption(json())
    .addHelpText(
      "after",
      examples([
        "theseus verify runs/todomvc-jquery --behavior add-todo --target nextjs",
        "theseus verify runs/todomvc-jquery --behavior add-todo --target original",
        "theseus verify runs/todomvc-jquery --all --target nextjs --url https://todo-next.example.com",
      ]),
    )
    .action(async (run: string, raw: { target: string; behavior?: string; all?: boolean; url?: string; app?: string; workDir: string; timeout: number; json?: boolean }) =>
      setExitCode(await interruptible((signal) => verify(run, raw, undefined, signal))),
    );

  program
    .command("suite")
    .summary("Run a target's committed Kane suite with kane-cli testrun")
    .description(
      [
        "Run a target's committed _test.md suite (runs/<id>/spec/<target>/) with `kane-cli testrun run`.",
        "The files address web targets at http://localhost:3000; pass --url to point them elsewhere.",
      ].join("\n"),
    )
    .argument("<run>", "run directory, e.g. runs/<voyage-id>")
    .requiredOption("--target <id>", "target id, or original")
    .option("--parallel <n>", "Kane workers; mobile suites always use 1", parseCount, 2)
    .option("--url <url>", "run against this deployment instead of http://localhost:3000")
    .option("--app <path>", "run against this .apk or simulator .zip")
    .option("--fail-fast", "stop starting new tests after the first failure")
    .option("--headed", "show the browser instead of running headless")
    .option("--work-dir <dir>", "where suites re-rendered for --url or --app are written", ".theseus/work")
    .addOption(json())
    .addHelpText(
      "after",
      examples([
        "theseus suite runs/todomvc-jquery --target nextjs",
        "theseus suite runs/todomvc-jquery --target nextjs --url https://todo-next.example.com --parallel 4",
        "theseus suite runs/todomvc-jquery --target expo-android --app builds/expo-android.apk",
      ]),
    )
    .action(
      async (
        run: string,
        raw: { target: string; parallel: number; url?: string; app?: string; failFast?: boolean; headed?: boolean; workDir: string; json?: boolean },
      ) => setExitCode(await interruptible((signal) => suite(run, raw, undefined, signal))),
    );

  program
    .command("doctor")
    .summary("Check Node, Kane, builder agents and devices")
    .description("Check that everything a voyage needs is installed and signed in: Node.js, Kane CLI and credits, Codex, Claude Code, and the Android emulator and iOS simulator.")
    .addOption(json())
    .addHelpText("after", examples(["theseus doctor", "theseus doctor --json"]))
    .action(async (options: { json?: boolean }) => setExitCode(await doctor(options)));

  program
    .command("serve")
    .summary("Serve a static directory, such as an original app, on localhost")
    .description("Serve a static directory, such as an original app, on localhost.")
    .argument("<dir>", "directory to serve")
    .option("--port <port>", "port to listen on", parsePort, 4170)
    .option("--host <host>", "interface to bind", "127.0.0.1")
    .addHelpText("after", examples(["theseus serve examples/todomvc-jquery/original --port 4170"]))
    .action(async (dir: string, options: { port: number; host: string }) => setExitCode(await serve(dir, options)));

  program
    .command("demo")
    .summary("Replay a recorded voyage in the live view; needs no credentials")
    .description("Replay a recorded voyage in the live view. Needs no Kane credentials or agents.")
    .argument("[run]", "runs/<voyage-id> or an events.ndjson file (default: newest under ./runs)")
    .option("--speed <n>", "playback speed multiplier", parsePositive, 1)
    .addOption(json())
    .addHelpText("after", examples(["theseus demo", "theseus demo runs/todomvc-jquery --speed 20"]))
    .action(async (run: string | undefined, options: { speed: number; json?: boolean }) => setExitCode(await demo(run, options)));

  return program;
}
