// Copies committed Kane evidence (runs/<id>/artifacts) into public/evidence/<id>/artifacts
// so screenshots ship with the static export. Fixture voyages have no artifacts by design.
import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runsDir = resolve(webDir, "../../runs");
const outDir = join(webDir, "public", "evidence");

rmSync(outDir, { recursive: true, force: true });

if (!existsSync(runsDir)) {
  console.log("sync-evidence: no runs/ directory, nothing to copy");
  process.exit(0);
}

let copied = 0;
for (const id of readdirSync(runsDir)) {
  const artifacts = join(runsDir, id, "artifacts");
  if (!existsSync(artifacts) || !statSync(artifacts).isDirectory()) continue;
  cpSync(artifacts, join(outDir, id, "artifacts"), {
    recursive: true,
    filter: (src) => statSync(src).isDirectory() || /\.(png|jpe?g|webp|gif|md|json|zip)$/i.test(src),
  });
  copied++;
}
console.log(`sync-evidence: copied artifacts for ${copied} voyage(s)`);
