// Builds the vertical teaser (hf/teaser.html, 1080x1920) and the red-to-green GIF composition
// (hf/gif.html, 960x540) from the same voyage facts and voiceover lines as the main film.
// Usage: node launch/video/scripts/build-social.mjs   (after voiceover.mjs)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const videoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = join(videoDir, "..", "..");
const hf = join(videoDir, "hf");
const lines = JSON.parse(readFileSync(join(hf, "assets", "vo", "lines.json"), "utf8"));
const voyage = JSON.parse(readFileSync(join(repoDir, "runs", "todomvc-jquery", "voyage.json"), "utf8"));

const nextjs = voyage.regrowths.find((r) => r.id === "nextjs");
const sveltekit = voyage.regrowths.find((r) => r.id === "sveltekit");
const outcome = (n, b) => nextjs.rounds.find((r) => r.n === n).results.find((x) => x.behaviorId === b)?.outcome;
const r1 = outcome(1, "counter-plural");
const cause = /^\[([a-z_]+)\]\s*(.*)$/s.exec(r1.rca.rootCause);
const statusByRound = [1, 2, 3, 4].map((n) => outcome(n, "counter-plural").status);
if (statusByRound.join() !== "failed,failed,failed,passed") throw new Error(`counter-plural rounds changed: ${statusByRound}`);
if (nextjs.parity.summary.identical !== 19 || sveltekit.parity.summary.identical !== 20) throw new Error("parity changed");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const line = (scene, index) => {
  const l = lines.find((x) => x.scene === scene && x.index === index);
  if (!l) throw new Error(`missing line ${scene} ${index}`);
  return l;
};

const FONTS = readFileSync(join(hf, "index.html"), "utf8").match(/(@font-face[^}]*}\s*)+/)[0];
const PALETTE = `--paper:#0b0c0e;--surface:#121418;--ink:#ecedef;--ink-2:#a5a9b1;--ink-3:#82868f;--rule:#1f2228;--rule-strong:#2e323a;--accent:#8c9eff;--pass:#4cc38a;--fail:#ff7563;`;
const CAPFIX = [[/\btwenty two\b/gi, "22"], [/\bStep nine\b/g, "Step 9"], [/\bround two\b/g, "round 2"], [/\bround four\b/g, "round 4"], [/\bnineteen\b/g, "19"], [/\btwenty\b/g, "20"]];
const cap = (t) => CAPFIX.reduce((s, [re, to]) => s.replace(re, to), t);

// ---------- vertical teaser ----------
const plan = [
  ["verdict", 0, 0.3], ["verdict", 1, 6.0], ["verdict", 2, 8.7], ["verdict", 3, 14.5],
  ["loop", 2, 17.8], ["loop", 4, 23.2], ["loop", 5, 29.2],
  ["parity", 2, 31.9],
  ["end", 1, 37.5],
];
const placed = plan.map(([s, i, at]) => ({ ...line(s, i), at }));
placed.forEach((p, i) => {
  const next = placed[i + 1];
  if (next && p.at + p.duration > next.at) throw new Error(`teaser line ${p.scene}/${p.index} overlaps the next`);
});
const TOTAL = 42;
const rounds = statusByRound
  .map((st, i) => `<div class="rd ${st === "passed" ? "pass" : "fail"}" id="t-rd${i + 1}"><span class="sq"></span><span class="n">Round ${i + 1}</span><span class="v">${st === "passed" ? "passed" : "failed"}</span></div>`)
  .join("");

