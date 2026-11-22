// Generates the voiceover: one WAV per caption line with local Kokoro TTS (`hyperframes tts`),
// spoken from a phonetic rewrite of the caption, loudness-normalized to -16 LUFS, then transcribed
// back with local Whisper and compared word by word against the spoken text.
// Writes launch/video/hf/assets/vo/lines.json and prints any line whose transcript differs.
// Usage: HYPERFRAMES_PYTHON=<python with kokoro-onnx> node launch/video/scripts/voiceover.mjs [--no-check]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const videoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(videoDir, "hf", "assets", "vo");
const checkDir = join(videoDir, "hf", ".hyperframes", "vo-check");
const vo = JSON.parse(readFileSync(join(videoDir, "vo.json"), "utf8"));
const runCheck = !process.argv.includes("--no-check");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function spoken(caption) {
  return vo.pronounce.reduce((text, [from, to]) => text.replace(new RegExp(`(?<![\\w-])${escapeRe(from)}(?![\\w-])`, "g"), to), caption);
}

function durationOf(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number.parseFloat(out.toString().trim());
  if (!Number.isFinite(seconds)) throw new Error(`no duration for ${file}`);
  return seconds;
}

// Whisper hears the phonetic spellings as the real words, so compare on a shared normal form.
const HEARD = [[/\bkaincl i\b/g, "kane cli"], [/\b(kain|cain|cane)\b/g, "kane"], [/\b(kain|cain|cane)s\b/g, "kanes"], [/\btheeseeus\b/g, "theseus"], [/\bto dos\b/g, "todos"], [/\btest moo\b/g, "testmu"], [/\bc l i\b/g, "cli"], [/\bj s\b/g, "js"], [/\bm v c\b/g, "mvc"], [/\bex ?po\b/g, "expo"], [/\bcode ?ex\b/g, "codex"], [/\bthee ?see ?us\b/g, "theseus"], [/\bsvelte ?kit\b/g, "sveltekit"], [/\bj ?query\b/g, "jquery"], [/\breal ?world\b/g, "realworld"], [/\bangular ?js\b/g, "angularjs"], [/\bnext ?js\b/g, "nextjs"], [/\btest ?mu\b/g, "testmu"], [/\b(to ?do|todo) ?mvc\b/g, "todomvc"], [/\btodom vc\b/g, "todomvc"], [/\bkane'?s\b/g, "kanes"]];
const NUM = { "twenty two": "22", "twenty one": "21", "twenty twelve": "2012", "twenty sixteen": "2016", twenty: "20", nineteen: "19", sixteen: "16", fourteen: "14", thirteen: "13", nine: "9", one: "1", two: "2", four: "4" };
function norm(text) {
  let t = text.toLowerCase().replace(/[-.]/g, " ").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, to] of HEARD) t = t.replace(re, to);
  for (const [w, d] of Object.entries(NUM)) t = t.replace(new RegExp(`\\b${w}\\b`, "g"), d);
  return t.replace(/'/g, "").split(" ").filter(Boolean);
}

function transcribe(path) {
  rmSync(checkDir, { recursive: true, force: true });
  mkdirSync(checkDir, { recursive: true });
  execFileSync("npx", ["hyperframes", "transcribe", path, "--dir", checkDir, "--model", "small.en", "--json"], { stdio: ["ignore", "ignore", "ignore"] });
  const transcript = JSON.parse(readFileSync(join(checkDir, "transcript.json"), "utf8"));
  const words = Array.isArray(transcript) ? transcript : (transcript.words ?? transcript.segments ?? []);
  return words.map((w) => w.text ?? w.word ?? "").join(" ");
}

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.startsWith("voiceover-temp-")) rmSync(join(outDir, f));
const lines = [];
const problems = [];
for (const scene of vo.scenes) {
  for (const [index, caption] of scene.lines.entries()) {
    const say = spoken(caption);
    const hash = createHash("sha1").update(`${vo.voice}|${vo.speed}|${say}`).digest("hex").slice(0, 8);
    const file = `vo-${scene.id}-${index + 1}-${hash}.wav`;
    const path = join(outDir, file);
    if (!existsSync(path)) {
      const raw = join(outDir, `raw-${file}`);
      execFileSync("npx", ["hyperframes", "tts", say, "-v", vo.voice, "-s", String(vo.speed), "-o", raw, "--json"], { stdio: ["ignore", "ignore", "inherit"] });
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000", "-ar", "48000", path]);
      rmSync(raw);
    }
    const entry = { scene: scene.id, index, text: caption, say, src: `assets/vo/${file}`, duration: Number(durationOf(path).toFixed(3)) };
    if (runCheck) {
      const heard = norm(transcribe(path));
      const want = norm(say);
      if (heard.join(" ") !== want.join(" ")) problems.push({ line: `${scene.id}/${index + 1}`, want: want.join(" "), heard: heard.join(" ") });
    }
    lines.push(entry);
  }
}
writeFileSync(join(outDir, "lines.json"), `${JSON.stringify(lines, null, 2)}\n`);
const words = lines.reduce((n, l) => n + l.say.split(/\s+/).length, 0);
const seconds = lines.reduce((n, l) => n + l.duration, 0);
console.log(`${lines.length} lines, ${seconds.toFixed(1)} s of speech, ${Math.round((words / seconds) * 60)} words per minute`);
if (runCheck) {
  console.log(problems.length === 0 ? "speech-to-text check: every line matches" : `speech-to-text check: ${problems.length} line(s) differ`);
  for (const p of problems) console.log(`  ${p.line}\n    want:  ${p.want}\n    heard: ${p.heard}`);
}
