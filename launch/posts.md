# Launch posts

Fill every `{{PLACEHOLDER}}` from the committed runs before posting. Character counts below assume placeholders are short numbers and that X counts each link as 23 characters. Recount after filling.

## X: kickoff

Status: done. The kickoff post went out at the start of the hackathon. Nothing to post here; quote it from the launch thread if it got traction.

## X: mid-week post

> Day 3 of building Theseus for the Kane CLI hackathon. The 2012 jQuery TodoMVC now has {{TODOMVC_BEHAVIORS}} plain-English behaviors, every one proven on the original by @kane_cli. Tomorrow I delete the code and see whether agents can grow it back as a native Android app. #KaneCLIHackathon

(about 270 characters)

## X: launch thread (5 posts)

Attach the demo video to post 1. Links only in posts 1 and 5. Hashtags only in post 5.

**1/5** (video attached)

> I deleted a 2012 jQuery app and let Claude Code and Codex regrow it in Next.js, SvelteKit and native Expo. Kane CLI by @testmuai tested every round until all {{TODOMVC_BEHAVIORS}} behaviors matched the original.
>
> Ship of Theseus, with a certificate. {{DEMO_VIDEO_URL}}

**2/5**

> Step one is capture. Theseus crawls the running app, an agent drafts behaviors in plain English, and @kane_cli runs each one on the original. Only proven behaviors survive. When Kane's root cause says the test was wrong, the test gets rewritten and rerun.

**3/5**

> Then the code is gone. Each agent gets an empty folder with SPEC.md and screenshots, never the source. Every round, Kane's failing step, root cause and suggested fix go back to the agent. Next.js went green in {{NEXTJS_ROUNDS}} rounds, Expo on Android in {{EXPO_ANDROID_ROUNDS}}.

**4/5**

> Green is not the end. Kane stores values while it tests, like the counter text. Theseus compares them between original and regrowth and issues a parity certificate per target. Planted bugs caught by the spec: {{BUGS_CAUGHT}} of {{BUGS_PLANTED}}. Survivors are listed, not hidden.

**5/5**

> Try it without credentials: npx theseus-cli demo
>
> Regrow your own app: npx theseus-cli regrow http://localhost:3000 --to nextjs,expo-android
>
> Built on @kane_cli for the hackathon by @testmuai. {{REPO_URL}}
>
> #KaneCLIHackathon #KaneCLI

## LinkedIn launch post

Tag TestMu AI with the LinkedIn mention picker when typing "TestMu AI" so it becomes a real company tag.

> Every rewrite promises the same thing: new code, same behavior. Most teams check that promise by clicking around for a week.
>
> For the KaneCLI hackathon by TestMu AI, I built Theseus to check it properly. It captures what a running app does as plain-English tests, keeps only the ones Kane CLI proves on the original, then deletes the code. Coding agents (Claude Code and Codex) regrow the app from that spec alone, in Next.js, SvelteKit and a native Expo app on Android and iOS. They never see the original source.
>
> Kane tests every round. Each failure goes back to the agent with the failing step, Kane's root cause and a suggested fix, and the loop runs until every behavior passes. Then Theseus compares the values Kane read on the original with the values it read on each rebuild and issues a parity certificate.
>
> On the 2012 jQuery TodoMVC:
> {{TODOMVC_BEHAVIORS}} behaviors proven on the original
> {{BUGS_CAUGHT}} of {{BUGS_PLANTED}} planted bugs caught by the spec
> Next.js green in {{NEXTJS_ROUNDS}} rounds, Expo on Android in {{EXPO_ANDROID_ROUNDS}}
>
> The lesson I took away: plain-English, intent-level tests are the only tests that survive a move from jQuery to React Native. That makes them the real source code.
>
> Demo and code: {{REPO_URL}}
>
> #KaneCLIHackathon #KaneCLI #AIAgents

(about 1,220 characters with short placeholders and a 31 character repo link)

## Show HN

**Title** (73 characters):

> Show HN: Theseus, delete an app's code and regrow it in any stack with proof

Alternative (66 characters):

> Show HN: Theseus regrows deleted apps in new stacks, proven by Kane

**Fact sheet for the human-written first comment.** HN flags generated text, so do not paste this. Write the comment yourself from these facts.

