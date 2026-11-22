---
mode: testing
url: "http://localhost:4171"
tags: ["validation"]
---

# Reject invalid sign-in credentials

## Reject invalid sign-in credentials
Starting from the seeded app, open Sign in, enter email "alice@example.com" and password "wrong-password", submit the form, store the visible error text as 'error_text', then verify the stored error_text value is "email is not found" and the navigation shows "Sign in" and "Sign up".
