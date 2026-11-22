// Records the live Theseus site and the three TodoMVC apps with Playwright.
// Usage: NODE_PATH=<dir containing playwright> node record-web.cjs <outDir> <shot...>
// Shots: home, cert, nextjs-rounds, app-original, app-nextjs, app-sveltekit
// App shots read their base URLs from ORIGINAL_URL, NEXTJS_URL and SVELTEKIT_URL.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const SITE = "https://theseus-umber.vercel.app";
const [outDir, ...shots] = process.argv.slice(2);
if (!outDir || shots.length === 0) {
  console.error("usage: record-web.cjs <outDir> <shot...>");
  process.exit(2);
}

async function smoothScroll(page, to, ms) {
  await page.evaluate(
    ([target, duration]) =>
      new Promise((resolve) => {
        const from = window.scrollY;
        const start = performance.now();
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = (now) => {
          const t = Math.min(1, (now - start) / duration);
          window.scrollTo(0, from + (target - from) * ease(t));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
}

async function yOf(page, text) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll("h1,h2,h3")].find((n) => n.textContent.trim().startsWith(t));
    if (!el) throw new Error(`heading not found: ${t}`);
    return el.getBoundingClientRect().top + window.scrollY - 80;
  }, text);
}

async function addTodos(page, titles) {
  const input = page.getByPlaceholder("What needs to be done?");
  for (const title of titles) {
    await input.click();
    await input.pressSequentially(title, { delay: 70 });
    await page.waitForTimeout(250);
    await input.press("Enter");
    await page.waitForTimeout(600);
  }
}

const scenes = {
  async home(page) {
    await page.goto(SITE, { waitUntil: "load" });
    await page.waitForTimeout(75000);
  },
  async cert(page) {
    await page.goto(`${SITE}/voyages/todomvc-jquery`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    await smoothScroll(page, await yOf(page, "Behavior by behavior"), 2500);
    await page.waitForTimeout(1500);
    await smoothScroll(page, (await yOf(page, "Behavior by behavior")) + 1500, 9000);
    await page.waitForTimeout(2500);
  },
  async "nextjs-rounds"(page) {
    await page.goto(`${SITE}/voyages/todomvc-jquery/nextjs`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    await smoothScroll(page, await yOf(page, "Round 1"), 2000);
    await page.waitForTimeout(2500);
    await smoothScroll(page, (await yOf(page, "Round 1")) + 1100, 5000);
    await page.waitForTimeout(2000);
    await smoothScroll(page, await yOf(page, "Round 2"), 2500);
    await page.waitForTimeout(3500);
    await smoothScroll(page, await yOf(page, "Round 4"), 3500);
    await page.waitForTimeout(3000);
    await smoothScroll(page, await yOf(page, "Round 5"), 2500);
    await page.waitForTimeout(3000);
  },
};

for (const app of ["original", "nextjs", "sveltekit"]) {
  scenes[`app-${app}`] = async (page) => {
    const url = process.env[`${app.toUpperCase()}_URL`];
    if (!url) throw new Error(`${app.toUpperCase()}_URL is not set`);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await addTodos(page, ["Buy milk", "Walk the dog", "Write the report"]);
    await page.locator(".todo-list li").filter({ hasText: "Buy milk" }).locator(".toggle").click({ force: true });
    await page.waitForTimeout(900);
    await page.locator(".filters").getByText("Active", { exact: true }).click();
    await page.waitForTimeout(1400);
    await page.locator(".filters").getByText("All", { exact: true }).click();
    await page.waitForTimeout(1500);
  };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const shot of shots) {
    const scene = scenes[shot];
    if (!scene) throw new Error(`unknown shot: ${shot}`);
    const app = shot.startsWith("app-");
    const size = app ? { width: 640, height: 900 } : { width: 1920, height: 1080 };
    const context = await browser.newContext({
      viewport: size,
      colorScheme: "dark",
      recordVideo: { dir: outDir, size },
    });
    const page = await context.newPage();
    await scene(page);
    const video = page.video();
    await context.close();
    const target = path.join(outDir, `${shot}.webm`);
    fs.renameSync(await video.path(), target);
    console.log(`recorded ${target}`);
  }
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
