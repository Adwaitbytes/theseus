---
mode: testing
url: "http://localhost:4171"
tags: ["validation", "empty-input", "whitespace"]
---

# Reject blank and whitespace sign-in details

## Reject blank and whitespace sign-in details
Starting from the seeded app, open Sign in, submit empty Email and Password fields, enter email "alice@example.com" and a Password made only of spaces, submit the form, store the visible error text as 'error_text', then verify the stored error_text value is "email is not found" and the navigation still shows "Sign in" and "Sign up".
