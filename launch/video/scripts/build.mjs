// Builds the HyperFrames demo film from vo.json and the measured voiceover lines.
// Writes hf/index.html, hf/compositions/*.html and launch/voiceover.md.
// Usage: node launch/video/scripts/build.mjs   (run voiceover.mjs first)
//
// Every figure shown on screen is quoted from runs/todomvc-jquery/voyage.json. The verdict and
// root-cause text is copied from that file verbatim; see FACTS below.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const videoDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = join(videoDir, "..", "..");
const hf = join(videoDir, "hf");
const lines = JSON.parse(readFileSync(join(hf, "assets", "vo", "lines.json"), "utf8"));
const voyage = JSON.parse(readFileSync(join(repoDir, "runs", "todomvc-jquery", "voyage.json"), "utf8"));

// ---------- facts, read from the voyage record ----------
function regrowth(id) {
  const r = voyage.regrowths.find((x) => x.id === id);
  if (!r) throw new Error(`voyage.json has no regrowth ${id}`);
  return r;
}
function result(r, round, behavior) {
  const rd = r.rounds.find((x) => x.n === round);
  const res = rd?.results.find((x) => x.behaviorId === behavior);
  if (!res) throw new Error(`no result ${r.id} round ${round} ${behavior}`);
  return res.outcome;
}
function splitCause(text) {
  const m = /^\[([a-z_]+)\]\s*(.*)$/s.exec(text);
  if (!m) throw new Error(`unexpected root cause: ${text}`);
  return { category: m[1], text: m[2] };
}
const nextjs = regrowth("nextjs");
const sveltekit = regrowth("sveltekit");
const r1 = result(nextjs, 1, "counter-plural");
const r5 = result(nextjs, 5, "counter-plural");
const persist = voyage.baseline.find((b) => b.behaviorId === "persist-items").outcome;
const passedIn = (r, n) => r.rounds.find((x) => x.n === n).results.filter((x) => x.outcome.status === "passed").length;
const FACTS = {
  behaviors: voyage.spec.behaviors.length,
  r1: {
    step: r1.failingStep.index,
    remark: r1.failingStep.remark,
    cause: splitCause(r1.rca.rootCause),
    fix: r1.rca.suggestedFix,
    passed: passedIn(nextjs, 1),
  },
  r5: { cause: splitCause(r5.rca.rootCause), passed: passedIn(nextjs, 5) },
  persist: { cause: splitCause(persist.rca.rootCause), reason: persist.reason },
  nextjsIdentical: nextjs.parity.summary.identical,
  sveltekitIdentical: sveltekit.parity.summary.identical,
  sveltekitR1: passedIn(sveltekit, 1),
  nextjsRounds: nextjs.rounds.length,
  diffs: nextjs.rounds.map((x) => x.diffStat.files),
};
const check = (cond, msg) => {
  if (!cond) throw new Error(`fact check failed: ${msg}`);
};
check(FACTS.behaviors === 22, "22 behaviors");
check(FACTS.r1.passed === 20 && FACTS.r1.step === 9, "round 1 20/22, step 9");
check(FACTS.r5.passed === 21, "round 5 21/22");
check(FACTS.nextjsIdentical === 19 && FACTS.sveltekitIdentical === 20, "parity 19 and 20");
check(FACTS.sveltekitR1 === 22, "SvelteKit 22/22 first build");
check(result(nextjs, 2, "fresh-empty").status === "passed", "fresh-empty green in round 2");
check(result(nextjs, 4, "counter-plural").status === "passed", "counter-plural green in round 4");
check(FACTS.diffs.slice(1).every((f) => f === 0), "rounds 2 to 6 changed no files");
check(!voyage.regrowths.some((r) => r.id === "expo-android"), "expo-android has no recorded result yet");

// ---------- timing ----------
const GAP = 0.35;
const sceneSpec = {
  verdict: { lead: 0.35, tail: 0.9 },
  original: { lead: 0.5, tail: 0.9 },
  title: { lead: 0.9, tail: 1.2 },
  capture: { lead: 0.5, tail: 0.9 },
  falsegreen: { lead: 0.5, tail: 1.0 },
  cleanroom: { lead: 0.6, tail: 1.0 },
  regrow: { lead: 0.5, tail: 0.9 },
  loop: { lead: 0.5, tail: 1.6 },
  sveltekit: { lead: 0.4, tail: 1.2 },
  regression: { lead: 0.5, tail: 1.2 },
  parity: { lead: 0.6, tail: 1.2 },
  live: { lead: 0.5, tail: 0.6, at: { 1: 12.8 }, min: 26 },
  expo: { lead: 0.5, tail: 1.4 },
  end: { lead: 0.6, tail: 3.5 },
};
const order = Object.keys(sceneSpec);
const scenes = [];
let clock = 0;
for (const id of order) {
  const spec = sceneSpec[id];
  const own = lines.filter((l) => l.scene === id);
  if (own.length === 0) throw new Error(`no voiceover for ${id}`);
  let t = spec.lead;
  const starts = own.map((l, i) => {
    if (spec.at?.[i] !== undefined) t = Math.max(t, spec.at[i]);
    const s = t;
    t += l.duration + GAP;
    return Number(s.toFixed(2));
  });
  const duration = Number(Math.max(spec.min ?? 0, t - GAP + spec.tail).toFixed(2));
  scenes.push({ id, start: Number(clock.toFixed(2)), duration, starts, lines: own });
  clock += duration;
}
const total = Number(clock.toFixed(2));

