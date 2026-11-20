import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { z } from "zod";
import { errorMessage } from "../errors.js";

export const CrawlSnapshot = z.object({
  label: z.string(),
  url: z.string(),
  title: z.string(),
  /** Relative to the voyage directory. */
  screenshot: z.string(),
  aria: z.string(),
});
export type CrawlSnapshot = z.infer<typeof CrawlSnapshot>;

export const CrawlResult = z.object({
  startUrl: z.string(),
  crawledAt: z.string().datetime(),
  pages: z.array(CrawlSnapshot),
  states: z.array(CrawlSnapshot),
});
export type CrawlResult = z.infer<typeof CrawlResult>;

export interface CrawlOptions {
  readonly startUrl: string;
  readonly voyageDir: string;
  /** Directory, inside the voyage, for screenshots. */
  readonly outDir: string;
  readonly maxPages?: number;
  readonly onProgress?: (message: string) => void;
}

const SAMPLE_ITEMS = ["Buy milk", "Walk the dog", "Write the report"];
const ARIA_LIMIT = 6000;

/** Hash routes (`#/active`) are distinct screens in single-page apps; plain anchors (`#top`) are not. */
export function crawlKey(url: string): string {
  const parsed = new URL(url);
  const hash = parsed.hash.startsWith("#/") || parsed.hash.startsWith("#!/") ? parsed.hash : "";
  return `${parsed.origin}${parsed.pathname}${parsed.search}${hash}`;
}

async function sameOriginLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs: string[] = [];
  for (const anchor of await page.locator("a[href]").all()) {
    const href = await anchor.getAttribute("href");
    if (href === null || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    hrefs.push(new URL(href, page.url()).href);
  }
  return [...new Set(hrefs.filter((href) => href.startsWith(origin)).map(crawlKey))];
}

async function snapshot(page: Page, label: string, file: string, voyageDir: string): Promise<CrawlSnapshot> {
  await page.screenshot({ path: file, fullPage: true });
  const aria = await page.locator("body").ariaSnapshot();
  return {
    label,
    url: page.url(),
    title: await page.title(),
    screenshot: relative(voyageDir, file),
    aria: aria.length > ARIA_LIMIT ? `${aria.slice(0, ARIA_LIMIT)}\n...` : aria,
  };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
    // Apps that poll never go idle; the load event already fired, which is enough for a snapshot.
  });
}

/**
 * Exercises the start page the way a first-time user would: type into the first
 * text field and submit, then toggle the first checkbox. Generic on purpose; the
 * drafting agent, not the crawler, decides what the behaviors are.
 */
async function probeInteractions(context: BrowserContext, options: CrawlOptions, links: readonly string[]): Promise<CrawlSnapshot[]> {
  const page = await context.newPage();
  const states: CrawlSnapshot[] = [];
  const shot = (name: string): string => join(options.outDir, `state-${states.length + 1}-${name}.png`);
  await page.goto(options.startUrl, { waitUntil: "load" });
  await settle(page);
  const textbox = page.getByRole("textbox").first();
  if ((await textbox.count()) > 0 && (await textbox.isVisible())) {
    for (const item of SAMPLE_ITEMS) {
      await textbox.fill(item);
      await textbox.press("Enter");
    }
    states.push(await snapshot(page, `after typing ${SAMPLE_ITEMS.length} entries into the first text field and pressing Enter after each`, shot("entries"), options.voyageDir));
  }
  const checkbox = page.getByRole("checkbox").first();
  if ((await checkbox.count()) > 0 && (await checkbox.isVisible())) {
    await checkbox.click();
    states.push(await snapshot(page, "after clicking the first checkbox", shot("toggled"), options.voyageDir));
  }
  for (const link of links.slice(0, 6)) {
    if (crawlKey(link) === crawlKey(options.startUrl)) continue;
    await page.goto(link, { waitUntil: "load" });
    await settle(page);
    states.push(await snapshot(page, `the screen at ${new URL(link).hash || new URL(link).pathname} with the sample data above`, shot("link"), options.voyageDir));
  }
  await page.close();
  return states;
}

export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  await mkdir(options.outDir, { recursive: true });
  const maxPages = options.maxPages ?? 10;
  const origin = new URL(options.startUrl).origin;
  const browser = await chromium.launch({ headless: true });
  try {
    const pages: CrawlSnapshot[] = [];
    const queue = [crawlKey(options.startUrl)];
    const seen = new Set(queue);
    const allLinks: string[] = [];
    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift() as string;
      options.onProgress?.(`crawling ${url}`);
      // A fresh context per page means a clean state (no storage left over from a previous page).
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "load" });
        await settle(page);
        pages.push(await snapshot(page, `page ${pages.length + 1}`, join(options.outDir, `page-${pages.length + 1}.png`), options.voyageDir));
        for (const link of await sameOriginLinks(page, origin)) {
          allLinks.push(link);
          if (!seen.has(link)) {
            seen.add(link);
            queue.push(link);
          }
        }
      } catch (error) {
        options.onProgress?.(`skipped ${url}: ${errorMessage(error)}`);
      } finally {
        await context.close();
      }
    }
    options.onProgress?.("probing interactive states");
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    let states: CrawlSnapshot[];
    try {
      states = await probeInteractions(context, options, [...new Set(allLinks)]);
    } finally {
      await context.close();
    }
    const result: CrawlResult = { startUrl: options.startUrl, crawledAt: new Date().toISOString(), pages, states };
    await writeFile(join(options.outDir, "crawl.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  } finally {
    await browser.close();
  }
}

export function renderCrawlSummary(result: CrawlResult, screenshotPath: (voyagePath: string) => string = (path) => path): string {
  const section = (snap: CrawlSnapshot): string =>
    [
      `### ${snap.label}: ${snap.title || "(untitled)"}`,
      "",
      `Screenshot: ${screenshotPath(snap.screenshot)}`,
      "",
      "```yaml",
      snap.aria,
      "```",
      "",
    ].join("\n");
  return [
    `# Crawl of the original app`,
    "",
    `Start URL: ${result.startUrl}`,
    "",
    "## Screens reachable from the start URL",
    "",
    ...result.pages.map(section),
    "## Interactive states",
    "",
    ...result.states.map(section),
  ].join("\n");
}
