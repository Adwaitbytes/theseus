---
mode: testing
url: "http://localhost:4171"
tags: ["seed", "empty-state"]
---

# Show followed authors only

## Show followed authors only
Starting from the seeded app, sign in with email "alice@example.com" and password "conduit-demo", store the visible Your Feed article titles in display order as 'article_titles', then verify the stored article_titles value is "Designing a follow feed, Boring databases win"; sign out, sign in with email "bob@example.com" and password "conduit-demo", store the visible Your Feed article titles in display order as 'article_titles', then verify the stored article_titles value is "none" and the page shows "No articles are here... yet.".
