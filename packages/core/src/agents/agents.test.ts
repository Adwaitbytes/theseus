import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeAgent } from "../__tests__/fakes.js";
import { claudeCodeArgs } from "./claude-code.js";
import { codexArgs } from "./codex.js";
import { runJsonTask } from "./json-task.js";
import { parseClaudeStreamLine, parseCodexStreamLine } from "./stream.js";

const cwd = "/work/nextjs";

describe("parseClaudeStreamLine (lines recorded from a real claude -p run)", () => {
  it("reads the model from the init event", () => {
    expect(parseClaudeStreamLine('{"type":"system","subtype":"init","cwd":"/work","model":"claude-sonnet-5-5","tools":[]}', cwd)).toEqual({
      lines: [],
      model: "claude-sonnet-5-5",
    });
  });

  it("turns tool calls and text into short lines with workspace-relative paths", () => {
    const write = `{"type":"assistant","message":{"model":"m","content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"${cwd}/app/page.tsx","content":"x"}}]}}`;
    const bash = '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Bash","input":{"command":"npm run build","description":"Build"}}]}}';
    const text = '{"type":"assistant","message":{"content":[{"type":"text","text":"Build passes.\\n\\nAll   done."}]}}';
    expect(parseClaudeStreamLine(write, cwd).lines).toEqual(["write app/page.tsx"]);
    expect(parseClaudeStreamLine(bash, cwd).lines).toEqual(["$ npm run build"]);
    expect(parseClaudeStreamLine(text, cwd).lines).toEqual(["Build passes. All done."]);
  });

  it("reports the result and ignores hooks, tool results, rate limits and junk", () => {
    expect(parseClaudeStreamLine('{"type":"result","subtype":"success","is_error":false,"duration_ms":3275}', cwd).lines).toEqual([
      "agent finished in 3s",
    ]);
    expect(parseClaudeStreamLine('{"type":"system","subtype":"hook_started"}', cwd).lines).toEqual([]);
    expect(parseClaudeStreamLine('{"type":"user","message":{"content":[{"type":"tool_result"}]}}', cwd).lines).toEqual([]);
    expect(parseClaudeStreamLine('{"type":"rate_limit_event"}', cwd).lines).toEqual([]);
    expect(parseClaudeStreamLine("plain text", cwd).lines).toEqual([]);
    expect(parseClaudeStreamLine("{broken", cwd).lines).toEqual([]);
  });
});

describe("parseCodexStreamLine (lines recorded from a real codex exec --json run)", () => {
  it("shows commands without the shell wrapper, file changes and messages", () => {
    expect(
      parseCodexStreamLine(
        `{"type":"item.completed","item":{"id":"item_2","type":"command_execution","command":"/bin/zsh -lc 'node --version'","aggregated_output":"v20\\n","exit_code":0,"status":"completed"}}`,
        cwd,
      ).lines,
    ).toEqual(["$ node --version"]);
    expect(
      parseCodexStreamLine(
        `{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"${cwd}/hello.txt","kind":"add"},{"path":"${cwd}/src/a.ts","kind":"update"}],"status":"completed"}}`,
        cwd,
      ).lines,
    ).toEqual(["write hello.txt", "edit src/a.ts"]);
    expect(parseCodexStreamLine('{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Created hello.txt."}}', cwd).lines).toEqual([
      "Created hello.txt.",
    ]);
  });

  it("ignores lifecycle events and in-progress items, and surfaces failures", () => {
    expect(parseCodexStreamLine('{"type":"thread.started","thread_id":"x"}', cwd).lines).toEqual([]);
    expect(parseCodexStreamLine('{"type":"item.started","item":{"id":"i","type":"command_execution","command":"ls"}}', cwd).lines).toEqual([]);
    expect(parseCodexStreamLine('{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Skill descriptions were shortened"}}', cwd).lines).toEqual([]);
    expect(parseCodexStreamLine('{"type":"turn.failed","error":{"message":"quota"}}', cwd).lines).toEqual(["agent stopped with an error: quota"]);
  });
});

describe("agent command lines (flags verified against claude 2.1.329 and codex-cli 0.146.0)", () => {
  it("runs claude headless with accept-edits and an explicit allowlist", () => {
    const args = claudeCodeArgs("build it", "sonnet");
    expect(args.slice(0, 2)).toEqual(["-p", "build it"]);
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
    expect(args[args.indexOf("--permission-prompts") + 1]).toBe("none");
    expect(args).toContain("Bash(npm *)");
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args.slice(-2)).toEqual(["--model", "sonnet"]);
  });

  it("runs codex exec sandboxed to the workspace with network for npm", () => {
    const args = codexArgs("build it", cwd, undefined);
    expect(args[0]).toBe("exec");
    expect(args[args.indexOf("--sandbox") + 1]).toBe("workspace-write");
    expect(args[args.indexOf("-C") + 1]).toBe(cwd);
    expect(args).toContain("sandbox_workspace_write.network_access=true");
    expect(args.at(-1)).toBe("build it");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });
});

describe("runJsonTask", () => {
  const schema = z.object({ items: z.array(z.string()).min(1) });

  it("retries once with the validation errors, then succeeds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-json-"));
    const agent = new FakeAgent(async (input, call) => {
      await writeFile(join(input.cwd, "out.json"), call === 1 ? '{"items": []}' : '{"items": ["a"]}', "utf8");
    });
    const value = await runJsonTask({ agent, cwd: dir, prompt: "go", outputFile: "out.json", schema, onOutput: () => {} });
    expect(value).toEqual({ items: ["a"] });
    expect(agent.prompts).toHaveLength(2);
    expect(agent.prompts[1]).toContain("was rejected");
    expect(agent.prompts[1]).toContain("items");
  });

  it("feeds lint problems back and fails after the second invalid answer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-json-"));
    const agent = new FakeAgent(async (input) => {
      await writeFile(join(input.cwd, "out.json"), '{"items": ["bad"]}', "utf8");
    });
    await expect(
      runJsonTask({ agent, cwd: dir, prompt: "go", outputFile: "out.json", schema, lint: () => ["no bad items"], onOutput: () => {} }),
    ).rejects.toMatchObject({ code: "agent-output-invalid" });
    expect(agent.prompts[1]).toContain("- no bad items");
  });

  it("does not trust a file left over from a previous run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "theseus-json-"));
    await writeFile(join(dir, "out.json"), '{"items": ["stale"]}', "utf8");
    const agent = new FakeAgent();
    await expect(runJsonTask({ agent, cwd: dir, prompt: "go", outputFile: "out.json", schema, onOutput: () => {} })).rejects.toThrow(/did not write/);
  });
});
