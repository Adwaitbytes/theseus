# Crawl of the original app

Start URL: http://localhost:4170

## Screens reachable from the start URL

### page 1: TodoMVC: jQuery

Screenshot: screens/page-1.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

### page 2: TodoMVC: jQuery

Screenshot: screens/page-2.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

### page 3: TodoMVC: jQuery

Screenshot: screens/page-3.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

### page 4: TodoMVC: jQuery

Screenshot: screens/page-4.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

## Interactive states

### after typing 3 entries into the first text field and pressing Enter after each: TodoMVC: jQuery

Screenshot: screens/state-1-entries.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- main:
  - checkbox "❯ Mark all as complete"
  - text: ❯ Mark all as complete
  - list:
    - listitem:
      - checkbox
      - text: Buy milk
    - listitem:
      - checkbox
      - text: Walk the dog
    - listitem:
      - checkbox
      - text: Write the report
- strong: "3"
- text: items left
- list:
  - listitem:
    - link "All":
      - /url: "#/all"
  - listitem:
    - link "Active":
      - /url: "#/active"
  - listitem:
    - link "Completed":
      - /url: "#/completed"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

### after clicking the first checkbox: TodoMVC: jQuery

Screenshot: screens/state-2-toggled.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- main:
  - checkbox "❯ Mark all as complete" [checked]
  - text: ❯ Mark all as complete
  - list:
    - listitem:
      - checkbox [checked]
      - text: Buy milk
    - listitem:
      - checkbox [checked]
      - text: Walk the dog
    - listitem:
      - checkbox [checked]
      - text: Write the report
- strong: "0"
- text: items left
- list:
  - listitem:
    - link "All":
      - /url: "#/all"
  - listitem:
    - link "Active":
      - /url: "#/active"
  - listitem:
    - link "Completed":
      - /url: "#/completed"
- button "Clear completed"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

### the screen at #/all with the sample data above: TodoMVC: jQuery

Screenshot: screens/state-3-link.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- main:
  - checkbox "❯ Mark all as complete" [checked]
  - text: ❯ Mark all as complete
  - list:
    - listitem:
      - checkbox [checked]
      - text: Buy milk
    - listitem:
      - checkbox [checked]
      - text: Walk the dog
    - listitem:
      - checkbox [checked]
      - text: Write the report
- strong: "0"
- text: items left
- list:
  - listitem:
    - link "All":
      - /url: "#/all"
  - listitem:
    - link "Active":
      - /url: "#/active"
  - listitem:
    - link "Completed":
      - /url: "#/completed"
- button "Clear completed"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

### the screen at #/active with the sample data above: TodoMVC: jQuery

Screenshot: screens/state-4-link.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- strong: "0"
- text: items left
- list:
  - listitem:
    - link "All":
      - /url: "#/all"
  - listitem:
    - link "Active":
      - /url: "#/active"
  - listitem:
    - link "Completed":
      - /url: "#/completed"
- button "Clear completed"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```

### the screen at #/completed with the sample data above: TodoMVC: jQuery

Screenshot: screens/state-5-link.png

```yaml
- heading "todos" [level=1]
- textbox "What needs to be done?"
- main:
  - checkbox "❯ Mark all as complete" [checked]
  - text: ❯ Mark all as complete
  - list:
    - listitem:
      - checkbox [checked]
      - text: Buy milk
    - listitem:
      - checkbox [checked]
      - text: Walk the dog
    - listitem:
      - checkbox [checked]
      - text: Write the report
- strong: "0"
- text: items left
- list:
  - listitem:
    - link "All":
      - /url: "#/all"
  - listitem:
    - link "Active":
      - /url: "#/active"
  - listitem:
    - link "Completed":
      - /url: "#/completed"
- button "Clear completed"
- contentinfo:
  - paragraph: Double-click to edit a todo
  - paragraph:
    - text: Created by
    - link "Sindre Sorhus":
      - /url: http://sindresorhus.com
  - paragraph: Updated by the TodoMVC Team
  - paragraph:
    - text: Part of
    - link "TodoMVC":
      - /url: http://todomvc.com
```