// ---------- shared styles ----------
const FONTS = `
@font-face { font-family: "Newsreader"; src: url("assets/fonts/newsreader-latin-400-normal.woff2") format("woff2"); font-weight: 400; }
@font-face { font-family: "Newsreader"; src: url("assets/fonts/newsreader-latin-500-normal.woff2") format("woff2"); font-weight: 500; }
@font-face { font-family: "Newsreader"; src: url("assets/fonts/newsreader-latin-400-italic.woff2") format("woff2"); font-weight: 400; font-style: italic; }
@font-face { font-family: "IBM Plex Sans"; src: url("assets/fonts/ibm-plex-sans-latin-400-normal.woff2") format("woff2"); font-weight: 400; }
@font-face { font-family: "IBM Plex Sans"; src: url("assets/fonts/ibm-plex-sans-latin-500-normal.woff2") format("woff2"); font-weight: 500; }
@font-face { font-family: "IBM Plex Sans"; src: url("assets/fonts/ibm-plex-sans-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
@font-face { font-family: "IBM Plex Mono"; src: url("assets/fonts/ibm-plex-mono-latin-400-normal.woff2") format("woff2"); font-weight: 400; }
@font-face { font-family: "IBM Plex Mono"; src: url("assets/fonts/ibm-plex-mono-latin-500-normal.woff2") format("woff2"); font-weight: 500; }`;

const BASE = (id) => `
#root { position: absolute; inset: 0; overflow: hidden; color: #ecedef; font-family: "IBM Plex Sans", sans-serif;
  --paper: #0b0c0e; --surface: #121418; --sunken: #08090a; --ink: #ecedef; --ink-2: #a5a9b1; --ink-3: #82868f;
  --rule: #1f2228; --rule-strong: #2e323a; --accent: #8c9eff; --pass: #4cc38a; --fail: #ff7563; }
#${id}-ground { position: absolute; inset: 0; background: var(--paper); }
#root .eyebrow { font-family: "IBM Plex Mono", monospace; font-size: 18px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
#root .serif { font-family: "Newsreader", serif; font-weight: 400; letter-spacing: -0.02em; }
#root .mono { font-family: "IBM Plex Mono", monospace; }
#root .chip { display: inline-block; font-family: "IBM Plex Mono", monospace; font-size: 18px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--rule-strong); color: var(--ink-2); }
#root .chip.fail { color: var(--fail); border-color: rgba(255,117,99,0.45); }
#root .chip.pass { color: var(--pass); border-color: rgba(76,195,138,0.45); }
#root .win { position: absolute; border-radius: 14px; overflow: hidden; background: var(--surface); border: 1px solid var(--rule-strong);
  box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px rgba(0,0,0,0.55), 0 4px 14px rgba(0,0,0,0.4); }
#root .win .bar { position: absolute; left: 0; right: 0; top: 0; height: 40px; background: #16181d; border-bottom: 1px solid var(--rule); display: flex; align-items: center; padding: 0 16px; gap: 8px; }
#root .win .dot { width: 11px; height: 11px; border-radius: 50%; background: #2e323a; }
#root .win .addr { margin-left: 14px; font-family: "IBM Plex Mono", monospace; font-size: 15px; color: var(--ink-3); }
#root .win .view { position: absolute; left: 0; right: 0; bottom: 0; top: 40px; overflow: hidden; }
#root .win video { position: absolute; }
#root .label { position: absolute; font-family: "IBM Plex Mono", monospace; font-size: 17px; color: var(--ink-3); }
`;

function sceneFile(id, css, body, js) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>${id}</title></head>
  <body>
    <template>
      <style>${FONTS}${BASE(id)}${css}
      </style>
      <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080">
        <div id="${id}-ground" class="clip" data-start="0" data-duration="${current.duration}"></div>
${body}
      </div>
      <script>
        const tl = gsap.timeline({ paused: true });
        const S = ${JSON.stringify(current.starts)};
${js}
        window.__timelines["${id}"] = tl;
      </script>
    </template>
  </body>
</html>
`;
}

function win(id, { x, y, w, h, addr }, inner) {
  return `        <div id="${id}" class="win" style="left:${x}px;top:${y}px;width:${w}px;height:${h + 40}px">
          <div class="bar" data-layout-ignore><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="addr">${addr}</span></div>
          <div class="view">
${inner}
          </div>
        </div>`;
}

function video(id, src, { start = 0, duration, mediaStart = 0, rate = 1, left = 0, top = 0, width, height }) {
  const r = rate === 1 ? "" : ` data-playback-rate="${rate}"`;
  return `            <video id="${id}" class="clip" src="assets/footage/${src}" muted playsinline data-start="${start}" data-duration="${duration}" data-media-start="${mediaStart}"${r} style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"></video>`;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- scenes ----------