- What it is: a CLI (`npx theseus-cli`) that captures a running app's behavior as plain-English Kane CLI tests, deletes the code, has coding agents regrow it in other stacks from the spec alone, and certifies parity.
- Built for: KaneCLI Online Hackathon by TestMu AI, November 2026.
- Repo: {{REPO_URL}}. Site with certificates and replay: {{SITE_URL}}. Method and limitations: {{SITE_URL}}/method.
- Try without credentials: `npx theseus-cli demo` replays a recorded voyage.
- Hero voyage: 2012 jQuery TodoMVC (jQuery 2, Handlebars, Director). {{TODOMVC_BEHAVIORS}} behaviors proven on the original.
- Targets: Next.js ({{NEXTJS_ROUNDS}} rounds), SvelteKit ({{SVELTEKIT_ROUNDS}}), Expo on Android emulator ({{EXPO_ANDROID_ROUNDS}}), Expo on iOS simulator ({{EXPO_IOS_ROUNDS}}).
- Spec strength: {{BUGS_CAUGHT}} of {{BUGS_PLANTED}} planted bugs caught. Survivor: {{SURVIVING_MUTANT}}.
- Second voyage: AngularJS RealWorld Conduit, full stack, end-of-life framework, regrown into {{CONDUIT_TARGET}} in {{CONDUIT_ROUNDS}} rounds.
- Clean room: the builder's workspace holds only SPEC.md and screenshots. No source in the workspace, prompt or feedback.
- Feedback per failure: Kane's failing step, reason, root cause, suggested fix, screenshot.
- Parity: compares Kane's stored values (`final_state`) on original and regrowth; verdicts are identical or diverged; divergences are listed.
- Cost: {{TOTAL_KANE_CREDITS}} Kane credits over {{TOTAL_KANE_RUNS}} runs for the TodoMVC voyage.
- Limitations to volunteer: parity covers only the spec; Kane is an AI agent so a pass is evidence, not proof; the model may know TodoMVC from training; mobile runs are serial and slow.
- Prior art worth naming: Ditto (jQuery TodoMVC to React, agent reads the source, single stack). Theseus differs on clean room, auto-captured spec, multiple stacks, native mobile, agent race, certificate.

## Reddit

### r/SideProject

**Title:** I built a tool that deletes an app's code and has AI agents regrow it in other stacks, with Kane CLI checking every behavior

