---
mode: testing
url: "http://localhost:4171"
tags: ["filtering", "empty-state"]
---

# Follow an author and update the feed

## Follow an author and update the feed
Starting from the seeded app, sign in with email "carol@example.com" and password "conduit-demo", open alice's profile, follow alice, open Home and select "Your Feed", collect all visible article titles in display order and store the visible article titles in display order as 'article_titles', then verify the stored article_titles value is "Favorites and counters, Pagination without surprises, Markdown in article bodies, A tour of the RealWorld spec, Testing in plain English, How to retire an AngularJS app"; open alice's profile, unfollow alice, open Home and select "Your Feed", collect all visible article titles in display order and store the visible article titles in display order as 'article_titles', then verify the stored article_titles value is "none" and the page shows "No articles are here... yet.".
