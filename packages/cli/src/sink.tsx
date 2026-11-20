import { render } from "ink";
import type { TheseusEvent, Voyage } from "@theseus/schema";
import { App } from "./tui/App.js";
import type { ViewSeed } from "./tui/state.js";
import { ViewStore } from "./tui/store.js";
import { colorEnabled } from "./tui/theme.js";

/** Where engine events go: the live TUI, or NDJSON on stdout for machines. */
export interface EventSink {
  push(event: TheseusEvent): void;
  finish(ending: { voyage?: Voyage; error?: string }): Promise<void>;
}

export function jsonSink(write: (line: string) => void = (line) => process.stdout.write(line)): EventSink {
  return {
    push: (event) => write(`${JSON.stringify(event)}\n`),
    finish: async () => {},
  };
}

export function tuiSink(seed: ViewSeed): EventSink {
  const store = new ViewStore(seed);
  const instance = render(<App store={store} color={colorEnabled()} />, { exitOnCtrlC: false, patchConsole: true });
  return {
    push: (event) => store.push(event),
    finish: async (ending) => {
      store.finish(ending);
      // Let Ink paint the summary before tearing down.
      await new Promise((resolve) => setTimeout(resolve, 50));
      instance.unmount();
      await instance.waitUntilExit();
    },
  };
}