let current;
const builders = {
  verdict(D) {
    const remark = FACTS.r1.remark.replace(/^assert:\s*/, "");
    const css = `
#vd-eyebrow { position: absolute; left: 120px; top: 92px; }
#vd-src { position: absolute; right: 120px; top: 92px; font-family: "IBM Plex Mono", monospace; font-size: 16px; color: var(--ink-3); }
#vd-shot { position: absolute; left: 120px; top: 150px; width: 820px; height: 461px; border-radius: 10px; overflow: hidden; outline: 2px solid var(--fail); outline-offset: 0; }
#vd-shot img { position: absolute; left: -683px; top: 0; width: 2187px; height: 1230px; display: block; }
#vd-shotcap { position: absolute; left: 120px; top: 628px; font-family: "IBM Plex Mono", monospace; font-size: 17px; color: var(--fail); }
#vd-count { position: absolute; left: 120px; top: 690px; width: 820px; padding: 22px 26px; border-radius: 12px; background: var(--surface); border: 1px solid var(--rule); }
#vd-count .k { font-family: "IBM Plex Mono", monospace; font-size: 16px; color: var(--ink-3); }
#vd-count .v { font-family: "IBM Plex Mono", monospace; font-size: 26px; margin-top: 6px; color: var(--ink); }
#vd-col { position: absolute; left: 1010px; top: 140px; width: 790px; }
#vd-title { font-size: 68px; line-height: 1.05; }
#vd-meta { margin-top: 10px; font-family: "IBM Plex Mono", monospace; font-size: 19px; color: var(--ink-3); }
#vd-verdict { margin-top: 30px; display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 600; color: var(--fail); }
#vd-verdict .sq { width: 22px; height: 22px; border-radius: 4px; background: var(--fail); }
#vd-step { margin-top: 16px; font-family: "IBM Plex Mono", monospace; font-size: 19px; line-height: 1.55; color: #ffb3a8; background: rgba(255,117,99,0.07); border-left: 3px solid var(--fail); padding: 12px 16px; border-radius: 0 8px 8px 0; }
#vd-rc { margin-top: 30px; }
#vd-rc .h { display: flex; align-items: center; gap: 12px; }
#vd-rctext { position: relative; margin-top: 12px; font-size: 26px; line-height: 1.45; color: var(--ink); }
#vd-mark { position: absolute; left: -10px; right: -10px; top: -6px; bottom: -6px; background: rgba(140,158,255,0.12); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; transform-origin: left center; }
#vd-rctext span { position: relative; }
#vd-fix { margin-top: 26px; }
#vd-fixtext { margin-top: 10px; font-size: 21px; line-height: 1.5; color: var(--ink-2); }
#vd-back { position: absolute; left: 1010px; top: 878px; display: flex; align-items: center; gap: 14px; font-family: "IBM Plex Mono", monospace; font-size: 20px; color: var(--accent); }
#vd-back .line { width: 60px; height: 2px; background: var(--accent); transform-origin: left center; }`;
    const body = `
        <div id="vd-eyebrow" class="eyebrow">Kane CLI run report</div>
        <div id="vd-src">runs/todomvc-jquery/voyage.json</div>
        <div id="vd-shot"><img src="assets/shots/nextjs-r1-counter-plural-fail.jpg" alt="Kane screenshot of the failing step" /></div>
        <div id="vd-shotcap">Kane screenshot at the failing step</div>
        <div id="vd-count"><div class="k">On screen when the step failed</div><div class="v">One, Two, &nbsp;"2 items left"</div></div>
        <div id="vd-col">
          <div id="vd-title" class="serif">Pluralized counter</div>
          <div id="vd-meta">Next.js regrowth &nbsp;/&nbsp; round 1 &nbsp;/&nbsp; counter-plural</div>
          <div id="vd-verdict"><span class="sq"></span>Failed at step ${FACTS.r1.step}</div>
          <div id="vd-step">${esc(remark)}</div>
          <div id="vd-rc"><div class="h"><span class="eyebrow">Kane root cause</span><span class="chip">${FACTS.r1.cause.category}</span></div>
            <div id="vd-rctext"><div id="vd-mark"></div><span>${esc(FACTS.r1.cause.text)}</span></div></div>
          <div id="vd-fix"><div class="eyebrow">Suggested fix</div><div id="vd-fixtext">${esc(FACTS.r1.fix)}</div></div>
        </div>
        <div id="vd-back"><span class="line"></span>Sent back to the builder agent as round 2 feedback</div>`;
    const js = `
        tl.fromTo("#vd-shot", { opacity: 0.0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, 0);
        tl.fromTo("#vd-col > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" }, 0.05);
        tl.fromTo(["#vd-shotcap", "#vd-count"], { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.1 }, 0.4);
        tl.fromTo("#vd-step", { backgroundColor: "rgba(255,117,99,0.0)" }, { backgroundColor: "rgba(255,117,99,0.16)", duration: 0.3, yoyo: true, repeat: 1 }, S[1]);
        tl.fromTo("#vd-mark", { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.7, ease: "power2.inOut" }, S[2]);
        tl.fromTo("#vd-back", { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, S[3]);
        tl.fromTo("#vd-back .line", { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power2.out" }, S[3]);`;
    return { css, body, js };
  },

  original(D) {
    const css = `
#og-text { position: absolute; left: 140px; top: 300px; width: 700px; }
#og-title { font-size: 104px; line-height: 1.0; margin-top: 18px; }
#og-year { color: var(--ink-3); }
#og-stack { margin-top: 26px; font-family: "IBM Plex Mono", monospace; font-size: 22px; color: var(--ink-2); }
#og-note { margin-top: 14px; font-size: 20px; color: var(--ink-3); }`;
    const body = `
        <div id="og-text"><div class="eyebrow">The original</div><div id="og-title" class="serif">jQuery TodoMVC <span id="og-year">2012</span></div>
          <div id="og-stack">${esc(voyage.spec.app.origin.stack)}</div><div id="og-note">Vendored unchanged from tastejs/todomvc</div></div>
${win("og-win", { x: 1080, y: 70, w: 608, h: 855, addr: "localhost:4270" }, video("og-v", "app-original.mp4", { duration: D, rate: 12 / D, width: 608, height: 855 }))}`;
    const js = `
        tl.fromTo("#og-text > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: "power3.out" }, 0.1);
        tl.fromTo("#og-win", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0);`;
    return { css, body, js };
  },

  title() {
    const css = `
#tt-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
#tt-word { font-size: 220px; line-height: 1; }
#tt-tag { margin-top: 26px; font-family: "Newsreader", serif; font-style: italic; font-size: 48px; color: var(--ink-2); }
#tt-rule { width: 120px; height: 2px; background: var(--accent); margin-top: 40px; transform-origin: center; }`;
    const body = `
        <div id="tt-wrap"><div id="tt-word" class="serif">Theseus</div><div id="tt-tag">Delete the code. Keep the ship.</div><div id="tt-rule"></div></div>`;
    const js = `
        tl.fromTo("#tt-word", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, 0.1);
        tl.fromTo("#tt-tag", { opacity: 0 }, { opacity: 1, duration: 0.7 }, S[0] + 0.5);
        tl.fromTo("#tt-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "power2.inOut" }, S[0] + 0.8);`;
    return { css, body, js };
  },

  capture(D) {
    const css = `
#cp-label { position: absolute; left: 211px; top: 26px; }
#cp-stat { position: absolute; right: 150px; top: 640px; width: 520px; padding: 26px 30px; border-radius: 14px; background: rgba(18,20,24,0.96); border: 1px solid var(--rule-strong); box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
#cp-stat .n { font-family: "IBM Plex Mono", monospace; font-size: 72px; line-height: 1; }
#cp-stat .t { margin-top: 10px; font-size: 24px; color: var(--ink-2); line-height: 1.4; }`;
    const body = `
        <div id="cp-label" class="eyebrow">theseus demo &nbsp;/&nbsp; replay of the recorded voyage, sped up</div>
${win("cp-win", { x: 211, y: 64, w: 1498, h: 842, addr: "terminal" }, video("cp-v", "term-demo.mp4", { duration: D, mediaStart: 3, rate: 3, width: 1498, height: 842 }))}
        <div id="cp-stat"><div class="n">${FACTS.behaviors}</div><div class="t">behaviors drafted in plain English, each one run by Kane on the original</div></div>`;
    const js = `
        tl.fromTo("#cp-win", { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }, 0);
        tl.fromTo("#cp-label", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.2);
        tl.fromTo("#cp-stat", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, S[1] + 1.2);`;
    return { css, body, js };
  },

  falsegreen(D) {
    const reason = FACTS.persist.reason.replace(/^Re-verified with theseus verify: /, "");
    const quote = /\((the recorded pass[^)]*)\)/.exec(reason);
    if (!quote) throw new Error("persist-items reason changed");
    const css = `
#fg-left { position: absolute; left: 140px; top: 96px; width: 760px; }
#fg-title { font-size: 64px; line-height: 1.05; margin-top: 16px; }
#fg-meta { margin-top: 10px; font-family: "IBM Plex Mono", monospace; font-size: 19px; color: var(--ink-3); }
#fg-right { position: absolute; left: 1000px; top: 110px; width: 780px; }
#fg-quote { margin-top: 12px; font-family: "Newsreader", serif; font-style: italic; font-size: 34px; line-height: 1.3; color: var(--ink); }
#fg-rc { margin-top: 26px; }
#fg-rctext { margin-top: 10px; font-size: 23px; line-height: 1.45; color: var(--ink-2); }
#fg-was { margin-top: 26px; display: flex; gap: 14px; align-items: center; font-family: "IBM Plex Mono", monospace; font-size: 20px; }
#fg-was .old { color: var(--pass); text-decoration: line-through; text-decoration-color: var(--ink-3); }
#fg-was .new { color: var(--fail); }`;
    const body = `
        <div id="fg-left"><div class="eyebrow">Kane checked our own baseline</div><div id="fg-title" class="serif">Persist todos after reopening</div>
          <div id="fg-meta">original &nbsp;/&nbsp; persist-items</div>
          <div id="fg-was"><span class="old">recorded: passed</span><span class="new">theseus verify: failed</span></div></div>
        <div id="fg-right"><div class="eyebrow">What the re-run found</div><div id="fg-quote">"${esc(quote[1])}"</div>
          <div id="fg-rc"><span class="chip">${FACTS.persist.cause.category}</span><div id="fg-rctext">${esc(FACTS.persist.cause.text)}</div></div></div>
${win("fg-win", { x: 180, y: 500, w: 1560, h: 330, addr: "theseus-umber.vercel.app/voyages/todomvc-jquery" }, video("fg-v", "cert.mp4", { duration: D, mediaStart: 17.6, rate: 2.2 / D, left: -468, top: -300, width: 2496, height: 1404 }))}`;
    const js = `
        tl.fromTo("#fg-left > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "power3.out" }, 0.05);
        tl.fromTo("#fg-right > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: "power3.out" }, S[1]);
        tl.fromTo("#fg-win", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, S[3] - 0.4);`;
    return { css, body, js };
  },

  cleanroom() {
    const files = ["index.html", "app.js", "app.src.js", "base.js", "app.css", "base.css", "index.css", "jquery.min.js", "handlebars.min.js", "director.min.js"];
    const css = `
#cr-title { position: absolute; left: 140px; top: 110px; font-size: 120px; line-height: 1; }
#cr-a { position: absolute; left: 140px; top: 330px; width: 640px; }
#cr-b { position: absolute; left: 1000px; top: 330px; width: 780px; }
#root .tree { margin-top: 18px; font-family: "IBM Plex Mono", monospace; font-size: 24px; line-height: 1.65; }
#cr-a .f { position: relative; color: var(--ink-2); }
#cr-a .strike { position: absolute; left: 0; top: 50%; height: 2px; width: 100%; background: var(--fail); transform-origin: left center; }
#cr-b .f { color: var(--ink); }
#cr-b .f em { font-style: normal; color: var(--ink-3); }
#cr-b .box { margin-top: 18px; padding: 26px 30px; border-radius: 14px; border: 1px solid var(--accent); background: rgba(140,158,255,0.06); }`;
    const body = `
        <div id="cr-title" class="serif">The code is gone.</div>
        <div id="cr-a"><div class="eyebrow">examples/todomvc-jquery/original</div><div class="tree">${files.map((f) => `<div class="f">${f}<span class="strike"></span></div>`).join("")}</div></div>
        <div id="cr-b"><div class="eyebrow">Each builder's clean room</div><div class="box tree"><div class="f">SPEC.md <em>&nbsp;22 behaviors in plain English</em></div><div class="f">reference/ <em>&nbsp;screenshots</em></div></div>
          <div class="tree" style="font-size:21px;color:var(--ink-3);width:520px">No original source in the workspace, the prompt or the feedback.</div></div>`;
    const js = `
        tl.fromTo("#cr-title", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.05);
        tl.fromTo("#cr-a", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.2);
        tl.fromTo("#cr-a .strike", { scaleX: 0 }, { scaleX: 1, duration: 0.35, stagger: 0.07, ease: "power2.in" }, S[0] + 0.3);
        tl.to("#cr-a .tree", { opacity: 0.28, duration: 0.6 }, S[0] + 1.3);
        tl.fromTo("#cr-b > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.18, ease: "power3.out" }, S[1]);
        tl.fromTo("#cr-b .box", { borderColor: "rgba(140,158,255,0.35)" }, { borderColor: "rgba(140,158,255,1)", duration: 1.2, yoyo: true, repeat: 3, ease: "sine.inOut" }, S[1] + 1);
        tl.fromTo("#cr-title", { x: 0 }, { x: 18, duration: 10, ease: "none" }, 0.8);`;
    return { css, body, js };
  },

  regrow(D) {
    const css = `#rg-label { position: absolute; left: 211px; top: 26px; }`;
    const body = `
        <div id="rg-label" class="eyebrow">Round 1 &nbsp;/&nbsp; Codex building, Kane verifying &nbsp;/&nbsp; replay, sped up</div>
${win("rg-win", { x: 211, y: 64, w: 1498, h: 842, addr: "terminal" }, video("rg-v", "term-demo.mp4", { duration: D, mediaStart: 116, rate: 2, width: 1498, height: 842 }))}`;
    const js = `
        tl.fromTo("#rg-win", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0);
        tl.fromTo("#rg-label", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.2);`;
    return { css, body, js };
  },

  loop(D) {
    const rows = [
      { n: 1, label: `${FACTS.r1.passed}/22 passed`, detail: "fresh-empty and counter-plural failed", tone: "fail", diff: `${FACTS.diffs[0]} files` },
      { n: 2, label: "fresh-empty passed", detail: "counter-plural failed again", tone: "mixed", diff: "0 files" },
      { n: 3, label: "counter-plural failed", detail: "Kane: the app shows the right counts", tone: "fail", diff: "0 files" },
      { n: 4, label: "counter-plural passed", detail: "22/22 proven", tone: "pass", diff: "0 files" },
    ];
    const css = `
#lp-col { position: absolute; left: 110px; top: 90px; width: 700px; }
#lp-col .head { display: flex; justify-content: space-between; }
#root .row { position: relative; margin-top: 16px; padding: 20px 24px; border-radius: 12px; background: var(--surface); border: 1px solid var(--rule); }
#root .row .top { display: flex; align-items: center; gap: 14px; }
#root .row .n { font-family: "IBM Plex Mono", monospace; font-size: 18px; color: var(--ink-3); width: 86px; }
#root .row .sq { width: 18px; height: 18px; border-radius: 4px; }
#root .row .l { font-size: 27px; font-weight: 500; }
#root .row .d { margin-top: 6px; margin-left: 100px; font-size: 19px; color: var(--ink-2); }
#root .row .diff { position: absolute; right: 22px; top: 24px; font-family: "IBM Plex Mono", monospace; font-size: 16px; color: var(--ink-3); }
#root .row.fail .sq { background: var(--fail); } #root .row.fail .l { color: var(--fail); }
#root .row.pass .sq { background: var(--pass); } #root .row.pass .l { color: var(--pass); }
#root .row.mixed .sq { background: var(--pass); }
#lp-fb { margin-top: 16px; display: flex; align-items: center; gap: 12px; font-family: "IBM Plex Mono", monospace; font-size: 18px; color: var(--accent); }
#lp-big { position: absolute; left: 110px; top: 800px; font-family: "IBM Plex Mono", monospace; font-size: 64px; color: var(--pass); }
#lp-big small { font-size: 22px; color: var(--ink-2); margin-left: 16px; font-family: "IBM Plex Sans", sans-serif; }`;
    const body = `
        <div id="lp-col"><div class="head"><span class="eyebrow">Next.js regrowth, Codex</span><span class="eyebrow">diff</span></div>
${rows.map((r) => `          <div id="lp-r${r.n}" class="row ${r.tone}"><div class="top"><span class="n">Round ${r.n}</span><span class="sq"></span><span class="l">${r.label}</span></div><div class="d">${r.detail}</div><span class="diff">${r.diff}</span></div>`).join("\n")}
          <div id="lp-fb">Each failure sent back with step, reason, root cause, fix</div></div>
        <div id="lp-big">22/22<small>by round 4, with no code changed after round 1</small></div>
${win("lp-win", { x: 880, y: 60, w: 930, h: 838, addr: "theseus-umber.vercel.app/voyages/todomvc-jquery/nextjs" }, video("lp-v", "nextjs-rounds.mp4", { duration: D, mediaStart: 5, rate: 22 / D, left: -300, top: 0, width: 1536, height: 864 }))}`;
    const js = `
        tl.fromTo("#lp-win", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
        tl.fromTo("#lp-col .head", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.1);
        tl.fromTo("#lp-r1", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, S[0]);
        tl.fromTo("#lp-fb", { opacity: 0 }, { opacity: 1, duration: 0.5 }, S[1]);
        tl.fromTo("#lp-r1 .diff", { color: "#82868f" }, { color: "#ecedef", duration: 0.3 }, S[2]);
        tl.fromTo("#lp-r2", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, S[3]);
        tl.fromTo("#lp-r3", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, S[4]);
        tl.fromTo("#lp-r4", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, S[4] + 2.4);
        tl.fromTo("#lp-big", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, S[5]);`;
    return { css, body, js };
  },

  sveltekit(D) {
    const css = `
#sk-text { position: absolute; left: 140px; top: 280px; width: 760px; }
#sk-big { margin-top: 20px; font-family: "IBM Plex Mono", monospace; font-size: 168px; line-height: 1; color: var(--pass); }
#sk-big span { color: var(--ink-3); }
#sk-sub { margin-top: 22px; font-size: 30px; color: var(--ink-2); }`;
    const body = `
        <div id="sk-text"><div class="eyebrow">SvelteKit regrowth, Codex, clean room</div><div id="sk-big">${FACTS.sveltekitR1}<span>/22</span></div><div id="sk-sub">proven by Kane on the first build</div></div>
${win("sk-win", { x: 1080, y: 70, w: 608, h: 855, addr: "localhost:4172" }, video("sk-v", "app-sveltekit.mp4", { duration: D, rate: 12.4 / D, width: 608, height: 855 }))}`;
    const js = `
        tl.fromTo("#sk-text > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.12, ease: "power3.out" }, 0.05);
        tl.fromTo("#sk-win", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.1);`;
    return { css, body, js };
  },

  regression(D) {
    const css = `
#rx-label { position: absolute; left: 60px; top: 70px; }
#rx-card { position: absolute; left: 1350px; top: 110px; width: 480px; }
#rx-t { margin-top: 14px; font-size: 30px; font-weight: 600; color: var(--fail); display: flex; gap: 12px; align-items: center; }
#rx-t .sq { width: 18px; height: 18px; border-radius: 4px; background: var(--fail); }
#rx-rctext { margin-top: 12px; font-size: 22px; line-height: 1.5; color: var(--ink-2); }
#rx-end { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--rule-strong); }
#rx-end .n { font-family: "IBM Plex Mono", monospace; font-size: 72px; line-height: 1; margin-top: 10px; }`;
    const body = `
        <div id="rx-label" class="eyebrow">Final regression pass &nbsp;/&nbsp; replay, sped up</div>
${win("rx-win", { x: 60, y: 110, w: 1240, h: 698, addr: "terminal" }, video("rx-v", "term-demo-fast.mp4", { duration: D, mediaStart: 43.2, width: 1240, height: 698 }))}
        <div id="rx-card"><div class="eyebrow">Next.js, round 5</div><div id="rx-t"><span class="sq"></span>Pluralized counter failed</div>
          <div style="margin-top:18px"><span class="eyebrow">Kane root cause</span> <span class="chip">${FACTS.r5.cause.category}</span></div>
          <div id="rx-rctext">${esc(FACTS.r5.cause.text)}</div>
          <div id="rx-end"><div class="eyebrow">Counted as a failure</div><div class="n">${FACTS.r5.passed}<span style="color:var(--ink-3)">/22</span></div></div></div>`;
    const js = `
        tl.fromTo("#rx-win", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
        tl.fromTo("#rx-label", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.2);
        tl.fromTo("#rx-card > div:nth-child(-n+2)", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 }, S[1]);
        tl.fromTo(["#rx-card > div:nth-child(3)", "#rx-rctext"], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 }, S[2]);
        tl.fromTo("#rx-end", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, S[3]);`;
    return { css, body, js };
  },

  parity(D) {
    const css = `
#pt-label { position: absolute; left: 192px; top: 22px; }
#pt-chips { position: absolute; right: 110px; top: 110px; display: flex; flex-direction: column; gap: 12px; align-items: flex-end; }
#root .stat { padding: 16px 22px; border-radius: 12px; background: rgba(18,20,24,0.97); border: 1px solid var(--rule-strong); box-shadow: 0 16px 40px rgba(0,0,0,0.5); font-size: 24px; }
#root .stat b { font-family: "IBM Plex Mono", monospace; font-weight: 500; font-size: 34px; color: var(--pass); margin-right: 10px; }`;
    const body = `
        <div id="pt-label" class="eyebrow">Parity certificate &nbsp;/&nbsp; theseus-umber.vercel.app</div>
${win("pt-win", { x: 192, y: 56, w: 1536, h: 864, addr: "theseus-umber.vercel.app/voyages/todomvc-jquery" }, video("pt-v", "cert.mp4", { duration: D, mediaStart: 0, rate: 17 / D, width: 1536, height: 864 }))}
        <div id="pt-chips"><div id="pt-a" class="stat"><b>${FACTS.nextjsIdentical}/22</b>Next.js identical</div><div id="pt-b" class="stat"><b>${FACTS.sveltekitIdentical}/22</b>SvelteKit identical</div></div>`;
    const js = `
        tl.fromTo("#pt-win", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
        tl.fromTo("#pt-label", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.2);
        tl.fromTo("#pt-a", { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, S[2]);
        tl.fromTo("#pt-b", { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, S[2] + 1.3);
        tl.to("#pt-chips", { opacity: 0, duration: 0.4 }, S[3] + 1.2);`;
    return { css, body, js };
  },

  live(D) {
    const cut = 12.6;
    const wait = 6.2;
    const apps = [
      { id: "lv-a", src: "app-original.mp4", name: "jQuery TodoMVC (2012)", port: 4270, x: 151 },
      { id: "lv-b", src: "app-nextjs.mp4", name: "Next.js regrowth", port: 4271, x: 710 },
      { id: "lv-c", src: "app-sveltekit.mp4", name: "SvelteKit regrowth", port: 4172, x: 1269 },
    ];
    const css = `
#lv-apps { position: absolute; inset: 0; }
#lv-label { position: absolute; left: 151px; top: 34px; }
#root .appname { position: absolute; top: 88px; font-size: 24px; font-weight: 500; }
#lv-term { position: absolute; inset: 0; }
#lv-tlabel { position: absolute; left: 211px; top: 26px; }
#lv-skip { position: absolute; right: 230px; top: 112px; padding: 10px 16px; border-radius: 10px; background: rgba(140,158,255,0.12); border: 1px solid rgba(140,158,255,0.5); font-family: "IBM Plex Mono", monospace; font-size: 19px; color: var(--accent); }`;
    const body = `
        <div id="lv-apps">
          <div id="lv-label" class="eyebrow">Served locally from the committed source, recorded for this video</div>
${apps.map((a) => `          <div class="appname" style="left:${a.x}px">${a.name}</div>\n${win(a.id, { x: a.x, y: 130, w: 499, h: 702, addr: `localhost:${a.port}` }, video(`${a.id}-v`, a.src, { duration: cut, rate: 11 / cut, width: 499, height: 702 }))}`).join("\n")}
        </div>
        <div id="lv-term">
          <div id="lv-tlabel" class="eyebrow">theseus verify &nbsp;/&nbsp; a live Kane run, recorded for this video</div>
${win("lv-win", { x: 211, y: 64, w: 1498, h: 842, addr: "terminal" }, [
      video("lv-t1", "term-verify.mp4", { start: cut, duration: wait, mediaStart: 0, width: 1498, height: 842 }),
      video("lv-t2", "term-verify.mp4", { start: Number((cut + wait).toFixed(2)), duration: Number((D - cut - wait).toFixed(2)), mediaStart: 121.6, width: 1498, height: 842 }),
    ].join("\n"))}
          <div id="lv-skip">Kane run: 1 min 56 s, cut</div>
        </div>`;
    const js = `
        tl.fromTo(".appname", { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.1 }, 0.1);
        tl.fromTo(["#lv-a", "#lv-b", "#lv-c"], { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: "power3.out" }, 0);
        tl.fromTo("#lv-label", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.4);
        tl.fromTo("#lv-term", { opacity: 0 }, { opacity: 1, duration: 0.35 }, ${cut});
        tl.to("#lv-apps", { opacity: 0, duration: 0.35 }, ${cut} - 0.1);
        tl.fromTo("#lv-tlabel", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ${cut} + 0.2);
        tl.fromTo("#lv-skip", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${cut + wait});
        tl.to("#lv-skip", { opacity: 0, duration: 0.4 }, ${cut + wait} + 2.2);`;
    return { css, body, js };
  },

  expo() {
    const css = `
#ex-wrap { position: absolute; left: 140px; top: 330px; width: 1300px; }
#ex-title { font-size: 104px; line-height: 1.02; margin-top: 18px; }
#ex-status { margin-top: 34px; display: flex; align-items: center; gap: 16px; font-family: "IBM Plex Mono", monospace; font-size: 26px; color: var(--ink-2); }
#ex-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--accent); }`;
    const body = `
        <div id="ex-wrap"><div class="eyebrow">Expo on Android, Codex, clean room</div><div id="ex-title" class="serif">Native, on the emulator.</div>
          <div id="ex-status"><span id="ex-dot"></span>Running now. No result recorded yet.</div></div>`;
    const js = `
        tl.fromTo("#ex-wrap > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.14, ease: "power3.out" }, 0.05);
        tl.fromTo("#ex-dot", { backgroundColor: "rgba(140,158,255,0)" }, { backgroundColor: "rgba(140,158,255,0.9)", duration: 0.7, yoyo: true, repeat: 7, ease: "sine.inOut" }, 0.6);`;
    return { css, body, js };
  },

  end() {
    const css = `
#en-a { position: absolute; left: 160px; right: 160px; top: 380px; text-align: center; font-size: 76px; line-height: 1.15; }
#en-b { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
#en-word { font-size: 160px; line-height: 1; }
#en-tag { margin-top: 18px; font-family: "Newsreader", serif; font-style: italic; font-size: 40px; color: var(--ink-2); }
#en-urls { margin-top: 56px; display: flex; gap: 56px; font-family: "IBM Plex Mono", monospace; font-size: 26px; color: var(--ink); }
#en-cmd { margin-top: 26px; font-family: "IBM Plex Mono", monospace; font-size: 22px; color: var(--accent); padding: 10px 18px; border-radius: 10px; background: rgba(140,158,255,0.08); border: 1px solid rgba(140,158,255,0.35); }
#en-kane { margin-top: 44px; font-size: 22px; color: var(--ink-3); }`;
    const body = `
        <div id="en-a" class="serif">Plain-English tests are the only tests that survive a rewrite.</div>
        <div id="en-b" data-hold><div id="en-word" class="serif">Theseus</div><div id="en-tag">The tests are the source code.</div>
          <div id="en-urls"><span>theseus-umber.vercel.app</span><span>github.com/Adwaitbytes/theseus</span></div>
          <div id="en-cmd">$ theseus demo runs/todomvc-jquery</div>
          <div id="en-kane">Built on Kane CLI by TestMu AI, for the KaneCLI Online Hackathon</div></div>`;
    const js = `
        tl.fromTo("#en-a", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.1);
        tl.to("#en-a", { opacity: 0, y: -12, duration: 0.5, ease: "power2.in" }, S[1] - 0.3);
        tl.fromTo("#en-b > *", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: "power3.out" }, S[1] + 0.2);`;
    return { css, body, js };
  },
};

