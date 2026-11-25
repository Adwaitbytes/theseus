import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const { chromium } = require("playwright");
const root = new URL("../../", import.meta.url).pathname;
const voyage = JSON.parse(readFileSync(`${root}runs/todomvc-jquery/voyage.json`, "utf8"));
const data = {
  behaviors: voyage.spec.behaviors.map((b) => ({ id: b.id, title: b.title })),
  baselineCredits: Math.round(voyage.baseline.reduce((s, r) => s + r.outcome.credits, 0)),
  targets: Object.fromEntries(voyage.regrowths.map((g) => [g.id, {
    label: g.target.label,
    parity: g.parity.summary,
    verdicts: Object.fromEntries(g.parity.rows.map((r) => [r.behaviorId, r.verdict])),
    rounds: g.rounds.map((r) => ({ n: r.n, passed: r.results.filter((x) => x.outcome.status === "passed").length, run: r.results.length, files: r.diffStat.files })),
    credits: Math.round(g.creditsUsed),
  }])),
};
const dir = new URL(".", import.meta.url).pathname;
writeFileSync(`${dir}deck.built.html`, readFileSync(`${dir}deck.html`, "utf8").replace("__DATA__", JSON.stringify(data)));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
await page.goto(`file://${dir}deck.built.html`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync(`${dir}png`, { recursive: true });
const slides = await page.$$("section.slide");
for (const [i, s] of slides.entries()) await s.screenshot({ path: `${dir}png/slide-${String(i + 1).padStart(2, "0")}.png` });
await page.pdf({ path: `${dir}Theseus-deck.pdf`, width: "1600px", height: "900px", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("slides", slides.length, "errors", errors.length, "baselineCredits", data.baselineCredits);
