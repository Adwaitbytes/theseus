---
mode: testing
target: emulator
app: "builds/expo-android.apk"
---

# Discard edit with escape

## Discard edit with escape
Starting from a fresh app with no items, add "Keep", enter editing for it, change the text to "Discard", and cancel the edit with Escape, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify the list still shows "Keep" and not "Discard".
