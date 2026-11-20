import { appendFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { TheseusEvent } from "@theseus/schema";
import { TheseusError } from "../errors.js";
import { sanitizeForPersistence } from "../sanitize.js";
import type { EventBus } from "./bus.js";

/**
 * Appends every event, sanitized for publishing, to an NDJSON file as it happens. Writes are synchronous on
 * purpose: a crash mid-voyage must leave a replayable log, in emit order.
 */
export function recordEvents(bus: EventBus, file: string): () => void {
  mkdirSync(dirname(file), { recursive: true });
  return bus.on((event) => {
    appendFileSync(file, `${JSON.stringify(sanitizeForPersistence(event))}\n`, "utf8");
  });
}

export function parseEventLines(text: string, source: string): TheseusEvent[] {
  const events: TheseusEvent[] = [];
  const lines = text.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === "") continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (error) {
      throw new TheseusError("file-invalid", `${source}:${index + 1} is not valid JSON`, { cause: error });
    }
    const parsed = TheseusEvent.safeParse(json);
    if (!parsed.success) {
      throw new TheseusError("file-invalid", `${source}:${index + 1} is not a TheseusEvent: ${parsed.error.message}`);
    }
    events.push(parsed.data);
  }
  return events;
}

export async function readEvents(file: string): Promise<TheseusEvent[]> {
  return parseEventLines(await readFile(file, "utf8"), file);
}
