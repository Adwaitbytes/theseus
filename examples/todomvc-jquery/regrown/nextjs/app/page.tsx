'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

type Todo = { id: string; title: string; completed: boolean };
type Filter = 'all' | 'active' | 'completed';
const STORAGE_KEY = 'todomvc-nextjs-state';

function readSavedState(): { todos: Todo[]; filter: Filter } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { todos?: Todo[]; filter?: Filter };
    if (!Array.isArray(saved.todos)) return null;
    return {
      todos: saved.todos.filter((todo): todo is Todo =>
        typeof todo?.id === 'string' && typeof todo?.title === 'string' && typeof todo?.completed === 'boolean'
      ),
      filter: saved.filter === 'active' || saved.filter === 'completed' ? saved.filter : 'all',
    };
  } catch {
    return null;
  }
}

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [ready, setReady] = useState(false);
  const editInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = readSavedState();
    if (saved) {
      setTodos(saved.todos);
      setFilter(saved.filter);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ todos, filter }));
  }, [todos, filter, ready]);

  useEffect(() => {
    if (editingId) editInput.current?.focus();
  }, [editingId]);

  const addTodo = (event: FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setTodos((items) => [...items, { id: `${Date.now()}-${Math.random()}`, title, completed: false }]);
    setNewTitle('');
  };

  const toggleTodo = (id: string) => setTodos((items) =>
    items.map((item) => item.id === id ? { ...item, completed: !item.completed } : item)
  );

  const beginEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  };

  const finishEdit = (id: string) => {
    const title = editingTitle.trim();
    if (!title) setTodos((items) => items.filter((item) => item.id !== id));
    else setTodos((items) => items.map((item) => item.id === id ? { ...item, title } : item));
    setEditingId(null);
  };

  const editKeyDown = (event: KeyboardEvent<HTMLInputElement>, id: string, original: string) => {
    if (event.key === 'Enter') finishEdit(id);
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditingTitle(original);
      setEditingId(null);
    }
  };

  const visibleTodos = todos.filter((todo) => filter === 'all' || (filter === 'active' ? !todo.completed : todo.completed));
  const left = todos.filter((todo) => !todo.completed).length;
  const allDone = todos.length > 0 && left === 0;
  const hasCompleted = todos.some((todo) => todo.completed);

  return (
    <main className="todoapp">
      <header className="header">
        <h1>todos</h1>
        <form onSubmit={addTodo}>
          {todos.length > 0 && (
            <button
              className="toggle-all"
              type="button"
              onClick={() => setTodos((items) => items.map((item) => ({ ...item, completed: !allDone })))}
              aria-label={allDone ? 'Mark all as active' : 'Mark all as complete'}
              aria-pressed={allDone}
              title="Mark all as complete"
            >⌄</button>
          )}
          <input
            className="new-todo"
            aria-label="New todo"
            autoFocus
            placeholder="What needs to be done?"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
        </form>
      </header>

      {todos.length > 0 && (
        <section className="main" aria-label="Todo list">
          <ul className="todo-list">
            {visibleTodos.map((todo) => (
              <li className={`${todo.completed ? 'completed ' : ''}${editingId === todo.id ? 'editing' : ''}`} key={todo.id}>
                {editingId === todo.id ? (
                  <input
                    ref={editInput}
                    className="edit"
                    aria-label="Edit todo"
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={() => finishEdit(todo.id)}
                    onKeyDown={(event) => editKeyDown(event, todo.id, todo.title)}
                  />
                ) : (
                  <div className="view">
                    <button className="toggle" type="button" aria-label={`Toggle ${todo.title}`} aria-pressed={todo.completed} onClick={() => toggleTodo(todo.id)}>
                      {todo.completed && '✓'}
                    </button>
                    <label onDoubleClick={() => beginEdit(todo)}>{todo.title}</label>
                    <button className="destroy" type="button" aria-label={`Delete ${todo.title}`} onClick={() => setTodos((items) => items.filter((item) => item.id !== todo.id))}>×</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <footer className="footer">
            <span className="todo-count"><strong>{left}</strong> {left === 1 ? 'item' : 'items'} left</span>
            <nav className="filters" aria-label="Todo filters">
              {(['all', 'active', 'completed'] as Filter[]).map((name) => (
                <button key={name} type="button" className={filter === name ? 'selected' : ''} onClick={() => setFilter(name)}>
                  {name === 'all' ? 'All' : name === 'active' ? 'Active' : 'Completed'}
                </button>
              ))}
            </nav>
            {hasCompleted && <button className="clear-completed" type="button" onClick={() => setTodos((items) => items.filter((item) => !item.completed))}>Clear completed</button>}
          </footer>
        </section>
      )}

      <footer className="info">
        <p>Double-click to edit a todo</p>
        <p>Created by Sindre Sorhus</p>
        <p>Updated by the TodoMVC Team</p>
        <p>Part of TodoMVC</p>
      </footer>
    </main>
  );
}
