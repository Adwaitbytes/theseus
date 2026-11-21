# Demo video script

Target length: 4:00 (hard window 3:30 to 4:30). 1920x1080, 30 fps. Voiceover recorded separately and laid over screen capture. Captions burned in for every line of voiceover, plus the on-screen caption cards listed below.

The rubric rewards leading with the Kane run report, so the first frame is a real Kane failure verdict on a regrown app, not a logo.

## Before recording

- Fill every placeholder from `runs/todomvc-jquery/voyage.json`. Never read a number aloud that is not in that file.
- Pick the opening failure: a round 1 failure on `expo-android` or `nextjs` with a clear Kane root cause. Record its behavior id as {{OPENING_FAILURE_BEHAVIOR}} and its target as {{OPENING_FAILURE_TARGET}}.
- Terminal: 120x34, font size 18, dark theme, prompt shortened to `$`. Hide the dock and notifications.
- Android emulator window at the right third of the screen, terminal on the left two thirds, for the mobile segments.
- Record the live voyage once for real, then use `npx theseus-cli demo runs/todomvc-jquery --speed 20` for the sped-up passes so the timing is repeatable.

## Script

| Time | Picture | Voiceover | Caption card |
|---|---|---|---|
| 0:00 to 0:15 | Kane run report for {{OPENING_FAILURE_BEHAVIOR}} on {{OPENING_FAILURE_TARGET}}, round 1. Zoom on the verdict block: failing step, reason, root cause, suggested fix. Annotated screenshot slides in beside it. | "This is Kane CLI rejecting an app that an AI agent just rebuilt. Step {{OPENING_FAILURE_STEP}} failed, and Kane says why: {{OPENING_FAILURE_ROOT_CAUSE}}. That report goes straight back to the agent." | Kane CLI verdict, round 1 |
| 0:15 to 0:35 | Cut to the original 2012 jQuery TodoMVC in a browser. Add, complete and filter a few todos. | "The app it was rebuilding is this one: TodoMVC in jQuery, from 2012. Theseus is going to delete its code and have agents grow it back in four stacks, including a native Android app. Kane decides when they are done." | jQuery TodoMVC, 2012 |
| 0:35 to 1:05 | Terminal: `npx theseus-cli regrow http://localhost:4170 --to nextjs,sveltekit,expo-android,expo-ios`. Live view shows capture, then baseline rows ticking green as Kane proves each behavior on the original. Briefly show one draft failing with `automation_bug`, being redrafted, and passing. | "First, capture. Theseus crawls the running app and an agent drafts behaviors in plain English. Kane runs every one on the original, and only what Kane proves survives. When Kane's root cause says the test itself was wrong, the drafting agent rewrites it and Kane runs it again. We end with {{TODOMVC_BEHAVIORS}} proven behaviors." | {{TODOMVC_BEHAVIORS}} behaviors proven on the original |
| 1:05 to 1:20 | Strength phase in the live view: planted bugs listed, each marked caught or survived. | "Then Theseus plants realistic bugs in a copy of the original to see whether the spec notices. It caught {{BUGS_CAUGHT}} of {{BUGS_PLANTED}}. The survivors are listed on the certificate." | Spec strength: {{BUGS_CAUGHT}} of {{BUGS_PLANTED}} |
| 1:20 to 1:35 | The `rm -rf` moment. Terminal, slow typing: `ls .theseus/work/nextjs` shows only `SPEC.md` and `screenshots/`. Then `rm -rf` on a copy of the original's source in a scratch folder, shown deliberately, followed by `ls` returning nothing. Hold one second on the empty output. | "Now the part that matters. The code is gone. Each agent gets an empty folder with the spec and some screenshots. No source in the workspace, the prompt, or the feedback." | The code is gone |
| 1:35 to 2:20 | Split screen. Left: live view, `expo-android` row in round 1, Kane steps streaming. Right: Android emulator, Kane tapping through the regrown Expo app. A failure lands; the feedback panel expands with step, reason, root cause and fix. Cut to round 2 with fewer failures. Cut to the final round, all green. | "Here is the native Android build on the emulator. Kane drives it the same way it drove the browser, using the same sentences. Round 1: {{EXPO_ANDROID_R1_PASSED}} of {{TODOMVC_BEHAVIORS}} pass. Every failure goes back with the failing step, Kane's root cause and its suggested fix. The agent fixes, rebuilds, and Kane tests again. Green in round {{EXPO_ANDROID_ROUNDS}}." | Expo on Android: green in {{EXPO_ANDROID_ROUNDS}} rounds |
| 2:20 to 2:45 | Website, voyage page: the round-by-round grid for all four targets, red cells turning green as the replay plays. | "Across all four targets, this is every round. Next.js took {{NEXTJS_ROUNDS}}, SvelteKit {{SVELTEKIT_ROUNDS}}, Expo on iOS {{EXPO_IOS_ROUNDS}}. Kane sent {{KANE_FAILURES_FED_BACK}} failures back to the builders over {{TOTAL_KANE_RUNS}} runs." | {{KANE_FAILURES_FED_BACK}} Kane failures fed back |
| 2:45 to 3:15 | Website, parity certificate for `expo-android`. Scroll the behaviors; hover one identical cell to show original and regrowth stored values side by side. Stop on the diverged row. | "Passing is not the finish line. Kane stores values while it tests, like the counter text. Theseus runs everything once more on the original and the regrowth and compares those values. {{EXPO_ANDROID_IDENTICAL}} identical. {{EXPO_ANDROID_DIVERGED}} diverged, and the certificate shows exactly how: {{EXAMPLE_DIVERGENCE}}." | Parity certificate |
| 3:15 to 3:40 | Terminal: `npx theseus-cli regrow http://localhost:4170 --to nextjs --race codex,claude-code`. Live view with two rows racing. Cut to the race result on the site. | "You can also race agents on the same stack. On {{RACE_STACK}}, Codex went green in {{RACE_CODEX_ROUNDS}} rounds and Claude Code in {{RACE_CLAUDE_ROUNDS}}. {{RACE_WINNER}} wins on the fixed rule: green first, then fewer rounds, then parity, then credits." | Agent race: {{RACE_WINNER}} |
| 3:40 to 3:55 | Conduit voyage page on the site, briefly. | "The second voyage is the AngularJS RealWorld app, a full-stack app on a dead framework, regrown into {{CONDUIT_TARGET}} in {{CONDUIT_ROUNDS}} rounds." | AngularJS Conduit to {{CONDUIT_TARGET}} |
| 3:55 to 4:15 | Terminal, clean: `npx theseus-cli doctor` output with all checks green, then `npx theseus-cli demo` starting the replay. | "Try it tonight. `doctor` checks Kane, your agents and your devices. `demo` replays this whole voyage with no account. Then point `regrow` at your own app." | npx theseus-cli demo |
| 4:15 to 4:25 | End card: Theseus wordmark, repo URL, site URL, "Built on Kane CLI by TestMu AI". | "Plain-English tests are the only tests that survive a rewrite. Theseus treats them as the source code. Built on Kane CLI for the TestMu AI hackathon." | {{REPO_URL}} |

