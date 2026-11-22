# Theseus demo: voiceover script

Final cut: launch/video/theseus-demo.mp4, 4:21 at 1920x1080, 30 fps. The voice is local Kokoro TTS, voice af_heart, normalized to -16 LUFS. Each line below is the burned-in caption and the words spoken; where a name needs help, the TTS reads a phonetic spelling (column Spoken as).

Every number is read from `runs/todomvc-jquery/voyage.json` or `runs/realworld-angularjs/voyage.json`, and `launch/video/scripts/build.mjs` refuses to build if one of them changes.

| Start | End | Scene | Caption and line | Spoken as |
|---|---|---|---|---|
| 0:00 | 0:06 | verdict | This is Kane CLI failing an app that an AI agent just rebuilt from scratch. | This is Kane C L I failing an app that an AI agent just rebuilt from scratch. |
| 0:06 | 0:08 | verdict | Step 9 failed, and Kane says why. | Step nine failed, and Kane says why. |
| 0:09 | 0:14 | verdict | The test never saved the second counter value, and the screenshots show the app was right. |  |
| 0:15 | 0:17 | verdict | That report goes straight back to the agent. |  |
| 0:19 | 0:25 | original | The app being rebuilt is this one: TodoMVC, built with jQuery in 2012. | The app being rebuilt is this one: To do M V C, built with J Query in twenty twelve. |
| 0:25 | 0:35 | original | Theseus deletes its code, has coding agents grow it back in new stacks, including a native Android app, and lets Kane decide when they are done. | Theeseeus deletes its code, has coding agents grow it back in new stacks, including a native Android app, and lets Kane decide when they are done. |
| 0:37 | 0:40 | title | Theseus. Delete the code. Keep the ship. | Theeseeus. Delete the code. Keep the ship. |
| 0:42 | 0:43 | capture | First, capture. |  |
| 0:43 | 0:50 | capture | Theseus crawled the original app, and an agent drafted 22 behaviors in plain English. | Theeseeus crawled the original app, and an agent drafted twenty two behaviors in plain English. |
| 0:50 | 0:53 | capture | Kane ran every one of them on the original app. |  |
| 0:53 | 0:56 | capture | Only what Kane proves on the original goes into the spec. |  |
| 0:58 | 1:01 | falsegreen | Kane also caught a mistake in our own baseline. |  |
| 1:01 | 1:07 | falsegreen | The recorded pass for persist-items had added the todos again after reopening the app. | The recorded pass for persist items had added the todos again after reopening the app. |
| 1:07 | 1:09 | falsegreen | That was a false green. |  |
| 1:09 | 1:16 | falsegreen | theseus verify ran it again, Kane failed it, and the certificate records it as failed on the original. | Theeseeus verify ran it again, Kane failed it, and the certificate records it as failed on the original. |
| 1:18 | 1:19 | cleanroom | Then the code is gone. |  |
| 1:20 | 1:28 | cleanroom | Each agent starts in an empty clean room that holds only the spec and reference screenshots, never the original source. |  |
| 1:29 | 1:35 | regrow | Codex builds a Next.js app, a SvelteKit app and a native Expo app for Android. | Code-ex builds a Next J S app, a Svelte Kit app and a native Ex-po app for Android. |
| 1:35 | 1:42 | regrow | Kane tests every build in a real browser or on the Android emulator, with the same sentences. |  |
| 1:43 | 1:46 | loop | Next.js round 1: 20 of 22. | Next J S round one: twenty of twenty two. |
| 1:47 | 1:54 | loop | Both failures go back to Codex with the failing step, Kane's reason, its root cause and its suggested fix. | Both failures go back to Code-ex with the failing step, Kane's reason, its root cause and its suggested fix. |
| 1:54 | 2:00 | loop | Kane's root causes said the app was right, so Codex left the working code alone. | Kane's root causes said the app was right, so Code-ex left the working code alone. |
| 2:00 | 2:02 | loop | Kane ran the failures again. |  |
| 2:02 | 2:08 | loop | Fresh empty view passed in round 2, and the pluralized counter went green in round 4. | Fresh empty view passed in round two, and the pluralized counter went green in round four. |
| 2:08 | 2:10 | loop | 22 of 22. | twenty two of twenty two. |
| 2:12 | 2:18 | sveltekit | SvelteKit, also built by Codex in a clean room, passed all 22 on its first build. | Svelte Kit, also built by Code-ex in a clean room, passed all twenty two on its first build. |
| 2:19 | 2:25 | android | On Android, Kane drove the native Expo app on the emulator with the same sentences. | On Android, Kane drove the native Ex-po app on the emulator with the same sentences. |
| 2:25 | 2:29 | android | 21 of 22 passed on its first build. | twenty one of twenty two passed on its first build. |
| 2:29 | 2:34 | android | The one miss is persist-items, the behavior that also fails on the original. | The one miss is persist items, the behavior that also fails on the original. |
| 2:36 | 2:41 | regression | Then a final regression pass ran every behavior on Next.js again. | Then a final regression pass ran every behavior on Next J S again. |
| 2:41 | 2:44 | regression | Kane caught the pluralized counter once more. |  |
| 2:44 | 2:52 | regression | Its root cause says the app showed the right counts, and the test did not carry its stored values into the final check. |  |
| 2:52 | 2:58 | regression | We count it as a failure anyway. Next.js ends at 21 of 22. | We count it as a failure anyway. Next J S ends at twenty one of twenty two. |
| 2:59 | 3:01 | parity | Passing is not the finish line. |  |
| 3:02 | 3:07 | parity | Kane stores values while it tests, and Theseus compares them with the original's. | Kane stores values while it tests, and Theeseeus compares them with the original's. |
| 3:07 | 3:14 | parity | Next.js: 19 identical. SvelteKit: 20. Expo on Android: 21. | Next J S: nineteen identical. Svelte Kit: twenty. Ex-po on Android: twenty one. |
| 3:14 | 3:18 | parity | Every divergence and every failure is on the certificate. |  |
| 3:20 | 3:27 | conduit | The second voyage is the RealWorld Conduit app: full stack, AngularJS, from 2016. | The second voyage is the Real World Conduit app: full stack, Angular J S, from twenty sixteen. |
| 3:27 | 3:34 | conduit | Kane proved 16 behaviors on the original, and Codex rebuilt it as a full stack Next.js app. | Kane proved sixteen behaviors on the original, and Code-ex rebuilt it as a full stack Next J S app. |
| 3:34 | 3:41 | conduit | By round 2, Kane proved 14 of 16. Parity: 13 of 16 identical. | By round two, Kane proved fourteen of sixteen. Parity: thirteen of sixteen identical. |
| 3:42 | 3:51 | live | All three TodoMVC apps are deployed. Here are the original and both web regrowths, live, doing the same things. | All three To do M V C apps are deployed. Here are the original and both web regrowths, live, doing the same things. |
| 3:55 | 4:01 | live | And here is Kane re-proving one certificate cell on the Next.js build, recorded for this video. | And here is Kane re-proving one certificate cell on the Next J S build, recorded for this video. |
| 4:07 | 4:11 | end | Plain English tests are the only tests that survive a rewrite. |  |
| 4:11 | 4:14 | end | Theseus treats them as the source code. | Theeseeus treats them as the source code. |
| 4:14 | 4:18 | end | Built on Kane CLI for the TestMu AI hackathon. | Built on Kane C L I for the Test Mu AI hackathon. |
