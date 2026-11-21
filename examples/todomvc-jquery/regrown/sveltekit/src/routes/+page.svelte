<script lang="ts">
  import { onMount, tick } from 'svelte';

  type Filter = 'all' | 'active' | 'completed';
  type Todo = { id: number; title: string; completed: boolean };
  const STORE = 'todomvc-sveltekit-items';
  const FILTER_STORE = 'todomvc-sveltekit-filter';
  let todos: Todo[] = [];
  let filter: Filter = 'all';
  let newTitle = '';
  let editingId: number | null = null;
  let editTitle = '';
  let editInput: HTMLInputElement;
  let ready = false;

  onMount(() => {
    try {
      const saved = localStorage.getItem(STORE);
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) todos = parsed.filter((x): x is Todo => x && typeof x.title === 'string' && typeof x.completed === 'boolean' && typeof x.id === 'number');
      const savedFilter = localStorage.getItem(FILTER_STORE);
      if (savedFilter === 'all' || savedFilter === 'active' || savedFilter === 'completed') filter = savedFilter;
    } catch { /* corrupted browser storage should not break the app */ }
    ready = true;
  });

  $: if (ready) {
    localStorage.setItem(STORE, JSON.stringify(todos));
    localStorage.setItem(FILTER_STORE, filter);
  }
  $: activeCount = todos.filter((todo) => !todo.completed).length;
  $: completedCount = todos.length - activeCount;
  $: shown = todos.filter((todo) => filter === 'all' || (filter === 'active' ? !todo.completed : todo.completed));
  $: allDone = todos.length > 0 && activeCount === 0;

  function addTodo() {
    const title = newTitle.trim();
    if (!title) return;
    todos = [...todos, { id: Date.now() + Math.floor(Math.random() * 1000), title, completed: false }];
    newTitle = '';
  }
  function toggle(todo: Todo) { todos = todos.map((item) => item.id === todo.id ? { ...item, completed: !item.completed } : item); }
  function toggleAll() { todos = todos.map((todo) => ({ ...todo, completed: !allDone })); }
  function remove(id: number) { todos = todos.filter((todo) => todo.id !== id); }
  async function beginEdit(todo: Todo) {
    editingId = todo.id;
    editTitle = todo.title;
    await tick();
    editInput?.focus();
    editInput?.select();
  }
  function saveEdit(todo: Todo) {
    if (editingId !== todo.id) return;
    const title = editTitle.trim();
    if (title) todos = todos.map((item) => item.id === todo.id ? { ...item, title } : item);
    else remove(todo.id);
    editingId = null;
  }
  function cancelEdit() { editingId = null; editTitle = ''; }
  function setFilter(next: Filter) { filter = next; }
</script>

<svelte:head><meta name="description" content="TodoMVC application" /></svelte:head>

