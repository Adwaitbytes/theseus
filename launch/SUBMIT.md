# Submission kit (final, every number checked against runs/)

Deadline: Thursday 26 November 2026, 11:59 PM IST.

## Form fields

**GitHub URL**
https://github.com/Adwaitbytes/theseus

**Live URL**
https://theseus-umber.vercel.app

**Demo video**
Upload `launch/video/theseus-demo.mp4` to YouTube as Unlisted or Public, then paste its link.

**About your app**

Theseus deletes an app's code and grows it back in another stack, including as a native mobile app, while Kane CLI proves every behavior still matches the original.

It crawls a running app and has an agent draft its behavior as plain-English Kane objectives. Only behaviors Kane proves on the original become the spec, and when Kane's root cause analysis blames the test rather than the app, the test is rewritten from Kane's suggested fix and rerun. Then the code is gone: Codex rebuilds the app in a clean room from that spec and reference screenshots alone. Kane runs every behavior on each rebuild in a real browser or on the Android emulator, and every failure goes back to the agent with Kane's failing step, reason, root cause and suggested fix, round after round. A failure Kane blames on its own run is rerun before it can reach the agent, so the agent is never asked to break working code. Finally a parity certificate compares the exact values Kane read on the original with those it read on each rebuild.

Results on the 2012 jQuery TodoMVC (22 behaviors): a native Expo app on the Android emulator, 21 of 22 identical to the original; SvelteKit, 20 of 22 identical after its first build; Next.js, 19 of 22 identical. A second voyage rebuilt the AngularJS RealWorld Conduit app full stack into Next.js: 14 of 16 behaviors proven, 13 identical. Kane also caught a false green in our own baseline: `theseus verify` re-ran a recorded pass and showed the run had re-added data after reopening, and the certificate records it. The original and both web rebuilds are deployed and Kane re-verified them at their public URLs.

Agent: Codex (gpt-5.6-terra) builds every app and drafts the spec. Kane CLI is the gate, the grader and the agent's eyes: baseline proof, the round-by-round loop, parity, `theseus verify`, exported `_test.md` suites and evidence screenshots.

## X post (attach launch/video/theseus-teaser-vertical.mp4)

I deleted a 2012 jQuery app and had Codex grow it back from plain-English tests alone, then let @kane_cli by @testmuai check every behavior.

Native Android: 21 of 22 identical to the original.
SvelteKit: 20 of 22.

Ship of Theseus, with a certificate: https://theseus-umber.vercel.app

#KaneCLIHackathon #KaneCLI

## LinkedIn post (upload the teaser video natively, type @ and pick TestMu AI)

What if your tests, not your code, were the real source of your product?

For the KaneCLI Online Hackathon I built Theseus. It captures what a running app does as plain-English Kane CLI tests, deletes the code, and lets an AI agent rebuild it from those tests alone, in a different stack.

I pointed it at the 2012 jQuery TodoMVC. Codex rebuilt it in a clean room as a SvelteKit app, a Next.js app and a native Expo app on Android, without ever seeing the original source. Kane CLI ran all 22 behaviors on every rebuild, sent each failure back to the agent with its root cause and suggested fix, and issued a parity certificate at the end.

The native Android rebuild matched the original on 21 of 22 behaviors. SvelteKit matched 20 of 22 after its very first build.

The part I did not expect: Kane caught a false pass in my own baseline. Re-running a recorded pass showed the test had quietly re-added data after reopening the app. The certificate records that instead of hiding it.

Everything is live, including the original and both web rebuilds side by side: https://theseus-umber.vercel.app
Code: https://github.com/Adwaitbytes/theseus

Tested with Kane CLI from @TestMu AI.

#KaneCLIHackathon #KaneCLI #AIAgents

## Show HN (optional third post; write the first comment in your own words)

Title: Show HN: Theseus, delete an app's code and regrow it with proof

Link: https://github.com/Adwaitbytes/theseus

Facts for your comment: tests written as plain-English intent survive a rewrite where selector-based tests do not; Codex rebuilt TodoMVC in a clean room, native Android 21 of 22 identical; Kane's root cause analysis decides whether a failure goes back to the agent; rough edges: one Kane variable quirk on stored values, persistence behaviors needed rewording for web, RealWorld stopped at 14 of 16.
