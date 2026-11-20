import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { behavior } from "../__tests__/fakes.js";
import { orderForMutant, strengthScore } from "../strength.js";
import { mapConcurrent } from "./concurrency.js";
import { resolveStaticPath, serveStatic } from "./static-server.js";

describe("mapConcurrent", () => {
  it("keeps at most `limit` tasks in flight and preserves order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapConcurrent([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, n));
      inFlight -= 1;
      return n * 10;
    });
    expect(result).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});

describe("static server", () => {
  it("refuses paths that escape the root", () => {
    expect(resolveStaticPath("/srv/app", "/../etc/passwd")).toBeNull();
    expect(resolveStaticPath("/srv/app", "/%2e%2e/etc/passwd")).toBeNull();
    expect(resolveStaticPath("/srv/app", "/a%00b")).toBeNull();
    expect(resolveStaticPath("/srv/app", "/js/app.js?v=1")).toBe("/srv/app/js/app.js");
  });

  it("serves files with a content type, index.html for directories and 404 otherwise", async () => {
    const root = await mkdtemp(join(tmpdir(), "theseus-static-"));
    await mkdir(join(root, "js"));
    await writeFile(join(root, "index.html"), "<h1>todos</h1>", "utf8");
    await writeFile(join(root, "js", "app.js"), "1", "utf8");
    const server = await serveStatic(root, 0);
    try {
      const index = await fetch(server.url);
      expect(index.headers.get("content-type")).toContain("text/html");
      expect(await index.text()).toBe("<h1>todos</h1>");
      const script = await fetch(`${server.url}js/app.js`);
      expect(script.headers.get("content-type")).toContain("text/javascript");
      await script.text();
      const missing = await fetch(`${server.url}nope.css`);
      expect(missing.status).toBe(404);
      await missing.text();
      const post = await fetch(server.url, { method: "POST" });
      expect(post.status).toBe(405);
      await post.text();
    } finally {
      await server.close();
    }
  });
});

describe("strength helpers", () => {
  it("tries the mutant's own area first", () => {
    const list = [behavior("a", { area: "Adding" }), behavior("e", { area: "Editing" }), behavior("f", { area: "editing " })];
    expect(orderForMutant(list, "Editing").map((b) => b.id)).toEqual(["e", "f", "a"]);
  });

  it("scores the share of killed mutants", () => {
    const report = strengthScore([
      { id: "m1", description: "d", patch: "p", killedBy: ["a"] },
      { id: "m2", description: "d", patch: "p", killedBy: [] },
    ]);
    expect(report).toMatchObject({ killed: 1, total: 2, score: 0.5 });
    expect(strengthScore([]).score).toBe(0);
  });
});