<main class="todoapp">
  <header class="header">
    <h1>todos</h1>
    <form onsubmit={(event) => { event.preventDefault(); addTodo(); }}>
      <input class="new-todo" aria-label="New todo" placeholder="What needs to be done?" bind:value={newTitle} autofocus />
    </form>
  </header>

  {#if todos.length}
    <section class="main" aria-label="Todo list">
      <label class="toggle-all-label" aria-label="Mark all as complete">
        <input class="toggle-all" type="checkbox" checked={allDone} onchange={toggleAll} />
        <span>❯</span>
      </label>
      <ul class="todo-list">
        {#each shown as todo (todo.id)}
          <li class:completed={todo.completed} class:editing={editingId === todo.id}>
            <div class="view">
              <input class="toggle" type="checkbox" aria-label={`Toggle ${todo.title}`} checked={todo.completed} onchange={() => toggle(todo)} />
              <label ondblclick={() => beginEdit(todo)}>{todo.title}</label>
              <button class="destroy" aria-label={`Delete ${todo.title}`} onclick={() => remove(todo.id)}></button>
            </div>
            {#if editingId === todo.id}
              <input class="edit" bind:this={editInput} bind:value={editTitle} aria-label={`Edit ${todo.title}`} onblur={() => saveEdit(todo)} onkeydown={(event) => { if (event.key === 'Enter') saveEdit(todo); if (event.key === 'Escape') cancelEdit(); }} />
            {/if}
          </li>
        {/each}
      </ul>
    </section>
    <footer class="footer">
      <span class="todo-count"><strong>{activeCount}</strong> {activeCount === 1 ? 'item' : 'items'} left</span>
      <ul class="filters" aria-label="Filters">
        <li><button class:selected={filter === 'all'} onclick={() => setFilter('all')}>All</button></li>
        <li><button class:selected={filter === 'active'} onclick={() => setFilter('active')}>Active</button></li>
        <li><button class:selected={filter === 'completed'} onclick={() => setFilter('completed')}>Completed</button></li>
      </ul>
      {#if completedCount}<button class="clear-completed" onclick={() => todos = todos.filter((todo) => !todo.completed)}>Clear completed</button>{/if}
    </footer>
  {/if}
</main>

<footer class="info">
  <p>Double-click to edit a todo</p>
  <p>Created by <a href="https://sindresorhus.com">Sindre Sorhus</a></p>
  <p>Updated by the TodoMVC Team</p>
  <p>Part of <a href="http://todomvc.com">TodoMVC</a></p>
</footer>

<style>
  .todoapp { width: 550px; margin: 0 auto 40px; position: relative; }
  .header h1 { width: 100%; margin: 10px 0 12px; color: rgba(175, 47, 47, .58); font-size: 100px; font-weight: 100; text-align: center; line-height: 1.05; }
  .new-todo, .edit { position: relative; width: 100%; margin: 0; padding: 16px 16px 16px 60px; border: 1px solid #ed9c9c; background: rgba(255,255,255,.9); box-shadow: inset 0 -2px 1px rgba(0,0,0,.03), 0 2px 10px rgba(0,0,0,.12); color: #4d4d4d; font-size: 24px; font-weight: 300; line-height: 1.4; outline: none; }
  .new-todo::placeholder { color: #e6e6e6; font-style: italic; font-weight: 300; }
  .main { position: relative; border-top: 1px solid #e6e6e6; }
  .toggle-all-label { position: absolute; top: -66px; left: 0; display: flex; width: 60px; height: 65px; cursor: pointer; align-items: center; justify-content: center; }
  .toggle-all { position: absolute; opacity: 0; }
  .toggle-all-label span { color: #e6e6e6; font-size: 25px; transform: rotate(90deg); }
  .toggle-all:checked + span { color: #737373; }
  .todo-list { padding: 0; margin: 0; list-style: none; }
  .todo-list li { position: relative; border-bottom: 1px solid #ededed; background: #fff; font-size: 24px; }
  .view { display: flex; min-height: 60px; align-items: center; }
  .toggle { width: 40px; height: 40px; margin: 0 10px; cursor: pointer; appearance: none; border: 1px solid #d9d9d9; border-radius: 50%; background: #fff; }
  .toggle:checked { border-color: #b6dfd9; }
  .toggle:checked::after { content: '✓'; position: relative; left: 10px; top: 3px; color: #5dc2af; font-size: 24px; }
  .todo-list label { display: block; flex: 1; overflow-wrap: anywhere; padding: 15px 15px 15px 5px; line-height: 1.2; transition: color .2s; }
  .completed label { color: #cdcdcd; text-decoration: line-through; }
  .destroy { width: 40px; height: 40px; margin-right: 8px; border: 0; background: transparent; color: #cc9a9a; cursor: pointer; opacity: 0; }
  .destroy::after { content: '×'; font-size: 31px; line-height: 36px; }
  li:hover .destroy { opacity: 1; }
  .editing .view { display: none; }
  .edit { display: block; padding: 12px 16px 12px 60px; box-shadow: inset 0 -1px 5px 0 rgba(0,0,0,.2); }
  .footer { position: relative; display: flex; min-height: 40px; align-items: center; padding: 10px 15px; color: #777; background: #fff; font-size: 14px; text-align: center; box-shadow: 0 1px 1px rgba(0,0,0,.2), 0 8px 0 -3px #f6f6f6, 0 9px 1px -3px rgba(0,0,0,.2), 0 16px 0 -6px #f6f6f6, 0 17px 2px -6px rgba(0,0,0,.2); }
  .todo-count { width: 110px; text-align: left; white-space: nowrap; }
  .todo-count strong { font-weight: 400; }
  .filters { display: flex; gap: 3px; margin: 0 auto; padding: 0; list-style: none; }
  .filters button, .clear-completed { padding: 3px 7px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; text-decoration: none; }
  .filters button.selected { border-color: rgba(175,47,47,.2); }
  .filters button:hover, .clear-completed:hover { border-color: rgba(175,47,47,.1); }
  .clear-completed { width: 118px; white-space: nowrap; }
  .info { margin: 65px auto 0; color: #bfbfbf; font-size: 10px; text-align: center; text-shadow: 0 1px 0 rgba(255,255,255,.5); }
  .info p { margin: 3px 0; }
  .info a { color: inherit; text-decoration: none; font-weight: 400; }
  @media (max-width: 600px) { .todoapp { width: calc(100% - 28px); } .header h1 { font-size: 72px; } .footer { padding-left: 8px; padding-right: 8px; } .todo-count { width: auto; } .clear-completed { width: auto; } .filters { gap: 0; } }
</style>