mkdirSync(join(hf, "compositions"), { recursive: true });
for (const s of scenes) {
  current = s;
  const { css, body, js } = builders[s.id](s.duration);
  writeFileSync(join(hf, "compositions", `${s.id}.html`), sceneFile(s.id, css, body, js));
}

// ---------- captions ----------
const CAPTION_FIX = [
  [/\btwenty two\b/gi, "22"], [/\btwenty one\b/gi, "21"], [/\btwenty\b/gi, "20"], [/\bnineteen\b/gi, "19"],
  [/\bround one\b/gi, "round 1"], [/\bround two\b/gi, "round 2"], [/\bround four\b/gi, "round 4"],
  [/\bStep nine\b/g, "Step 9"], [/\bpersist items\b/g, "persist-items"], [/\bTheseus verify\b/g, "theseus verify"],
  [/\bPlain English\b/g, "Plain-English"], [/\bplain English\b/g, "plain English"],
];
const captionText = (t) => CAPTION_FIX.reduce((s, [re, to]) => s.replace(re, to), t);

const audio = [];
const captions = [];
const vo = [];
for (const s of scenes) {
  s.lines.forEach((l, i) => {
    const at = Number((s.start + s.starts[i]).toFixed(2));
    audio.push(`      <audio id="vo-${s.id}-${i + 1}" src="${l.src}" data-start="${at}" data-duration="${l.duration}" data-volume="1" data-audio-group="voiceover"></audio>`);
    captions.push(`        <div id="cap-${s.id}-${i + 1}" class="clip cap" data-start="${at}" data-duration="${(l.duration + 0.25).toFixed(2)}"><span>${esc(captionText(l.text))}</span></div>`);
    vo.push({ at, end: at + l.duration, scene: s.id, text: l.text });
  });
}

