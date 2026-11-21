import { mkdtemp, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureIsolatedCodexHome } from "./codex-home.js";

describe("ensureIsolatedCodexHome", () => {
  it("links the existing sign-in, writes a clean config and is idempotent", async () => {
    const user = await mkdtemp(join(tmpdir(), "theseus-user-"));
    await mkdir(join(user, ".codex"));
    await writeFile(join(user, ".codex", "auth.json"), "{}");
    const home = await ensureIsolatedCodexHome(user);
    expect(await ensureIsolatedCodexHome(user)).toBe(home);
    expect(await readlink(join(home, "auth.json"))).toBe(join(user, ".codex", "auth.json"));
    expect(await readFile(join(home, "config.toml"), "utf8")).not.toContain("multi_agent");
  });
});
