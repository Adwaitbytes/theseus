import { describe, expect, it } from "vitest";
import { behavior } from "../__tests__/fakes.js";
import { buildDraftPrompt, buildRedraftPrompt, lintBehaviors, type SeedContext } from "./draft.js";

const many = (n: number) => Array.from({ length: n }, (_, i) => behavior(`b-${i}`));

describe("lintBehaviors", () => {
  it("accepts clean, platform-neutral objectives", () => {
    expect(lintBehaviors(many(15))).toEqual([]);
  });

  it("flags URLs, selectors, frameworks, missing verifications and store mismatches", () => {
    const list = [
      ...many(12),
      behavior("url", { objective: "Open http://localhost:4170, store the count as 'url', verify it is 1." }),
      behavior("selector", { objective: "Click #new-todo then store the count as 'selector' and verify it." }),
      behavior("framework", { objective: "Check the jQuery list, store the count as 'framework' and verify it." }),
      behavior("no-verify", { objective: "Add an item and store the count as 'no_verify' for later use." }),
      behavior("mismatch", { objective: "Add an item, store the count as 'other_key', and verify it shows.", stores: ["mismatch"] }),
    ];
    const problems = lintBehaviors(list).join("\n");
    expect(problems).toContain(`behavior "url": the objective mentions a URL`);
    expect(problems).toContain(`behavior "selector": the objective mentions a selector`);
    expect(problems).toContain(`behavior "framework": the objective mentions "jQuery"`);
    expect(problems).toContain(`behavior "no-verify": the objective has no explicit verification`);
    expect(problems).toContain(`"stores" lists 'mismatch' but the objective never says "store ... as 'mismatch'"`);
    expect(problems).toContain(`the objective stores 'other_key' but "stores" does not list it`);
  });

  it("asks for the right number of behaviors and unique ids", () => {
    expect(lintBehaviors(many(3)).join("\n")).toContain("write between 10 and 30 behaviors");
    expect(lintBehaviors([...many(10), behavior("b-0")]).join("\n")).toContain(`behavior "b-0": duplicate id`);
  });
});

const seed: SeedContext = { file: "seed/SEED.md", emails: ["alice@example.com", "bob@example.com"] };
const seeded = (id: string, objective: string) => behavior(id, { objective, stores: ["value"] });

describe("lintBehaviors with a seed", () => {
  const clean = Array.from({ length: 10 }, (_, i) =>
    seeded(`s-${i}`, `Starting from the seeded app, open the article "Boring databases win", store the title as 'value', and verify it shows.`),
  );

  it("accepts sign-ins that name a seeded account, visible \"Sign in\" labels and new-account sign-ups", () => {
    const list = [
      ...clean,
      seeded("named", `Starting from the seeded app, sign in with email "alice@example.com" and password "conduit-demo", store the username as 'value', and verify it shows.`),
      seeded("label", `Starting from the seeded app, store the header links as 'value' and verify they include "Sign in" and "Sign up".`),
      seeded("signup", `Starting from the seeded app, sign up as "dave" with email "dave@example.com", confirm you are signed in, and store the username as 'value'.`),
    ];
    expect(lintBehaviors(list, { seed })).toEqual([]);
  });

  it("rejects a sign-in without a seeded email and an objective that assumes an empty app", () => {
    const list = [
      ...clean,
      seeded("anonymous", "Starting from the seeded app, sign in, publish an article, store its title as 'value', and verify it shows."),
      seeded("logged", "Starting from the seeded app, log in as carol, store the feed as 'value', and verify it is empty."),
      seeded("stranger", `Starting from the seeded app, sign in with email "mallory@example.com", store the name as 'value', and verify it.`),
      seeded("empty", "Starting from a fresh app with no saved data, store the feed as 'value' and verify it is empty."),
    ];
    const problems = lintBehaviors(list, { seed }).join("\n");
    expect(problems).toContain(`behavior "anonymous": the objective signs in without naming the account; use an email and password from seed/SEED.md (one of alice@example.com, bob@example.com)`);
    expect(problems).toContain(`behavior "logged": the objective signs in without naming the account`);
    expect(problems).toContain(`behavior "stranger": the objective signs in without naming the account`);
    expect(problems).toContain(`behavior "empty": the app is never empty; start "from the seeded app"`);
  });

  it("leaves sign-in wording alone when the app keeps no state", () => {
    expect(lintBehaviors([...clean, seeded("anonymous", "Sign in, store the name as 'value', and verify it.")])).toEqual([]);
  });
});

describe("seeded prompts", () => {
  const input = { appName: "Conduit", appDescription: "A Medium clone", crawlSummaryFile: "crawl.md", docFiles: [] };

  it("hands the drafting agent the seed doc and the seeded-start, named-account and seeded-content rules", () => {
    const prompt = buildDraftPrompt({ ...input, seed });
    expect(prompt).toContain("Read seed/SEED.md closely");
    expect(prompt).toContain(`Start from the seeded app`);
    expect(prompt).toContain(`sign in with email "alice@example.com" and password`);
    expect(prompt).toContain("Only reference seeded content that seed/SEED.md lists");
    expect(prompt).not.toContain("assume the app was just opened with no saved data");
  });

  it("keeps the clean-start rule without a seed", () => {
    const prompt = buildDraftPrompt(input);
    expect(prompt).toContain("assume the app was just opened with no saved data");
    expect(prompt).not.toContain("seeded app");
  });

  it("applies the same rules when redrafting", () => {
    const prompt = buildRedraftPrompt([{ behavior: behavior("b-1"), failure: "no account named" }], seed);
    expect(prompt).toContain("Read seed/SEED.md closely");
    expect(prompt).toContain("Whenever a behavior signs in, name the exact account from seed/SEED.md");
  });
});
