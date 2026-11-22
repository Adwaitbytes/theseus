// Generates the temporary voiceover (one WAV per sentence, local Kokoro TTS via `hyperframes tts`)
// and writes launch/video/hf/assets/vo/lines.json with every line's measured duration.
// Usage: HYPERFRAMES_PYTHON=<python with kokoro-onnx> node launch/video/scripts/voiceover.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const videoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = join(videoDir, "hf");
const outDir = join(projectDir, "assets", "vo");
const vo = JSON.parse(readFileSync(join(videoDir, "vo.json"), "utf8"));

function durationOf(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number.parseFloat(out.toString().trim());
  if (!Number.isFinite(seconds)) throw new Error(`no duration for ${file}`);
  return seconds;
}

mkdirSync(outDir, { recursive: true });
const lines = [];
for (const scene of vo.scenes) {
  scene.lines.forEach((text, index) => {
    const hash = createHash("sha1").update(`${vo.voice}|${vo.speed}|${text}`).digest("hex").slice(0, 8);
    const file = `voiceover-temp-${scene.id}-${index + 1}-${hash}.wav`;
    const path = join(outDir, file);
    if (!existsSync(path)) {
      execFileSync("npx", ["hyperframes", "tts", text, "-v", vo.voice, "-s", String(vo.speed), "-o", path, "--json"], {
        stdio: ["ignore", "ignore", "inherit"],
      });
    }
    lines.push({ scene: scene.id, index, text, src: `assets/vo/${file}`, duration: Number(durationOf(path).toFixed(3)) });
  });
}
writeFileSync(join(outDir, "lines.json"), `${JSON.stringify(lines, null, 2)}\n`);
for (const scene of vo.scenes) {
  const total = lines.filter((l) => l.scene === scene.id).reduce((sum, l) => sum + l.duration, 0);
  console.log(`${scene.id.padEnd(12)} ${total.toFixed(2)}s`);
}
console.log(`total ${lines.reduce((sum, l) => sum + l.duration, 0).toFixed(2)}s over ${lines.length} lines`);
