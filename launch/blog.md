---
title: "I deleted a 2012 jQuery app and let agents regrow it in four stacks. Kane CLI decided when they were done."
published: false
tags: testing, ai, webdev, opensource
cover_image: {{BLOG_COVER_URL}}
---

The Ship of Theseus is an old puzzle. You replace a ship's planks one at a time until no original plank is left. Is it still the same ship?

Software teams answer a version of that question every time they rewrite something. The jQuery app becomes a React app, the AngularJS app becomes whatever comes next, the web app grows a native twin. Every line changes. The promise is that the behavior does not.

That promise is usually checked by people clicking around for a week, plus a test suite that was written for the old code and quietly deleted along with it. I wanted a better answer, so I built Theseus for the KaneCLI hackathon. It deletes an app's code, has coding agents regrow it in other stacks, and uses [Kane CLI]({{KANE_CLI_URL}}) to prove that every behavior still matches the original. The answer to the old puzzle, in this version, is a certificate.

Repo: {{REPO_URL}}. Four minute demo: {{DEMO_VIDEO_URL}}.

## The problem: rewrites drift, and agents grade their own homework

Two things go wrong in a rewrite.

The first is drift. Old apps are full of behavior nobody wrote down. In TodoMVC, an edit that you cancel with Escape restores the old text. A todo you edit down to whitespace gets deleted. The counter says "1 item left", not "1 items left". None of this lives in a ticket. It lives in a 2012 `app.js` file, and a rewrite either reproduces it by luck or loses it.

The second problem is newer. When a coding agent does the rewrite, the agent usually also writes the tests, runs them, and reports success. The tests describe the new code because the new code is what the agent was looking at. That is grading your own homework. Unit tests also do not survive the move from jQuery to Next.js, and they certainly do not survive the move from a browser to an Android emulator, because they are written against code structure that no longer exists.

Then there is the one kind of test that does survive: a sentence. "Add a todo called Alpha, mark it complete, and check that the counter reads 0 items left." That sentence is just as true of the jQuery app as it is of a SvelteKit app or a native Expo app on iOS. Intent-level, plain-English tests are the only part of a codebase that outlives a rewrite across frameworks and platforms. So I started treating them as the real source code.

## How Theseus works

Theseus runs a voyage in four stages. One command does all of it:

```sh
npx theseus-cli regrow http://localhost:3000 --to nextjs,sveltekit,expo-android,expo-ios
```

**Capture.** Theseus crawls the running original (screens, DOM, screenshots) and any docs you hand it. A drafting agent writes platform-neutral behaviors in plain English, each with values to store along the way, like `items_left` or the text of an edited todo. Then Kane runs every draft against the original. Only the ones Kane proves there survive.

Some drafts fail on the original because the draft is wrong, not the app. Kane's verdict includes a root-cause analysis with a family, and when that family is `automation_bug`, Theseus hands the test back to the drafting agent along with Kane's suggested fix. In one of the real runs we recorded, a draft expected "3 items left" after adding two todos. Kane's verdict: "The test expected one todo to already exist, but the app opened with an empty list", with the suggestion to expect "2 items left" instead. The draft was repaired and passed on the next run. On TodoMVC, {{TODOMVC_DRAFTED}} drafts became {{TODOMVC_BEHAVIORS}} proven behaviors, {{TESTS_REPAIRED_BY_RCA}} of them repaired this way.

**Strength.** A spec that passes everything is worthless, so Theseus measures it. It plants realistic bugs in a copy of the original (an off-by-one counter, a missing trim, a swapped filter, a removed storage write) and checks whether any behavior fails. The spec caught {{BUGS_CAUGHT}} of {{BUGS_PLANTED}} planted bugs. Any bug that survives ({{SURVIVING_MUTANT}} on this voyage) is printed on the certificate with its patch, because it marks exactly where the spec is blind.

**Regrow.** Here is the part that feels a little reckless the first time. The code is gone. Each target gets an empty directory containing `SPEC.md` and reference screenshots. No original source, not in the workspace, not in the prompt, not in the feedback. A builder agent, Claude Code or Codex, builds the app. Theseus starts it, and Kane runs every behavior against it.

**Parity.** When a target is green, every behavior runs once more on both the original and the regrowth, and Theseus compares the values Kane stored. A behavior is identical when both runs pass and every stored value matches. It is diverged when both pass but a value differs. The result is a parity certificate per target: {{PARITY_CERT_URL}}.

## The loop, round by round

