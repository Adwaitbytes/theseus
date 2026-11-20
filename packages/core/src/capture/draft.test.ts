import { describe, expect, it } from "vitest";
import { behavior } from "../__tests__/fakes.js";
import { lintBehaviors } from "./draft.js";

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
