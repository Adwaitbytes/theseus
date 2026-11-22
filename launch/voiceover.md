# Theseus demo: voiceover script

Final cut: launch/video/theseus-demo.mp4, 3:50 at 1920x1080, 30 fps. The cut currently carries a temporary synthetic voice (files named voiceover-temp-*, local Kokoro TTS, voice am_michael) so it can be reviewed. Record each line below and drop it in at its timestamp; every line has room to breathe, so a natural read that runs a little longer still fits before the next line.

Every number spoken here is read from `runs/todomvc-jquery/voyage.json`. Read numbers as words ("twenty two"), the captions show digits.

| Start | End | Scene | Line |
|---|---|---|---|
| 0:00 | 0:05 | verdict | This is Kane CLI failing an app that an AI agent just rebuilt from scratch. |
| 0:06 | 0:08 | verdict | Step nine failed, and Kane says why. |
| 0:08 | 0:14 | verdict | The test never saved the second counter value, and the screenshots show the app was right. |
| 0:14 | 0:17 | verdict | That report goes straight back to the agent. |
| 0:18 | 0:24 | original | The app being rebuilt is this one: TodoMVC in jQuery, from 2012. |
| 0:25 | 0:32 | original | Theseus deletes its code, has coding agents grow it back in new stacks, and lets Kane decide when they are done. |
| 0:34 | 0:36 | title | Theseus. Delete the code. Keep the ship. |
| 0:38 | 0:39 | capture | First, capture. |
| 0:40 | 0:46 | capture | Theseus crawled the running app, and an agent drafted twenty two behaviors in plain English. |
| 0:46 | 0:49 | capture | Kane ran every one of them on the original app. |
| 0:49 | 0:53 | capture | Only what Kane proves on the original goes into the spec. |
| 0:54 | 0:57 | falsegreen | Kane also caught a mistake in our own baseline. |
| 0:57 | 1:03 | falsegreen | The recorded pass for persist items had added the todos again after reopening the app. |
| 1:04 | 1:05 | falsegreen | That was a false green. |
| 1:06 | 1:13 | falsegreen | Theseus verify ran it again, Kane failed it, and the certificate now records it as failed on the original. |
| 1:14 | 1:16 | cleanroom | Then the code is gone. |
| 1:16 | 1:24 | cleanroom | Each agent starts in an empty clean room that holds only the spec and reference screenshots, never the original source. |
| 1:26 | 1:31 | regrow | Codex builds a Next.js version and a SvelteKit version side by side. |
| 1:31 | 1:38 | regrow | Kane tests every build in a real browser, with the same plain English sentences it ran on the original. |
| 1:39 | 1:42 | loop | Next.js round one: twenty of twenty two. |
| 1:43 | 1:50 | loop | Both failures go back to Codex with the failing step, Kane's reason, its root cause and its suggested fix. |
| 1:50 | 1:55 | loop | Kane's root causes said the app was right, so Codex left the working code alone. |
| 1:56 | 1:58 | loop | Kane ran the failures again. |
| 1:58 | 2:04 | loop | Fresh empty view passed in round two, and the pluralized counter went green in round four. |
| 2:04 | 2:06 | loop | Twenty two of twenty two. |
| 2:08 | 2:14 | sveltekit | SvelteKit, also built by Codex in a clean room, passed all twenty two on its first build. |
| 2:16 | 2:21 | regression | Then a final regression pass ran every behavior on Next.js again. |
| 2:21 | 2:24 | regression | Kane caught the pluralized counter once more. |
| 2:24 | 2:31 | regression | Its root cause says the app showed the right counts, and the test did not carry its stored values into the final check. |
| 2:32 | 2:37 | regression | We count it as a failure anyway. Next.js ends at twenty one of twenty two. |
| 2:39 | 2:41 | parity | Passing is not the finish line. |
| 2:42 | 2:50 | parity | Kane stores values while it tests, like the counter text, and Theseus compares them with the values it read on the original. |
| 2:50 | 2:55 | parity | Next.js: nineteen identical. SvelteKit: twenty identical. |
| 2:55 | 2:59 | parity | Every divergence and every failure is on the certificate. |
| 3:00 | 3:06 | live | All three apps run today. Here are the original and both regrowths, doing the same things. |
| 3:13 | 3:19 | live | And here is Kane re-proving one certificate cell on the Next.js build, live, for this video. |
| 3:26 | 3:33 | expo | A native Android regrowth in Expo is running on the emulator now. Its result is not in yet. |
| 3:35 | 3:39 | end | Plain English tests are the only tests that survive a rewrite. |
| 3:40 | 3:42 | end | Theseus treats them as the source code. |
| 3:42 | 3:46 | end | Built on Kane CLI for the TestMu AI hackathon. |

## Delivery notes

- Calm and exact. This is a test report, not an ad. No emphasis on adjectives; let the numbers carry it.
- The opening line must land inside the first 15 seconds while Kane's red verdict and root cause are on screen.
- Pause a beat after "That was a false green." and after "Twenty two of twenty two."
- "Kane" rhymes with "rain". "Theseus" is THEE-see-us.
