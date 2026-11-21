import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { errorMessage, type KaneClient } from "@theseus/core";
import { KaneSpawnError, NotLoggedInError, createKaneClient } from "@theseus/kane";
import { loadMobileBuilder } from "./deps.js";
import { plural, stdoutColorizer, type Colorize } from "./output.js";
import { pad } from "./tui/theme.js";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface Check {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** What to run or do to fix it; shown under the check. */
  readonly remedy?: string;
}

export type CommandOutcome =
  | { readonly kind: "ran"; readonly exitCode: number; readonly stdout: string; readonly stderr: string }
  | { readonly kind: "missing" };

/** Every side effect doctor depends on, so each check can be tested without the real tools. */
export interface DoctorProbes {
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
  readonly kane: Pick<KaneClient, "version" | "balance">;
  readonly run: (command: string, args: readonly string[]) => Promise<CommandOutcome>;
  readonly exists: (path: string) => boolean;
  readonly mobileInstalled: () => Promise<boolean>;
}

export const MIN_NODE_MAJOR = 22;
/** Below this a four-target voyage will stop on its budget guard partway through. */
export const LOW_CREDITS = 2_000;
const COMMAND_TIMEOUT_MS = 20_000;

function runCommand(command: string, args: readonly string[]): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    execFile(command, [...args], { timeout: COMMAND_TIMEOUT_MS, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error !== null && "code" in error && error.code === "ENOENT") {
        resolve({ kind: "missing" });
        return;
      }
      const exitCode = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      resolve({ kind: "ran", exitCode, stdout, stderr });
    });
  });
}

export function defaultProbes(): DoctorProbes {
  return {
    nodeVersion: process.versions.node,
    platform: process.platform,
    env: process.env,
    homeDir: homedir(),
    kane: createKaneClient(),
    run: runCommand,
    exists: existsSync,
    mobileInstalled: async () => (await loadMobileBuilder()) !== undefined,
  };
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0]?.trim() ?? "";
}

export function checkNode(version: string): Check {
  const major = Number(version.split(".")[0]);
  return Number.isFinite(major) && major >= MIN_NODE_MAJOR
    ? { name: "Node.js", status: "ok", detail: `v${version}` }
    : { name: "Node.js", status: "fail", detail: `v${version} is too old`, remedy: `Install Node.js ${MIN_NODE_MAJOR} or newer, e.g. nvm install 24` };
}

export async function checkKane(kane: DoctorProbes["kane"]): Promise<Check[]> {
  let version: string;
  try {
    version = await kane.version();
  } catch (error) {
    const missing = error instanceof KaneSpawnError;
    return [
      { name: "Kane CLI", status: "fail", detail: missing ? "not installed" : errorMessage(error), remedy: "npm install -g @testmuai/kane-cli" },
      { name: "Kane sign-in", status: "skip", detail: "needs Kane CLI" },
    ];
  }
  const installed: Check = { name: "Kane CLI", status: "ok", detail: version };
  try {
    const credits = await kane.balance();
    const shown = `${Math.floor(credits).toLocaleString("en-US")} credits`;
    return credits < LOW_CREDITS
      ? [installed, { name: "Kane sign-in", status: "warn", detail: `${shown}, low for a full voyage`, remedy: "Each Kane run costs about 21 credits; set budgetCredits or --budget to stay inside it" }]
      : [installed, { name: "Kane sign-in", status: "ok", detail: shown }];
  } catch (error) {
    if (error instanceof NotLoggedInError) {
      return [installed, { name: "Kane sign-in", status: "fail", detail: "not signed in", remedy: "kane-cli login" }];
    }
    return [installed, { name: "Kane sign-in", status: "fail", detail: errorMessage(error), remedy: "kane-cli whoami" }];
  }
}

export async function checkCodex(probes: DoctorProbes): Promise<Check> {
  const version = await probes.run("codex", ["--version"]);
  if (version.kind === "missing") return { name: "Codex", status: "warn", detail: "not installed", remedy: "npm install -g @openai/codex" };
  const status = await probes.run("codex", ["login", "status"]);
  const label = firstLine(version.stdout);
  if (status.kind === "ran" && status.exitCode === 0) return { name: "Codex", status: "ok", detail: `${label}, ${firstLine(status.stdout || status.stderr).toLowerCase()}` };
  return { name: "Codex", status: "warn", detail: `${label}, not signed in`, remedy: "codex login" };
}

function claudeLoggedIn(stdout: string): boolean {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return typeof parsed === "object" && parsed !== null && "loggedIn" in parsed && parsed.loggedIn === true;
  } catch {
    // Older Claude Code prints prose; any successful exit there means a session exists.
    return stdout.trim().length > 0;
  }
}

export async function checkClaude(probes: DoctorProbes): Promise<Check> {
  const version = await probes.run("claude", ["--version"]);
  if (version.kind === "missing") return { name: "Claude Code", status: "warn", detail: "not installed", remedy: "npm install -g @anthropic-ai/claude-code" };
  const label = firstLine(version.stdout);
  if ((probes.env.ANTHROPIC_API_KEY ?? "").length > 0) return { name: "Claude Code", status: "ok", detail: `${label}, ANTHROPIC_API_KEY set` };
  const status = await probes.run("claude", ["auth", "status"]);
  if (status.kind === "ran" && status.exitCode === 0 && claudeLoggedIn(status.stdout)) return { name: "Claude Code", status: "ok", detail: `${label}, signed in` };
  return { name: "Claude Code", status: "warn", detail: `${label}, not signed in`, remedy: "Run claude and sign in with /login, or set ANTHROPIC_API_KEY" };
}

