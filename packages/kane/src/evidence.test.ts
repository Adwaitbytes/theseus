import { mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { fixture, tempDir } from "./__fixtures__/helpers.js";
import { extractEvidence, locatePack, packPathFromStderr } from "./evidence.js";
import { openPack } from "./pack.js";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PNG_A = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
const PNG_B = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 2]);
const JPG_C = new Uint8Array([0xff, 0xd8, 0xff, 3]);
const JPG_D = new Uint8Array([0xff, 0xd8, 0xff, 4]);

const T = "tests/add-a-todo-1234abcd";
const syntheticPack: Record<string, Uint8Array> = {
  "run.yaml": strToU8("title: add a todo\nstatus: failed\n"),
  "failure.yaml": strToU8(
    `failures:\n  - test: add-a-todo-1234abcd\n    ordinal: 2\n    step: 0-2\n    status: failed\n    path: ${T}/steps/2-0-2/failure.yaml\n`,
  ),
  [`${T}/result.yaml`]: strToU8("executed_by:\n  email: someone@example.com\n  user_name: someone\n  org_id: 42\n"),
  [`${T}/logs/tui.log`]: strToU8("signed in as someone@example.com\n"),
  [`${T}/steps/1-0-1/screenshot.jpg`]: JPG_C,
  [`${T}/steps/2-0-2/screenshot.jpg`]: JPG_D,
  [`${T}/steps/2-0-2/annotated.png`]: PNG_A,
  [`${T}/steps/2-0-2/failure.yaml`]: strToU8(
    "step: 0-2\nstatus: failed\nerror:\n  message: button missing\ntriage:\n  rca:\n    root_cause: The Add button is not rendered.\n    category: product_bug/missing_element\n  suggested_fix:\n    summary: Render the Add button.\n",
  ),
  [`${T}/steps/3-0-3/screenshot.png`]: PNG_B,
};

function writeZip(dir: string, files: Record<string, Uint8Array>): string {
  const file = path.join(dir, "pack.evidence");
  writeFileSync(file, zipSync(files));
  return file;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(d.parentPath, d.name));
}

describe("packPathFromStderr", () => {
  it("reads the last hint and ignores other evidence lines", () => {
    const stderr = [
      "Running on: Desktop · Chrome",
      "evidence: 1 status_disagrees advisory(ies)",
      "evidence: view locally with `kane-cli evidence serve /a/first.evidence`",
      "evidence: view locally with `kane-cli evidence serve /b/with space.evidence`",
    ].join("\n");
    expect(packPathFromStderr(stderr)).toBe("/b/with space.evidence");
    expect(packPathFromStderr("nothing here")).toBeUndefined();
  });
});

