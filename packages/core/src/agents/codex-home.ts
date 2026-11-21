import { mkdir, readlink, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG = `# Written by Theseus. Builders run in this isolated Codex home so personal plugins,
# MCP servers, skills and config rewrites from other tools cannot change or break a build.
model = "gpt-5.6-terra"
model_reasoning_effort = "medium"
`;

/**
 * Prepares an isolated CODEX_HOME that reuses the user's existing Codex sign-in by linking
 * auth.json (the credential never moves or gets copied) and otherwise starts from a clean config.
 */
export async function ensureIsolatedCodexHome(userHome: string = homedir()): Promise<string> {
  const home = join(userHome, ".theseus", "codex-home");
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "config.toml"), CONFIG, "utf8");
  const authLink = join(home, "auth.json");
  const authSource = join(userHome, ".codex", "auth.json");
  try {
    if ((await readlink(authLink)) === authSource) return home;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await symlink(authSource, authLink);
  }
  return home;
}