/** Either agent is optional on its own, but a voyage needs at least one that can build. */
export function requireOneAgent(agents: readonly Check[]): Check[] {
  if (agents.some((check) => check.status === "ok")) return [...agents];
  return agents.map((check) => ({ ...check, status: "fail" as const, detail: `${check.detail}; no builder agent is ready` }));
}

function androidSdk(probes: DoctorProbes): string | undefined {
  const candidates = [probes.env.ANDROID_HOME, probes.env.ANDROID_SDK_ROOT, join(probes.homeDir, "Library", "Android", "sdk")];
  return candidates.find((path): path is string => path !== undefined && path.length > 0 && probes.exists(join(path, "platform-tools", "adb")));
}

export async function checkAndroid(probes: DoctorProbes): Promise<Check> {
  const name = "Android emulator";
  const sdk = androidSdk(probes);
  if (sdk === undefined) {
    return { name, status: "fail", detail: "no Android SDK found", remedy: "Install Android Studio, then set ANDROID_HOME to the SDK (default ~/Library/Android/sdk)" };
  }
  const devices = await probes.run(join(sdk, "platform-tools", "adb"), ["devices"]);
  const running = devices.kind === "ran" ? devices.stdout.split("\n").find((line) => /^emulator-\d+\s+device\b/.test(line.trim())) : undefined;
  if (running !== undefined) return { name, status: "ok", detail: `${running.trim().split(/\s+/)[0] ?? "emulator"} is running` };
  const avds = await probes.run(join(sdk, "emulator", "emulator"), ["-list-avds"]);
  const names = avds.kind === "ran" ? avds.stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("INFO")) : [];
  if (names.length > 0) return { name, status: "ok", detail: `${names[0] ?? "an AVD"} ready, booted on demand` };
  return { name, status: "fail", detail: "no AVD", remedy: "Create an arm64-v8a AVD in Android Studio > Device Manager" };
}

interface SimctlDevice {
  readonly name: string;
  readonly state: string;
  readonly isAvailable?: boolean;
}

function parseSimulators(json: string): SimctlDevice[] {
  try {
    const parsed = JSON.parse(json) as { devices?: Record<string, SimctlDevice[]> };
    return Object.values(parsed.devices ?? {}).flat().filter((device) => device.isAvailable !== false && device.name.startsWith("iPhone"));
  } catch {
    // An unparseable listing is reported as "no simulator", with the remedy to install one.
    return [];
  }
}

export async function checkIos(probes: DoctorProbes): Promise<Check> {
  const name = "iOS simulator";
  if (probes.platform !== "darwin") return { name, status: "skip", detail: "needs macOS" };
  const listing = await probes.run("xcrun", ["simctl", "list", "devices", "available", "--json"]);
  if (listing.kind === "missing" || listing.exitCode !== 0) {
    return { name, status: "fail", detail: "Xcode command line tools not found", remedy: "Install Xcode 16 or newer, then sudo xcode-select -s /Applications/Xcode.app" };
  }
  const simulators = parseSimulators(listing.stdout);
  const booted = simulators.find((device) => device.state === "Booted");
  if (booted !== undefined) return { name, status: "ok", detail: `${booted.name} is booted` };
  const first = simulators[0];
  if (first !== undefined) return { name, status: "ok", detail: `${first.name} ready, booted on demand` };
  return { name, status: "fail", detail: "no iPhone simulator", remedy: "Install an iOS runtime in Xcode > Settings > Components" };
}

export async function runDoctor(probes: DoctorProbes): Promise<Check[]> {
  const [kane, codex, claude, mobile] = await Promise.all([checkKane(probes.kane), checkCodex(probes), checkClaude(probes), probes.mobileInstalled()]);
  const checks: Check[] = [checkNode(probes.nodeVersion), ...kane, ...requireOneAgent([codex, claude])];
  if (!mobile) {
    checks.push({ name: "Mobile targets", status: "skip", detail: "@theseus/mobile is not installed; web targets still work" });
    return checks;
  }
  checks.push(...(await Promise.all([checkAndroid(probes), checkIos(probes)])));
  return checks;
}

const STATUS_TONE = { ok: "pass", warn: "running", fail: "fail", skip: "muted" } as const;

export function renderChecks(checks: readonly Check[], color: Colorize): string {
  const lines = ["Theseus doctor", ""];
  for (const check of checks) {
    lines.push(`  ${color(pad(check.status, 6), STATUS_TONE[check.status], check.status === "fail")}${pad(check.name, 20)}${color(check.detail, check.status === "skip" ? "muted" : undefined)}`);
    if (check.remedy !== undefined && check.status !== "ok") lines.push(color(`${" ".repeat(28)}${check.remedy}`, "muted"));
  }
  const failed = checks.filter((check) => check.status === "fail").length;
  const warned = checks.filter((check) => check.status === "warn").length;
  lines.push("");
  if (failed > 0) lines.push(color(`${plural(failed, "problem")} to fix before a voyage.`, "fail"));
  else if (warned > 0) lines.push(color(`Ready, with ${plural(warned, "warning")}.`, "running"));
  else lines.push(color("Ready for a voyage.", "pass"));
  return `${lines.join("\n")}\n`;
}

/** `theseus doctor`: exits 1 when anything a voyage needs is missing. */
export async function doctor(
  options: { readonly json?: boolean },
  probes: DoctorProbes = defaultProbes(),
  write: (text: string) => void = (text) => process.stdout.write(text),
  color: Colorize = stdoutColorizer(),
): Promise<number> {
  const checks = await runDoctor(probes);
  write(options.json === true ? `${JSON.stringify(checks, null, 2)}\n` : renderChecks(checks, color));
  return checks.some((check) => check.status === "fail") ? 1 : 0;
}
