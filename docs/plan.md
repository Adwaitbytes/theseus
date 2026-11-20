# Theseus build plan

Deadline: Thu 26 Nov 2026, 11:59 PM IST. Internal submission target: 26 Nov 6:00 PM IST.

## What Theseus is

Delete an app's code and it grows back in any stack, including native mobile, while Kane CLI proves every behavior still matches the original.

1. **Capture**: crawl the running original (screens, DOM, screenshots) plus any docs, have an agent draft platform-neutral plain-English behaviors, and keep only the behaviors Kane proves pass on the original (the baseline).
2. **Strength**: plant realistic bugs in a copy of the original and record which behaviors kill them. The score says how much the spec can be trusted.
3. **Regrow (clean room)**: each target gets an empty workspace that holds only `SPEC.md` (the behaviors) and reference screenshots, never the original source. A builder agent (Claude Code or Codex) builds it. Kane runs every behavior, failures (step, reason, RCA, suggested fix) go back to the agent, and this repeats until green or until the round cap.
4. **Parity**: run every behavior on the original and on each regrown target, compare the values Kane stored (`final_state`), and emit a parity certificate per target.

Hero voyage: jQuery TodoMVC (2012, `examples/todomvc-jquery/original`), regrown into Next.js, SvelteKit, an Expo app on the Android emulator and the same Expo app on the iOS simulator.
Stretch voyage: the AngularJS RealWorld app (AngularJS is end of life, so this is a real migration).

## Repo layout

```
packages/schema   zod contract shared by everything (done)
packages/kane     Kane CLI adapter; implements packages/kane/src/contract.ts
packages/core     engine: capture, strength, regrow loop, parity, agent adapters, target runners, event bus
packages/cli      `theseus` binary (npm name "theseus-cli"): commander + Ink live TUI, plus `theseus demo` replay
apps/web          Next.js site: the story, the replayed regrowth, parity certificates, methodology, install
examples/<app>    originals and their docs
runs/<voyage-id>  committed artifacts: voyage.json (schema Voyage), events.ndjson, artifacts/ (screenshots, test.md export)
```

## Contracts (do not change without the integrator)

- `packages/schema/src/index.ts`: Behavior, Target, Spec, KaneOutcome, Round, Regrowth, ParityReport, StrengthReport, Voyage, TheseusEvent.
- `packages/kane/src/contract.ts`: KaneClient.
- Kane invocation for web targets: `kane-cli run "<objective>" --url <url> --agent --headless --mode testing [--max-steps N] < /dev/null`.
- Kane invocation for mobile targets: `kane-cli run "<objective>" --target emulator|simulator --app <path> --agent < /dev/null` (one at a time).
- Exit codes: 0 passed, 1 failed, 2 infrastructure (retry, never blame the build), 3 timeout.
- A regrown app must start with `npm install && npm run build && npm run start` and listen on the `PORT` environment variable. Mobile targets build an `.apk` and an iOS simulator `.app`.

## Engineering bar

TypeScript strict, no `any`, zod at every boundary (Kane NDJSON, agent output, files on disk). Vitest with recorded NDJSON fixtures. No swallowed errors. No dead code. Writing rules for every piece of copy: no em or en dashes, no emojis, no hype words.

## Workstreams

| Stream | Owner | Output |
|---|---|---|
| Kane adapter | agent | packages/kane, tested against recorded and synthetic streams |
| Engine + CLI | agent | packages/core, packages/cli, `theseus voyage` end to end |
| Website | agent | apps/web, deployed on Vercel, design-critic clean |
| Mobile pipeline | agent | Expo target runner: build APK and iOS .app, install, Kane on emulator and simulator |
| Integration, real runs, video, launch | integrator | runs/todomvc-jquery, README, demo, posts |

## Schedule

- Sat 21: contracts, adapter, engine skeleton, site skeleton, first Kane run once logged in.
- Sun 22: capture + baseline on TodoMVC, regrow loop green on Next.js, site on real data.
- Mon 23: SvelteKit + Expo Android, strength report, mid-week post.
- Tue 24: iOS, parity certificates, design passes, `theseus demo` replay, README.
- Wed 25: video, launch posts, stretch voyage if credits allow.
- Thu 26: fixes only, submit by 6 PM IST.