## Shot list

| # | What to record | Source | Notes |
|---|---|---|---|
| 1 | Kane verdict for the opening failure | Terminal running `npx theseus-cli verify runs/todomvc-jquery --behavior {{OPENING_FAILURE_BEHAVIOR}} --target {{OPENING_FAILURE_TARGET}}` on the round 1 build, or the round 1 replay in the live view | Must be a real recorded failure. Also capture the evidence screenshot from `runs/todomvc-jquery/artifacts/`. |
| 2 | Original TodoMVC in the browser | `npx theseus-cli serve examples/todomvc-jquery/original --port 4170` | 15 seconds of normal use. |
| 3 | Capture and baseline in the live view | Terminal TUI, real run | Include one `automation_bug` redraft. |
| 4 | Strength phase | Terminal TUI | Caught and survived markers visible. |
| 5 | `rm -rf` and the empty clean room | Terminal | Type slowly. Use a scratch copy, never the repo's `examples/` folder. |
| 6 | Expo on Android, rounds 1 to green | Terminal TUI plus emulator window | Record the emulator with the screen recorder in Android Studio or `adb shell screenrecord`. |
| 7 | Round grid | Website voyage page | Use the replay control; record at 60 fps for smooth scrolling. |
| 8 | Parity certificate | Website certificate page | Hover state on one identical cell, stop on the diverged row. |
| 9 | Agent race | Terminal TUI plus website race panel | Speed up with `--speed 20`. |
| 10 | Conduit voyage | Website | Five seconds. |
| 11 | `doctor` and `demo` | Terminal | Clean machine state, all checks green. |
| 12 | End card | Website hero or a title frame | Repo and site URLs legible for three seconds. |

## Caption text (burned in)

1. Kane CLI verdict, round 1
2. jQuery TodoMVC, 2012
3. {{TODOMVC_BEHAVIORS}} behaviors proven on the original
4. Spec strength: {{BUGS_CAUGHT}} of {{BUGS_PLANTED}}
5. The code is gone
6. Expo on Android: green in {{EXPO_ANDROID_ROUNDS}} rounds
7. {{KANE_FAILURES_FED_BACK}} Kane failures fed back
8. Parity certificate
9. Agent race: {{RACE_WINNER}}
10. AngularJS Conduit to {{CONDUIT_TARGET}}
11. npx theseus-cli demo
12. {{REPO_URL}}
