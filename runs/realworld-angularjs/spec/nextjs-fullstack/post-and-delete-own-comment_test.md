---
mode: testing
url: "http://localhost:3000"
tags: ["removal", "persistence"]
---

# Post and remove a comment

## Post and remove a comment
Starting from the seeded app, sign in with email "alice@example.com" and password "conduit-demo", open "Boring databases win", enter "A useful reminder." in the comment box and post it, collect the visible comment texts in newest-first display order and store the visible comment texts in newest-first display order as 'comment_texts', then verify the stored comment_texts value is "A useful reminder., Agreed, boring is a feature."; delete "A useful reminder.", collect the visible comment texts in newest-first display order and store the visible comment texts in newest-first display order as 'comment_texts', then verify the stored comment_texts value is "Agreed, boring is a feature.".
