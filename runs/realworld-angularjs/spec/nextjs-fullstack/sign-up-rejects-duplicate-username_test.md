---
mode: testing
url: "http://localhost:3000"
tags: ["registration", "validation"]
---

# Reject a duplicate username

## Reject a duplicate username
Starting from the seeded app, open Sign up, enter username "alice", email "another-alice@example.com", and password "conduit-demo", submit the form, store the visible error text as 'error_text', then verify the stored error_text value is "username is exist" and the "Sign up" heading remains visible.
