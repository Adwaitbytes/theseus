# TodoMVC

The classic TodoMVC todo list: add, edit, complete, filter and clear todos, with a live counter and data that survives a reload.

## How this app is judged

Every behavior below is executed literally by an AI testing agent (Kane CLI) that drives the app the way a person would: it reads the screen, types, taps and clicks. The app is correct when every behavior passes. Match visible text exactly where a behavior quotes it, because the agent compares what it sees with those words.

## Target stack

Build it with Expo (React Native, TypeScript).
It is a native Expo app (React Native) that runs on the Android emulator.
Keep a standard Expo project layout (app.json, package.json at the root) so it can be prebuilt and compiled locally. Use only Expo SDK modules that work offline.
Make every control reachable by its visible label (set accessibilityLabel to the visible text where needed), because the behaviors are driven by what is on screen.
It ships as a standalone release build: no Metro, no Expo Go, no dev client, no Expo Updates, and no network calls of any kind (no fetch, analytics, remote fonts or images).
Persist all app data with @react-native-async-storage/async-storage so it survives closing and reopening the app. On a phone, reloading or reopening the app means relaunching it, and the screen must look exactly as it did before.
Give the Android package and iOS bundle identifier a plain name such as com.theseus.app. Never use a Java or Kotlin keyword (native, new, class, default, package) as any segment, because the generated native code will not compile.
Where the web original used URL routes for views or filters, keep that view state in the app and persist it the same way, so reopening the app returns to the same view.

## Reference screenshots

Screens of the app this spec was captured from, in `reference/`. Match their layout and wording:

- reference/page-1.png
- reference/page-2.png
- reference/page-3.png
- reference/page-4.png
- reference/state-1-entries.png
- reference/state-2-toggled.png
- reference/state-3-link.png
- reference/state-4-link.png
- reference/state-5-link.png

## Behaviors (22)

## Empty state

### Fresh empty view

`fresh-empty`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, observe the page and store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify no todo items, counter, filters, or clear-completed action are shown.

## Adding

### Add one todo

`add-one`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, enter "Buy milk" and submit it, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify "Buy milk" appears as an active todo, the entry field is empty, and the counter shows "1 item left".

### Add many todos

`add-many`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, enter and submit "Buy milk", "Walk the dog", and "Write the report", then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify all three items appear in that order and the counter shows "3 items left".

### Clear input after add

`clear-input`, stores `input_text`

> Starting from a fresh app with no items, enter "Read book" and submit it, then store the entry-field text as 'input_text'. Verify the field is empty and "Read book" is visible in the list.

### Ignore empty submission

`ignore-empty`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, submit the empty entry field, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify no todo list or counter appears and the entry field remains empty.

### Trim surrounding whitespace

`trim-input`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, enter spaces around "Task" and submit it, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify the only todo is labeled "Task" without surrounding spaces and the counter shows "1 item left".

## Completion

### Complete one todo

`complete-one`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", mark "A" complete, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify "A" is shown completed, "B" remains active, and the counter shows "1 item left".

### Mark all complete

`complete-all`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", mark all todos complete, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify both items are completed, the mark-all state is checked, and the counter shows "0 items left".

### Uncomplete all todos

`uncomplete-all`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", mark all complete and then toggle the mark-all state off, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify both items are active and the counter shows "2 items left".

## Counter

### Pluralized counter

`counter-plural`, stores `counter_one`, `counter_two`

> Starting from a fresh app with no items, add "One", store the counter text as 'counter_one', then add "Two" and store the counter text as 'counter_two'. Verify the stored counter_one value is "1 item left" and the stored counter_two value is "2 items left".

## Filtering

### Show all filter

`filter-all`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", complete "A", choose the All view, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify both todos are visible and the counter shows "1 item left".

### Show active filter

`filter-active`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", complete "A", choose the Active view, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify only "B" is visible and the counter shows "1 item left".

### Show completed filter

`filter-completed`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", complete "A", choose the Completed view, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify only completed "A" is visible and the counter shows "1 item left".

### Update filtered list

`filtered-toggle`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", choose Active, complete "A", then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify "A" disappears from the active list while "B" remains visible and the counter shows "1 item left".

## Editing

### Save edited title

`edit-save`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "Old", enter editing for it, replace the title with "New", and submit the edit, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify the list shows "New" and no "Old" remains.

### Save edit on blur

`edit-blur`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "Old", enter editing for it, replace the title with "Blurred", and leave the field, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify the list shows "Blurred".

### Discard edit with escape

`edit-escape`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "Keep", enter editing for it, change the text to "Discard", and cancel the edit with Escape, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify the list still shows "Keep" and not "Discard".

### Empty edit removes todo

`edit-empty-removes`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "Remove me", enter editing for it, clear the title, and submit the edit, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify no todo item or counter is shown.

## Removal

### Remove one todo

`remove-one`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", remove "A", then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify only "B" remains and the counter shows "1 item left".

### Clear completed todos

`clear-completed`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", complete "A", clear completed todos, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify only active "B" remains, the counter shows "1 item left", and the clear-completed action is hidden.

## Persistence

### Persist todos after reopening

`persist-items`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", complete "A", close and reopen the app, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify both todos and their completion state remain and the counter shows "1 item left".

### Persist selected filter

`persist-filter`, stores `counter_text`, `visible_titles`

> Starting from a fresh app with no items, add "A" and "B", complete "A", choose Completed, close and reopen the app, then store the footer counter text exactly as shown, or the word none if no counter is visible, as 'counter_text', and store the titles of the visible todos in display order separated by commas, or the word none if no todos are visible, as 'visible_titles'. Verify the Completed view is still selected, only "A" is visible, and the counter shows "1 item left".
