import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { Spec } from "@theseus/schema";
import { originTarget, type PhaseContext } from "../context.js";
import { crawl as playwrightCrawl, renderCrawlSummary } from "./crawl.js";
import { draftBehaviors } from "./draft.js";

export const CRAWL_SUMMARY_FILE = "crawl.md";

export function captureDir(ctx: PhaseContext): string {
  return join(ctx.paths.artifacts, "capture");
}

/** Crawls the running original, then has the drafting agent turn the crawl and the docs into behaviors. */
export async function capture(ctx: PhaseContext): Promise<Spec> {
  const { config, deps } = ctx;
  const dir = captureDir(ctx);
  const screens = join(dir, "screens");
  await mkdir(screens, { recursive: true });
  const origin = originTarget(config);

  const crawl = deps.crawl ?? playwrightCrawl;
  const result = await crawl({
    startUrl: config.original.url,
    voyageDir: ctx.paths.root,
    outDir: screens,
    onProgress: (message) => deps.bus.log("info", message),
  });
  deps.bus.log("info", `crawled ${result.pages.length} screens and ${result.states.length} interactive states`);
  await writeFile(
    join(dir, CRAWL_SUMMARY_FILE),
    renderCrawlSummary(result, (voyagePath) => relative(dir, join(ctx.paths.root, voyagePath))),
    "utf8",
  );

  const docFiles: string[] = [];
  if (config.docs.length > 0) await mkdir(join(dir, "docs"), { recursive: true });
  for (const doc of config.docs) {
    const name = join("docs", basename(doc));
    await copyFile(doc, join(dir, name));
    docFiles.push(name);
  }

  const agent = deps.createAgent(config.draftAgent.agent, config.draftAgent.model);
  const behaviors = await draftBehaviors({
    agent,
    cwd: dir,
    input: { appName: config.app.name, appDescription: config.app.description, crawlSummaryFile: CRAWL_SUMMARY_FILE, docFiles },
    onOutput: (text) => deps.bus.emit({ type: "agent-output", targetId: origin.id, round: 1, text }),
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
  });
  deps.bus.log("info", `drafted ${behaviors.length} behaviors`);
  return {
    version: 1,
    app: { name: config.app.name, description: config.app.description, origin },
    capturedAt: new Date().toISOString(),
    behaviors,
  };
}
