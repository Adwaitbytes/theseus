---
mode: testing
url: "http://localhost:4171"
tags: ["persistence"]
---

# Keep a signed-in session after reopening

## Keep a signed-in session after reopening
Starting from the seeded app, sign in with email "alice@example.com" and password "conduit-demo", reopen the app, store the visible navigation labels in display order as 'navigation_labels', then verify the stored navigation_labels value is "Home, New Article, Settings, alice" and Home shows "Your Feed".
