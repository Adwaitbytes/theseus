import { describe, expect, it } from "vitest";
import { readFixture } from "./__fixtures__/helpers.js";
import { LineSplitter, parseKaneLine, parseKaneStream } from "./ndjson.js";

describe("LineSplitter", () => {
  it("reassembles lines split across chunks and handles CRLF", () => {
    const splitter = new LineSplitter();
    expect(splitter.push('{"step":1,"sta')).toEqual([]);
    expect(splitter.push('tus":"done"}\r\n{"type":')).toEqual(['{"step":1,"status":"done"}']);
    expect(splitter.push('"error"}\n\n')).toEqual(['{"type":"error"}']);
    expect(splitter.flush()).toEqual([]);
  });

  it("returns a trailing line without a newline on flush", () => {
    const splitter = new LineSplitter();
    splitter.push('{"step":1}');
    expect(splitter.flush()).toEqual(['{"step":1}']);
    expect(splitter.flush()).toEqual([]);
  });
});

describe("parseKaneLine", () => {
  it("recognises untyped progress lines and keeps child ids", () => {
    expect(parseKaneLine('{"step":4,"status":"done","remark":"x","child_id":"c1","v":1}')).toEqual({
      kind: "progress",
      event: { step: 4, status: "done", remark: "x", child_id: "c1" },
    });
  });

  it("never treats a typed line as a step", () => {
    expect(parseKaneLine('{"type":"step","step":1,"status":"done","remark":"x"}')).toBeNull();
  });

  it("skips non-JSON, non-object and unknown typed lines", () => {
    expect(parseKaneLine("Skill update available")).toBeNull();
    expect(parseKaneLine("[1,2]")).toBeNull();
    expect(parseKaneLine('{"broken":')).toBeNull();
    expect(parseKaneLine('{"type":"bifurcation","flows":"[]"}')).toBeNull();
    expect(parseKaneLine('{"no":"step"}')).toBeNull();
  });

  it("accepts result_code as a number or a string and drops mistyped optional fields", () => {
    const line = parseKaneLine('{"type":"run_end","status":"failed","result_code":750,"duration":"slow","credits":3}');
    expect(line?.kind).toBe("run_end");
    if (line?.kind !== "run_end") return;
    expect(line.event.result_code).toBe("750");
    expect(line.event.duration).toBeUndefined();
    expect(line.event.credits).toBe(3);
    const textual = parseKaneLine('{"type":"run_end","status":"failed","result_code":"740"}');
    expect(textual?.kind === "run_end" && textual.event.result_code).toBe("740");
  });

  it("reads the coverage pack path", () => {
    expect(parseKaneLine('{"type":"coverage","status":"skipped","pack":"/x/y.evidence"}')).toEqual({
      kind: "coverage",
      event: { type: "coverage", status: "skipped", pack: "/x/y.evidence" },
    });
  });
});

describe("parseKaneStream", () => {
  it("survives a stream full of junk", () => {
    const events = parseKaneStream(readFixture("synthetic/junk.ndjson"));
    expect(events.map((e) => e.kind)).toEqual(["stream_start", "warning", "progress", "progress", "run_end"]);
  });

  it.each(["real/pass.ndjson", "real/fail.ndjson"])("parses the recorded stream %s", (file) => {
    const events = parseKaneStream(readFixture(file));
    expect(events[0]?.kind).toBe("stream_start");
    expect(events.at(-1)?.kind).toBe("run_end");
    expect(events.some((e) => e.kind === "coverage" && e.event.pack?.endsWith(".evidence"))).toBe(true);
  });
});
