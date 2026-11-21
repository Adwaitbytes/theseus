# Deck: Theseus

Nine slides. On-slide text is exact and kept sparse; everything else goes in the speaker notes. Fill placeholders from `runs/` before export.

## Slide 1: Title

**On slide**

> Theseus
>
> Delete the code. Regrow it in any stack. Kane CLI proves nothing changed.
>
> KaneCLI Online Hackathon by TestMu AI

**Speaker notes**

The Ship of Theseus asks whether a ship is still the same once every plank has been replaced. Every rewrite asks the same question about software. Theseus answers it with a certificate instead of a feeling. Repo at {{REPO_URL}}, demo at {{DEMO_VIDEO_URL}}.

## Slide 2: The problem

**On slide**

> Rewrites silently change behavior.
>
> And when an agent rewrites, it grades itself.

**Speaker notes**

Old apps are full of behavior nobody wrote down: what Escape does during an edit, whether a whitespace-only edit deletes the item, singular versus plural in the counter. Rewrites lose those details, and nobody notices until a user does. Agent rewrites add a second problem: the agent writes the tests against the code it just wrote and reports success. Unit tests from the old codebase do not help, because they target code structure that no longer exists.

## Slide 3: The insight

**On slide**

> Plain-English tests survive a rewrite.
>
> So they are the real source code.

**Speaker notes**

"Complete Alpha and check the counter reads 0 items left" is equally true of jQuery, Next.js and a native Expo app. Kane CLI can run that same sentence on a browser, an Android emulator and an iOS simulator. Once the behavior lives in sentences Kane can execute, the code becomes replaceable.

## Slide 4: How it works

**On slide**

> Capture. Baseline. Strength. Regrow. Parity.


**Speaker notes**

Capture crawls the running app and an agent drafts behaviors. Baseline keeps only what Kane proves on the original; when Kane's root cause blames the test, the test is rewritten. Strength plants bugs to score the spec. Regrow hands an empty folder with SPEC.md and screenshots to Claude Code or Codex. Parity compares the values Kane stored on the original and on each regrowth. One command runs it all: `npx theseus-cli regrow <url> --to nextjs,expo-android`.

## Slide 5: The Kane loop

**On slide**

> Failing step. Reason. Root cause. Suggested fix.
>
> Back to the agent, every round.

**Speaker notes**

This is the closed loop. The builder never hears Theseus's opinion, only Kane's account of what happened in the running app. Kane's classification routes each failure: product bugs go to the builder, `automation_bug` goes back to the drafting agent, and exit code 2 is retried as infrastructure. On TodoMVC, Kane sent {{KANE_FAILURES_FED_BACK}} failures back over {{TOTAL_KANE_RUNS}} runs.

## Slide 6: Results

**On slide**

> jQuery TodoMVC, 2012
>
> {{TODOMVC_BEHAVIORS}} behaviors · {{BUGS_CAUGHT}}/{{BUGS_PLANTED}} planted bugs caught
>
> Next.js {{NEXTJS_ROUNDS}} rounds · SvelteKit {{SVELTEKIT_ROUNDS}} · Android {{EXPO_ANDROID_ROUNDS}} · iOS {{EXPO_IOS_ROUNDS}}

**Speaker notes**

Every number here is read from the committed voyage file under `runs/todomvc-jquery`, and the site is built from the same file. Total cost was {{TOTAL_KANE_CREDITS}} Kane credits. The second voyage, the AngularJS RealWorld Conduit app with its own backend, was regrown into {{CONDUIT_TARGET}} in {{CONDUIT_ROUNDS}} rounds.

## Slide 7: The parity certificate

**On slide**

> {{EXPO_ANDROID_IDENTICAL}} identical · {{EXPO_ANDROID_DIVERGED}} diverged
>
> Divergences are shown, never rounded away.

(Screenshot of the Expo on Android certificate.)

**Speaker notes**

Identical means both runs passed and every stored value matched. Diverged means both passed but a value differs, for example {{EXAMPLE_DIVERGENCE}}. Whether that matters is the reader's call. Every cell links to Kane's evidence, and `theseus verify` re-proves any cell live.

## Slide 8: Honest limits

**On slide**

> Parity covers the spec, not everything.
>
> A Kane pass is evidence, not proof.

**Speaker notes**

Performance, accessibility and rare timing are outside the spec by construction. Kane is an AI agent, so Theseus requires every behavior to pass on the original first and keeps every evidence pack. The model may know TodoMVC from training, which is why the second voyage uses a custom-seeded Conduit app. Mobile runs are serial and slower. The method page lists all of it: {{SITE_URL}}/method.

## Slide 9: Try it tonight

**On slide**

> npx theseus-cli demo
>
> {{REPO_URL}}

**Speaker notes**

`demo` replays the recorded voyage with no account. `doctor` checks Kane sign-in, credits, agents and devices. `regrow` points it at your own app. Built on Kane CLI by TestMu AI. Compared with Ditto, which rewrites jQuery TodoMVC to React by reading the source, Theseus works in a clean room from an auto-captured spec, targets several stacks including native mobile, races agents, and ends with a certificate.