const teaser = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>Theseus teaser</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>${FONTS}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #0b0c0e; }
      #root { position: relative; width: 100%; height: 100%; background: #0b0c0e; color: #ecedef; font-family: "IBM Plex Sans", sans-serif; ${PALETTE} }
      .sec { position: absolute; inset: 0; }
      .eyebrow { font-family: "IBM Plex Mono", monospace; font-size: 26px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
      .serif { font-family: "Newsreader", serif; letter-spacing: -0.02em; }
      .mono { font-family: "IBM Plex Mono", monospace; }
      #a-shot { position: absolute; left: 80px; top: 170px; width: 920px; height: 600px; border-radius: 14px; overflow: hidden; outline: 3px solid var(--fail); }
      #a-shot img { position: absolute; left: -760px; top: -10px; width: 2454px; height: 1380px; }
      #a-cap { position: absolute; left: 80px; top: 790px; font-family: "IBM Plex Mono", monospace; font-size: 24px; color: var(--fail); }
      #a-col { position: absolute; left: 80px; top: 860px; width: 920px; }
      #a-title { font-size: 84px; line-height: 1.02; }
      #a-verdict { margin-top: 22px; display: flex; gap: 16px; align-items: center; font-size: 40px; font-weight: 600; color: var(--fail); }
      .sq { width: 26px; height: 26px; border-radius: 5px; display: inline-block; }
      #a-verdict .sq, .rd.fail .sq { background: var(--fail); }
      .rd.pass .sq { background: var(--pass); }
      #a-rc { margin-top: 30px; padding: 26px 28px; border-left: 4px solid var(--accent); background: rgba(140,158,255,0.08); border-radius: 0 12px 12px 0; }
      #a-rc .t { margin-top: 12px; font-size: 32px; line-height: 1.42; }
      .chip { font-family: "IBM Plex Mono", monospace; font-size: 24px; padding: 4px 12px; border: 1px solid var(--rule-strong); border-radius: 8px; color: var(--ink-2); margin-left: 10px; }
      #b-head { position: absolute; left: 80px; top: 220px; }
      #b-title { position: absolute; left: 80px; top: 280px; width: 920px; font-size: 80px; line-height: 1.04; }
      #b-rounds { position: absolute; left: 80px; top: 560px; width: 920px; }
      .rd { display: flex; align-items: center; gap: 22px; padding: 26px 30px; margin-top: 18px; border-radius: 14px; background: var(--surface); border: 1px solid var(--rule); font-size: 38px; }
      .rd .n { font-family: "IBM Plex Mono", monospace; color: var(--ink-2); width: 220px; }
      .rd.fail .v { color: var(--fail); } .rd.pass .v { color: var(--pass); }
      #b-diff { position: absolute; left: 80px; top: 1130px; width: 920px; font-size: 32px; line-height: 1.4; color: var(--ink-2); }
      #b-big { position: absolute; left: 80px; top: 1260px; font-family: "IBM Plex Mono", monospace; font-size: 150px; color: var(--pass); }
      #c-wrap { position: absolute; left: 80px; top: 360px; width: 920px; }
      .stat { margin-top: 40px; padding: 40px; border-radius: 16px; background: var(--surface); border: 1px solid var(--rule-strong); }
      .stat b { display: block; font-family: "IBM Plex Mono", monospace; font-weight: 500; font-size: 140px; line-height: 1; color: var(--pass); }
      .stat span { display: block; margin-top: 14px; font-size: 36px; color: var(--ink-2); }
      #d-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      #d-word { font-size: 190px; line-height: 1; }
      #d-tag { margin-top: 24px; font-family: "Newsreader", serif; font-style: italic; font-size: 54px; color: var(--ink-2); }
      #d-url { margin-top: 70px; font-family: "IBM Plex Mono", monospace; font-size: 36px; }
      #d-kane { margin-top: 30px; font-size: 30px; color: var(--ink-3); }
      .cap { position: absolute; left: 60px; right: 60px; top: 1560px; display: flex; justify-content: center; }
      .cap span { text-align: center; font-weight: 500; font-size: 46px; line-height: 1.32; color: #ecedef; background: rgba(8,9,10,0.88); padding: 14px 28px; border-radius: 14px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="teaser" data-start="0" data-duration="${TOTAL}" data-width="1080" data-height="1920">
      <div id="sec-a" class="sec clip" data-start="0" data-duration="17.4">
        <div class="eyebrow" style="position:absolute;left:80px;top:100px">Kane CLI run report</div>
        <div id="a-shot"><img src="assets/shots/nextjs-r1-counter-plural-fail.jpg" alt="Kane screenshot of the failing step" /></div>
        <div id="a-cap">Kane screenshot at the failing step</div>
        <div id="a-col"><div id="a-title" class="serif">Pluralized counter</div>
          <div class="mono" style="font-size:26px;color:var(--ink-3);margin-top:12px">Next.js regrowth / round 1</div>
          <div id="a-verdict"><span class="sq"></span>Failed at step ${r1.failingStep.index}</div>
          <div id="a-rc"><span class="eyebrow">Kane root cause</span><span class="chip">${cause[1]}</span><div class="t">${esc(cause[2])}</div></div></div>
      </div>
      <div id="sec-b" class="sec clip" data-start="17.4" data-duration="14.2">
        <div id="b-head" class="eyebrow">counter-plural on Next.js</div>
        <div id="b-title" class="serif">Failure fed back. Kane runs it again.</div>
        <div id="b-rounds">${rounds}</div>
        <div id="b-diff">Kane said the app was right, so the agent changed no code after round 1.</div>
        <div id="b-big">22/22</div>
      </div>
      <div id="sec-c" class="sec clip" data-start="31.6" data-duration="5.6">
        <div id="c-wrap"><div class="eyebrow">Parity certificate</div>
          <div class="stat" id="c-a"><b>${nextjs.parity.summary.identical}/22</b><span>Next.js values identical to the 2012 original</span></div>
          <div class="stat" id="c-b"><b>${sveltekit.parity.summary.identical}/22</b><span>SvelteKit values identical to the 2012 original</span></div></div>
      </div>
      <div id="sec-d" class="sec clip" data-start="37.2" data-duration="${(TOTAL - 37.2).toFixed(1)}" data-hold>
        <div id="d-wrap"><div id="d-word" class="serif">Theseus</div><div id="d-tag">Delete the code. Keep the ship.</div>
          <div id="d-url">theseus-umber.vercel.app</div><div id="d-kane">Built on Kane CLI by TestMu AI</div></div>
      </div>
      <div id="captions" data-track-kind="captions">
${placed.map((p, i) => `        <div id="tcap-${i}" class="clip cap" data-start="${p.at}" data-duration="${(p.duration + 0.2).toFixed(2)}"><span>${esc(cap(p.text))}</span></div>`).join("\n")}
      </div>
${placed.map((p, i) => `      <audio id="tvo-${i}" src="${p.src}" data-start="${p.at}" data-duration="${p.duration}" data-volume="1"></audio>`).join("\n")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#a-shot", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0);
      tl.fromTo("#a-col > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" }, 0.1);
      tl.fromTo("#a-rc", { backgroundColor: "rgba(140,158,255,0.02)" }, { backgroundColor: "rgba(140,158,255,0.16)", duration: 0.6, yoyo: true, repeat: 1 }, 8.7);
      tl.fromTo(["#b-head", "#b-title"], { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 }, 17.5);
      tl.fromTo(".rd", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.45, stagger: 1.1, ease: "power3.out" }, 18.2);
      tl.fromTo("#b-diff", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 20.5);
      tl.fromTo("#b-big", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 29.2);
      tl.fromTo(".stat", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, stagger: 1.6, ease: "power3.out" }, 31.9);
      tl.fromTo("#d-wrap > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: "power3.out" }, 37.3);
      window.__timelines["teaser"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(join(hf, "teaser.html"), teaser);

// ---------- red-to-green GIF, 960x540, 8 s ----------
const gif = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=960, height=540" />
    <title>Red to green</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>${FONTS}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 960px; height: 540px; overflow: hidden; background: #0b0c0e; }
      #root { position: relative; width: 100%; height: 100%; background: #0b0c0e; color: #ecedef; font-family: "IBM Plex Sans", sans-serif; ${PALETTE} }
      #g-eye { position: absolute; left: 40px; top: 30px; font-family: "IBM Plex Mono", monospace; font-size: 15px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
      #g-title { position: absolute; left: 40px; top: 58px; font-family: "Newsreader", serif; font-size: 46px; letter-spacing: -0.02em; }
      #g-shot { position: absolute; left: 40px; top: 136px; width: 430px; height: 270px; border-radius: 10px; overflow: hidden; outline: 3px solid var(--fail); }
      #g-shot img { position: absolute; left: -356px; top: 0; width: 1146px; height: 645px; }
      #g-shot2 { position: absolute; inset: 0; opacity: 0; }
      #g-rounds { position: absolute; left: 510px; top: 136px; width: 410px; }
      .rd { display: flex; align-items: center; gap: 14px; padding: 13px 16px; margin-bottom: 10px; border-radius: 10px; background: var(--surface); border: 1px solid var(--rule); font-size: 21px; }
      .rd .n { font-family: "IBM Plex Mono", monospace; color: var(--ink-2); width: 100px; font-size: 18px; }
      .sq { width: 16px; height: 16px; border-radius: 4px; }
      .rd.fail .sq { background: var(--fail); } .rd.fail .v { color: var(--fail); }
      .rd.pass .sq { background: var(--pass); } .rd.pass .v { color: var(--pass); }
      #g-foot { position: absolute; left: 40px; right: 40px; top: 440px; display: flex; justify-content: space-between; align-items: baseline; }
      #g-why { font-size: 18px; color: var(--ink-2); width: 520px; line-height: 1.4; }
      #g-big { font-family: "IBM Plex Mono", monospace; font-size: 56px; color: var(--pass); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="gif" data-start="0" data-duration="8" data-width="960" data-height="540">
      <div id="g-eye">Kane CLI / Next.js regrowth / counter-plural</div>
      <div id="g-title">Pluralized counter</div>
      <div id="g-shot"><img src="assets/shots/nextjs-r1-counter-plural-fail.jpg" alt="Round 1 failing step" /><div id="g-shot2"><img src="assets/shots/nextjs-r4-counter-plural-final.jpg" alt="Round 4 final state" /></div></div>
      <div id="g-rounds">${rounds}</div>
      <div id="g-foot"><div id="g-why">Kane root cause, round 1: ${esc(cause[1])}. The app was right; the agent changed no code.</div><div id="g-big">22/22</div></div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.set(".rd", { opacity: 0 }, 0);
      tl.set("#g-big", { opacity: 0 }, 0);
      tl.to("#t-rd1", { opacity: 1, duration: 0.3 }, 0.4);
      tl.to("#t-rd2", { opacity: 1, duration: 0.3 }, 1.6);
      tl.to("#t-rd3", { opacity: 1, duration: 0.3 }, 2.8);
      tl.to("#t-rd4", { opacity: 1, duration: 0.3 }, 4.2);
      tl.to("#g-shot", { outlineColor: "#4cc38a", duration: 0.4 }, 4.2);
      tl.to("#g-shot2", { opacity: 1, duration: 0.4 }, 4.2);
      tl.to("#g-big", { opacity: 1, duration: 0.4 }, 4.8);
      window.__timelines["gif"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(join(hf, "gif.html"), gif);
console.log("wrote teaser.html (42 s, 1080x1920) and gif.html (8 s, 960x540)");