> I built Theseus for the KaneCLI Online Hackathon by TestMu AI. The idea started as a joke about the Ship of Theseus and turned into something I would actually use.
>
> You point it at a running app. It crawls the app, an agent drafts plain-English tests, and Kane CLI (TestMu AI's command-line testing agent) runs each one against the original. Only the tests Kane proves on the original are kept. Then the code is deleted, and Claude Code or Codex rebuilds the app from those tests alone in a fresh folder. Kane tests each round and sends failures back until everything passes.
>
> On the 2012 jQuery TodoMVC it kept {{TODOMVC_BEHAVIORS}} behaviors and regrew the app into Next.js in {{NEXTJS_ROUNDS}} rounds and into a native Expo app on the Android emulator in {{EXPO_ANDROID_ROUNDS}}. At the end it writes a parity certificate comparing what Kane saw on the original against each rebuild.
>
> You can watch a recorded run without any account: `npx theseus-cli demo`. Code and write-up: {{REPO_URL}}
>
> Happy to answer questions, and I would like to hear which old app you would throw at it.

### r/webdev

**Title:** Plain-English tests survived a jQuery to Next.js to React Native rewrite. Unit tests could not. Here is the experiment.

> A question I wanted to answer for the Kane CLI hackathon: which tests survive a rewrite across frameworks and from web to native?
>
> Unit tests do not, because they target code structure. Playwright selectors mostly do not, and they cannot run on an Android emulator. A sentence like "complete Alpha and check the counter reads 0 items left" does, as long as something can execute it on a browser, an emulator and a simulator. Kane CLI can.
>
> So I built Theseus. It captures an app's behavior as those sentences, keeps only what Kane proves on the original, deletes the code, and lets Claude Code or Codex rebuild it from the sentences in a clean room. Kane's failure reports (failing step, root cause, suggested fix) drive each round.
>
> Results on the 2012 jQuery TodoMVC: Next.js in {{NEXTJS_ROUNDS}} rounds, SvelteKit in {{SVELTEKIT_ROUNDS}}, Expo on Android in {{EXPO_ANDROID_ROUNDS}}, Expo on iOS in {{EXPO_IOS_ROUNDS}}. The spec caught {{BUGS_CAUGHT}} of {{BUGS_PLANTED}} planted bugs. The method page lists what this does not prove: {{SITE_URL}}/method
>
> Repo: {{REPO_URL}}. `npx theseus-cli demo` replays a run with no credentials.

### r/programming

**Title:** Theseus: using behavior specs as the source of truth for agent-driven rewrites, with parity certificates

> This is a hackathon project (KaneCLI Online Hackathon by TestMu AI), but the question behind it is general: if an agent rewrites your app, who checks the agent?
>
> Theseus separates the roles. Kane CLI, a testing agent, establishes the spec by running drafted behaviors on the original and keeping only the ones that pass. Builder agents (Claude Code, Codex) never see the original source; they get the spec and screenshots in an empty workspace. Kane grades every round, and its root-cause analysis routes each failure: product bugs go to the builder, test bugs go back to the drafter, infrastructure errors are retried.
>
> At the end, every behavior runs on both the original and the rewrite, and the values Kane stored are compared. Identical or diverged, per behavior, per target. Planted-bug testing gives the spec a strength score ({{BUGS_CAUGHT}} of {{BUGS_PLANTED}} on TodoMVC) so you know how much the certificate is worth.
>
> Limitations are on the method page ({{SITE_URL}}/method): parity covers only the spec, and an AI tester's pass is evidence rather than proof.
>
> Code: {{REPO_URL}}

## Replies to predictable objections

**1. "Isn't this just test-driven rewriting?"**

> Close, and that is the point. The difference is where the tests come from and who runs them. Here the tests are captured from the running original and kept only if Kane proves them there, the builder never writes or edits them, and they run unchanged on web, Android and iOS. TDD usually assumes you already have the tests. Theseus produces them first.

**2. "Parity doesn't prove equivalence."**

> Agreed, and the certificate says so. It covers the {{TODOMVC_BEHAVIORS}} behaviors in the spec and nothing else. That is why there is a strength score: the spec caught {{BUGS_CAUGHT}} of {{BUGS_PLANTED}} planted bugs, and the survivors are listed. It tells you how much weight the certificate can carry. Details: {{SITE_URL}}/method

**3. "What does this cost?"**

> The full TodoMVC voyage (capture, baseline, strength, four targets, parity) used {{TOTAL_KANE_CREDITS}} Kane credits over {{TOTAL_KANE_RUNS}} runs. `--budget` sets a hard cap, and every voyage page shows its own cost. Agent costs depend on your Claude Code or Codex plan.

**4. "Is the clean room honest? The model has seen TodoMVC."**

> The builder cannot see the original source: its workspace holds SPEC.md and screenshots, and Kane's feedback describes the running app, not code. Training data is a fair point for TodoMVC, which is why the second voyage is the AngularJS Conduit app with its own seed data, regrown in {{CONDUIT_ROUNDS}} rounds. The prompts and round history are committed so you can check.

**5. "AI tests are flaky."**

> Some runs are, which is why the loop leans on Kane's classification. Exit code 2 is infrastructure and gets retried without blaming the build. An `automation_bug` root cause sends the test back for repair instead of making the builder change working code. And nothing enters the spec unless it passed on the original first. `theseus verify` reruns any certificate cell live if you doubt one.

**6. "Why Kane and not Playwright?"**

> Playwright tests bind to selectors and DOM structure, which is the first thing a rewrite changes, and they do not run on an Android emulator. Kane runs the same plain-English objective on a browser, an emulator and a simulator, and it returns a root cause and a suggested fix when something fails, which is exactly what a builder agent needs. The committed specs are Kane `_test.md` files you can rerun in CI.

**7. "What about mobile limits?"**

> Real ones. Emulator and simulator runs go one at a time, so a mobile round took about {{EXPO_ANDROID_ROUND_MINUTES}} minutes against much less on web. Platform conventions also clash with the original sometimes (Escape to cancel an edit has no Android equivalent), and when the agent's choice fails the objective, the certificate shows it. Example: {{EXAMPLE_DIVERGENCE}}.

**8. "Can it do my 500k-line app?"**

> Not in one voyage, and I would not claim it. Capture works best on apps with clear, observable state, and cost scales with behaviors times rounds. What does scale is the unit of work: point it at one feature or one route and regrow that. The largest app it has done so far is the Conduit full-stack app with {{CONDUIT_BEHAVIORS}} behaviors.