This is where Kane does the work that matters. After each round, every failing behavior goes back to the builder as Kane reported it: the failing step, the reason, the root cause and the suggested fix, plus the annotated screenshot from the evidence pack. The agent never hears Theseus's opinion. It hears what happened in the running app.

The Next.js regrowth of TodoMVC went like this:

- Round 1: {{NEXTJS_R1_PASSED}} of {{TODOMVC_BEHAVIORS}} passing. Kane's top failure: {{NEXTJS_R1_TOP_FAILURE}}.
- Round 2: {{NEXTJS_R2_PASSED}} of {{TODOMVC_BEHAVIORS}}. {{NEXTJS_R2_NOTE}}
- Green in round {{NEXTJS_ROUNDS}}.

The native app was harder, as expected. Expo on the Android emulator started at {{EXPO_ANDROID_R1_PASSED}} of {{TODOMVC_BEHAVIORS}} and needed {{EXPO_ANDROID_ROUNDS}} rounds. The interesting failure was {{EXPO_ANDROID_HARDEST_FAILURE}}. The iOS build of the same Expo app took {{EXPO_IOS_ROUNDS}} rounds, and SvelteKit took {{SVELTEKIT_ROUNDS}}.

Because Kane classifies every failure, the loop can route it. Product bugs go to the builder. Test bugs go to the drafting agent. Exit code 2, Kane's signal for an infrastructure problem, gets retried and never counts against the build. That routing is what keeps the loop from chasing its own tail.

You can also race agents on the same stack:

```sh
npx theseus-cli regrow http://localhost:3000 --to nextjs --race codex,claude-code
```

On {{RACE_STACK}}, Codex reached green in {{RACE_CODEX_ROUNDS}} rounds and Claude Code in {{RACE_CLAUDE_ROUNDS}}. The winner was {{RACE_WINNER}}. The ranking rule is fixed in code: green first, then fewer rounds, then more identical behaviors, then fewer credits.

## What Kane caught

The headline numbers: across the TodoMVC voyage Kane made {{TOTAL_KANE_RUNS}} runs and sent {{KANE_FAILURES_FED_BACK}} failures back to builders. A few were the kind of thing I would have missed reviewing the code by hand:

- {{CAUGHT_EXAMPLE_1}}
- {{CAUGHT_EXAMPLE_2}}
- {{CAUGHT_EXAMPLE_3}}

And one divergence survived to the certificate on purpose: {{EXAMPLE_DIVERGENCE}}. Both runs passed, but the stored values differ. Whether that difference matters is your call, and the certificate leaves it to you instead of rounding it away.

Everything is linked. Each certificate cell points at the Kane evidence for that run, and each target's spec is committed as Kane `_test.md` files, so you can rerun the proof yourself without Theseus in the middle:

```sh
npx theseus-cli suite runs/todomvc-jquery --target nextjs --parallel 4
```

## Limitations, stated plainly

Parity is not equivalence. The certificate covers the behaviors in the spec and nothing else. Performance, accessibility, visual detail beyond what Kane checks, and rare timing are not tested by construction.

Kane is an AI agent operating a real interface, so a pass is strong evidence rather than proof. Theseus narrows that gap by proving every behavior on the original first and by keeping every evidence pack, so a person can audit any step.

Clean room means the builder cannot see the source. It does not mean the model has never seen TodoMVC, which it almost certainly has. That is why the second voyage is the AngularJS RealWorld Conduit app with its own backend and a fixed seed: a full-stack app on an end-of-life framework. Its regrowth into {{CONDUIT_TARGET}} took {{CONDUIT_ROUNDS}} rounds over {{CONDUIT_BEHAVIORS}} behaviors.

Agents can overfit to feedback, for example by special-casing a test string. The round history is committed next to the certificate so you can read them together.

Mobile is slow. Emulator and simulator runs go one at a time. And none of this is free: the TodoMVC voyage cost {{TOTAL_KANE_CREDITS}} Kane credits, and every voyage page shows its own bill.

## Try it

```sh
npx theseus-cli doctor
npx theseus-cli demo
npx theseus-cli regrow http://localhost:3000 --to nextjs,expo-android
```

`demo` replays the recorded TodoMVC voyage in the live terminal view and needs no credentials. `doctor` checks Node, Kane sign-in and credits, Claude Code, Codex, and your emulator and simulator before you spend anything.

The code, the committed runs and the method write-up are at {{REPO_URL}}. The site, with the certificates and a round-by-round replay, is at {{SITE_URL}}.

Theseus was built for the KaneCLI Online Hackathon by TestMu AI. If you have an old app you would like to see regrown, open an issue with a URL, and I will point Theseus at it.
