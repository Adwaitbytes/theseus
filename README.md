# Theseus

**Delete an app's code and it grows back in any stack, including native mobile, while Kane CLI proves every behavior still matches the original.**

Theseus captures what a running app does as plain-English [Kane CLI](https://github.com/LambdaTest/kane-cli) tests, keeps only the ones Kane proves on the original, then has coding agents rebuild the app from that spec alone, in a clean room that never contains the original source. Kane tests every rebuild in a real browser or on an emulator, sends its failures (failing step, reason, root cause, suggested fix) back to the agent, and repeats until every behavior passes. A parity certificate then compares the exact values Kane read on the original with the values it read on each rebuild.

The idea underneath: tests that describe intent in plain English are the only tests that survive a rewrite across frameworks, and even from web to native. Treated that way, they are the real source code of a product.

Demo video (4 minutes): https://youtu.be/J3EE_QQQbhg

Built for the [KaneCLI Online Hackathon](https://www.kaneclihack.sh) by TestMu AI. Not to be confused with other rewrite checkers: Theseus starts from deleted code, rebuilds from Kane-proven tests alone, and goes all the way to a native Android app.

## For judges (one click each)

| Bar or dimension | Evidence |
|---|---|
| Works end to end | Live original and rebuilds: [jQuery original](https://theseus-todomvc-original.vercel.app), [Next.js](https://theseus-todomvc-nextjs.vercel.app), [SvelteKit](https://theseus-todomvc-sveltekit.vercel.app); certificates at [theseus-umber.vercel.app](https://theseus-umber.vercel.app/voyages/todomvc-jquery); credential-free replay: `node packages/cli/dist/index.js demo runs/todomvc-jquery` |
| Kane caught or proved something | Kane exposed a false green in our own baseline ([video 0:58](https://youtu.be/J3EE_QQQbhg?t=58)); every certificate cell is a Kane run in [`runs/`](runs) |
| Agent and Kane talked | Kane's failing step, reason, root cause and fix go back to Codex every round ([video 1:43](https://youtu.be/J3EE_QQQbhg?t=103)); each round is a commit in [`ROUNDS.md`](examples/todomvc-jquery/regrown/nextjs/ROUNDS.md) |
| Ships | Native Android 21 of 22 identical, SvelteKit 20 of 22, Next.js 19 of 22, RealWorld full stack 13 of 16 ([video 3:02](https://youtu.be/J3EE_QQQbhg?t=182)) |
| Verified | Kane proves every spec behavior on the original before any rebuild; failures Kane blames on its own run are rerun instead of sent to the agent |
| Closed loop | Round by round replay: [Next.js rounds](https://theseus-umber.vercel.app/voyages/todomvc-jquery/nextjs) |
| Craft | `theseus regrow <url> --to nextjs,expo-android`, `theseus verify`, `theseus doctor`; about 290 tests; [regrown source](examples/todomvc-jquery/regrown) |

## Status (live voyage, updated as runs finish)

Hero voyage: the 2012 jQuery TodoMVC (`examples/todomvc-jquery`, MIT, vendored unchanged).

| Step | Result |
|---|---|
| Capture | 22 behaviors drafted from a crawl of the running app and the official TodoMVC spec |
| Baseline | 22 of 22 proven by Kane on the original; a later `theseus verify` showed one of them (`persist-items`) had been a false green, and the certificate records that |
| SvelteKit regrowth (Codex, clean room) | 22 of 22 proven on the first build; parity: 20 identical, 1 diverged, 1 failed on the original |
| Next.js regrowth (Codex, clean room) | 22 of 22 by round 4; the final regression pass caught `counter-plural` again (Kane's own root cause says the app is right), ending at 21 of 22; parity: 19 identical |
| Expo on Android (Codex, clean room, native) | 21 of 22 proven on the Android emulator from the plain-English spec; parity: 21 identical, the one miss is the original's own false green |
| Second voyage: AngularJS RealWorld "Conduit", full stack into Next.js (Codex) | 16 behaviors proven on the original, 14 of 16 proven on the rebuild by round 2; parity: 13 identical |

Use them live (Kane re-verified both regrowths against these public URLs): [original jQuery TodoMVC](https://theseus-todomvc-original.vercel.app), [Next.js regrowth](https://theseus-todomvc-nextjs.vercel.app), [SvelteKit regrowth](https://theseus-todomvc-sveltekit.vercel.app). Certificates and round-by-round replays: [theseus-umber.vercel.app](https://theseus-umber.vercel.app/voyages/todomvc-jquery). The regrown source code is in `examples/todomvc-jquery/regrown/`, with each round's commit in `ROUNDS.md`. One honest note: Codex pinned Next.js 15.5.2, which Vercel blocks as vulnerable, so the deployed copy runs the patched 15.5.29; the committed source is unchanged.

Every number in this table comes from a recorded run under `runs/`. Nothing here is projected.

## Try it

You need Node 24 or newer and pnpm. Regrowing also needs Kane CLI signed in (`npm i -g @testmuai/kane-cli`, then `kane-cli login --oauth`) and Codex or Claude Code. The demo replay needs none of that.

```sh
git clone https://github.com/Adwaitbytes/theseus && cd theseus
pnpm install && pnpm build
alias theseus="node $PWD/packages/cli/dist/index.js"

theseus doctor                                   # checks Node, Kane sign-in and credits, agents, emulator, simulator
theseus demo runs/todomvc-jquery                 # replays the recorded voyage in the live terminal view
theseus regrow http://localhost:3000 --to nextjs,expo-android --agent codex
```

Other commands: `theseus verify` re-proves one certificate cell live with Kane, `theseus suite` runs the exported `_test.md` files as one Kane suite, and `--race codex,claude-code` regrows the same stack with two agents and compares them. Run `theseus --help` for the full list.

## How it works

1. **Capture.** Crawl the running original and any docs, and have a drafting agent write platform-neutral objectives that end with exact extractions ("store the footer counter text as 'counter_text'").
2. **Baseline.** Kane runs every draft on the original. Only behaviors Kane proves there survive. When Kane's root-cause analysis blames the test instead of the app, the drafting agent rewrites it from Kane's suggested fix and Kane runs it again.
3. **Strength.** Plant realistic bugs in a copy of the original and record which behaviors catch them.
4. **Regrow.** A clean-room workspace holds only `SPEC.md` and reference screenshots. The builder agent builds; Kane runs every behavior; failures go back with Kane's evidence; repeat until green. A failure Kane attributes to its own run is rerun before it can reach the builder, so the agent is never asked to "fix" working code.
5. **Parity.** Compare stored values between the original and each rebuild, per behavior, and issue a certificate.

## Repository

```
packages/schema   zod data contract shared by everything
packages/kane     Kane CLI adapter: NDJSON stream, exit codes, evidence packs, suites
packages/core     engine: capture, baseline, strength, regrow loop, parity, resume
packages/cli      the theseus command and its live terminal view
packages/mobile   Expo release builds and device boot for the Android emulator and iOS simulator
apps/web          the showcase site: replayed voyage matrix, parity certificates, method
examples          originals and their docs (TodoMVC jQuery, RealWorld AngularJS)
runs              committed voyage records: voyage.json, events.ndjson, screenshots
```

Evidence packs are kept out of the repository because they embed account details; only screenshots are committed.

## Licenses

Theseus is MIT licensed. The vendored originals keep their own MIT licenses: TodoMVC (tastejs/todomvc) and RealWorld (gothinkster), with upstream commits recorded in each `UPSTREAM` file.