describe("locatePack", () => {
  it("falls back from the hint to the coverage event to the newest pack in the session", async () => {
    const dir = tempDir();
    const evidenceDir = path.join(dir, "session", "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const older = path.join(evidenceDir, "old.evidence");
    const newer = path.join(evidenceDir, "new.evidence");
    writeFileSync(older, "x");
    writeFileSync(newer, "y");
    utimesSync(older, new Date(1_000), new Date(1_000));

    const hinted = `evidence: view locally with \`kane-cli evidence serve ${older}\``;
    expect(await locatePack({ stderr: hinted, cwd: dir })).toBe(older);
    expect(await locatePack({ stderr: "", coveragePack: older, cwd: dir })).toBe(older);
    expect(await locatePack({ stderr: "", sessionDir: path.join(dir, "session"), cwd: dir })).toBe(newer);
    expect(await locatePack({ stderr: "", cwd: dir })).toBeUndefined();
  });
});

describe("openPack", () => {
  it("reads zips and directories through the same interface", async () => {
    const dir = tempDir();
    const zipped = await openPack(writeZip(dir, syntheticPack));
    const unpacked = path.join(dir, "unpacked");
    for (const [entry, bytes] of Object.entries(syntheticPack)) {
      mkdirSync(path.dirname(path.join(unpacked, entry)), { recursive: true });
      writeFileSync(path.join(unpacked, entry), bytes);
    }
    const directory = await openPack(unpacked);
    expect([...zipped.entries].sort()).toEqual([...directory.entries].sort());
    expect(await zipped.read(`${T}/steps/2-0-2/annotated.png`)).toEqual(PNG_A);
    expect(await directory.read(`${T}/steps/2-0-2/annotated.png`)).toEqual(PNG_A);
    expect(await zipped.read("missing")).toBeUndefined();
  });
});

describe("extractEvidence", () => {
  it("copies the final and failing screenshots and reads the failure triage", async () => {
    const dir = tempDir();
    const packPath = writeZip(dir, syntheticPack);
    const root = path.join(dir, "voyage");
    const extracted = await extractEvidence({
      packPath,
      failed: true,
      artifactsDir: path.join(root, "artifacts", "run-1"),
      artifactsRoot: root,
      baseName: "add-a-todo",
    });
    expect(extracted.warnings).toEqual([]);
    expect(extracted.artifacts).toEqual({
      finalShot: "artifacts/run-1/add-a-todo-final.png",
      failShot: "artifacts/run-1/add-a-todo-fail.png",
      evidencePack: packPath,
    });
    expect(new Uint8Array(readFileSync(path.join(root, "artifacts/run-1/add-a-todo-final.png")))).toEqual(PNG_B);
    expect(new Uint8Array(readFileSync(path.join(root, "artifacts/run-1/add-a-todo-fail.png")))).toEqual(PNG_A);
    expect(extracted.rca).toEqual({
      rootCause: "[product_bug] The Add button is not rendered.",
      suggestedFix: "Render the Add button.",
    });
  });

  it("never copies personal data out of the pack", async () => {
    const dir = tempDir();
    const artifactsDir = path.join(dir, "voyage", "artifacts");
    for (const failed of [true, false]) {
      await extractEvidence({
        packPath: writeZip(dir, syntheticPack),
        failed,
        artifactsDir,
        artifactsRoot: path.join(dir, "voyage"),
        baseName: failed ? "failed-run" : "passed-run",
      });
    }
    const copied = filesUnder(artifactsDir);
    expect(copied.map((f) => path.basename(f)).sort()).toEqual([
      "failed-run-fail.png",
      "failed-run-final.png",
      "passed-run-final.png",
    ]);
    for (const file of copied) expect(readFileSync(file).toString("latin1")).not.toMatch(EMAIL);
  });

  it("does not point evidencePack at a pack inside the artifacts root", async () => {
    const root = tempDir();
    const extracted = await extractEvidence({
      packPath: writeZip(root, syntheticPack),
      failed: false,
      artifactsDir: path.join(root, "artifacts"),
      artifactsRoot: root,
      baseName: "x",
    });
    expect(extracted.artifacts.evidencePack).toBeUndefined();
  });

  it("returns a warning instead of throwing when the pack is missing or unreadable", async () => {
    const dir = tempDir();
    const missing = await extractEvidence({
      packPath: undefined,
      failed: true,
      artifactsDir: dir,
      artifactsRoot: dir,
      baseName: "x",
    });
    expect(missing.artifacts).toEqual({});
    expect(missing.warnings).toEqual(["Evidence pack not found; no screenshots were saved."]);

    const corrupt = path.join(dir, "corrupt.evidence");
    writeFileSync(corrupt, "not a zip");
    const unreadable = await extractEvidence({
      packPath: corrupt,
      failed: true,
      artifactsDir: path.join(dir, "out"),
      artifactsRoot: dir,
      baseName: "x",
    });
    expect(unreadable.artifacts).toEqual({});
    expect(unreadable.warnings[0]).toMatch(/could not be read/);
  });

  it("extracts from the recorded TodoMVC failure pack (JPG screenshots, automation_bug triage)", async () => {
    const root = tempDir();
    const extracted = await extractEvidence({
      packPath: fixture("real/fail.evidence"),
      failed: true,
      artifactsDir: path.join(root, "artifacts"),
      artifactsRoot: root,
      baseName: "count",
    });
    expect(extracted.warnings).toEqual([]);
    expect(extracted.artifacts).toEqual({
      finalShot: "artifacts/count-final.jpg",
      failShot: "artifacts/count-fail.jpg",
      evidencePack: fixture("real/fail.evidence"),
    });
    expect(extracted.rca?.rootCause).toMatch(/^\[automation_bug\] The test expected one todo to already exist/);
    expect(extracted.rca?.suggestedFix).toMatch(/^Update the expected counter/);
    expect(statSync(path.join(root, "artifacts/count-fail.jpg")).size).toBe(26187);
  });

  it("extracts only the final screenshot from the recorded TodoMVC pass pack", async () => {
    const root = tempDir();
    const extracted = await extractEvidence({
      packPath: fixture("real/pass.evidence"),
      failed: false,
      artifactsDir: path.join(root, "artifacts"),
      artifactsRoot: root,
      baseName: "add",
    });
    expect(extracted.artifacts.finalShot).toBe("artifacts/add-final.jpg");
    expect(extracted.artifacts.failShot).toBeUndefined();
    expect(extracted.rca).toBeUndefined();
  });
});