const index = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Theseus demo</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>${FONTS}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #0b0c0e; }
      #root { position: relative; width: 100%; height: 100%; background: #0b0c0e; }
      .scene { position: absolute; inset: 0; }
      #captions { position: absolute; inset: 0; pointer-events: none; z-index: 50; }
      .cap { position: absolute; left: 0; right: 0; bottom: 52px; display: flex; justify-content: center; }
      .cap span { max-width: 1480px; text-align: center; font-family: "IBM Plex Sans", sans-serif; font-weight: 500; font-size: 33px; line-height: 1.35;
        color: #ecedef; background: rgba(8,9,10,0.84); padding: 10px 24px; border-radius: 10px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
${scenes.map((s, i) => `      <div id="scene-${s.id}" class="scene" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="${i % 2}" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`).join("\n")}
      <div id="captions" data-track-kind="captions">
${captions.join("\n")}
      </div>
${audio.join("\n")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(join(hf, "index.html"), index);

// ---------- voiceover script for the human recording ----------
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const md = [
  "# Theseus demo: voiceover script",
  "",
  `Final cut: launch/video/theseus-demo.mp4, ${mmss(total)} at 1920x1080, 30 fps. The cut currently carries a temporary synthetic voice (files named voiceover-temp-*, local Kokoro TTS, voice ${JSON.parse(readFileSync(join(videoDir, "vo.json"), "utf8")).voice}) so it can be reviewed. Record each line below and drop it in at its timestamp; every line has room to breathe, so a natural read that runs a little longer still fits before the next line.`,
  "",
  "Every number spoken here is read from `runs/todomvc-jquery/voyage.json`. Read numbers as words (\"twenty two\"), the captions show digits.",
  "",
  "| Start | End | Scene | Line |",
  "|---|---|---|---|",
  ...vo.map((v) => `| ${mmss(v.at)} | ${mmss(v.end)} | ${v.scene} | ${v.text} |`),
  "",
  "## Delivery notes",
  "",
  "- Calm and exact. This is a test report, not an ad. No emphasis on adjectives; let the numbers carry it.",
  "- The opening line must land inside the first 15 seconds while Kane's red verdict and root cause are on screen.",
  "- Pause a beat after \"That was a false green.\" and after \"Twenty two of twenty two.\"",
  "- \"Kane\" rhymes with \"rain\". \"Theseus\" is THEE-see-us.",
  "",
];
writeFileSync(join(repoDir, "launch", "voiceover.md"), `${md.join("\n")}`);

console.log(`scenes: ${scenes.map((s) => `${s.id}@${s.start}+${s.duration}`).join(" ")}`);
console.log(`total ${total}s (${mmss(total)})`);
