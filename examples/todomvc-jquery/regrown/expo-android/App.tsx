import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Filter = 'All' | 'Active' | 'Completed';
type Todo = { id: string; title: string; completed: boolean };
type SavedState = { todos: Todo[]; filter: Filter };

const STORAGE_KEY = '@todovmc-native/state';
const filters: Filter[] = ['All', 'Active', 'Completed'];

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<Filter>('All');
  const [entry, setEntry] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [ready, setReady] = useState(false);
  const editInput = useRef<TextInput>(null);
  const ignoreNextBlur = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as SavedState;
        if (Array.isArray(saved.todos)) setTodos(saved.todos);
        if (filters.includes(saved.filter)) setFilter(saved.filter);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ todos, filter })).catch(() => undefined);
  }, [todos, filter, ready]);

  useEffect(() => {
    if (editingId) requestAnimationFrame(() => editInput.current?.focus());
  }, [editingId]);

  const addTodo = () => {
    const title = entry.trim();
    if (!title) return;
    setTodos((items) => [...items, { id: `${Date.now()}-${Math.random()}`, title, completed: false }]);
    setEntry('');
  };

  const toggleTodo = (id: string) => {
    setTodos((items) => items.map((todo) => todo.id === id ? { ...todo, completed: !todo.completed } : todo));
  };

  const beginEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  };

  const cancelEdit = () => {
    ignoreNextBlur.current = true;
    setEditingId(null);
    setEditingTitle('');
    Keyboard.dismiss();
  };

  const saveEdit = () => {
    if (!editingId) return;
    const title = editingTitle.trim();
    setTodos((items) => title
      ? items.map((todo) => todo.id === editingId ? { ...todo, title } : todo)
      : items.filter((todo) => todo.id !== editingId));
    setEditingId(null);
    setEditingTitle('');
    Keyboard.dismiss();
  };

  const activeCount = todos.filter((todo) => !todo.completed).length;
  const hasCompleted = todos.some((todo) => todo.completed);
  const allComplete = todos.length > 0 && activeCount === 0;
  const visibleTodos = todos.filter((todo) =>
    filter === 'All' || (filter === 'Active' ? !todo.completed : todo.completed),
  );

  const toggleAll = () => setTodos((items) => items.map((todo) => ({ ...todo, completed: !allComplete })));

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.page}>
        <Text style={styles.heading}>todos</Text>
        <View style={[styles.card, todos.length === 0 && styles.emptyCard]}>
          <View style={styles.newTodoRow}>
            {todos.length > 0 && (
              <Pressable
                onPress={toggleAll}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allComplete }}
                accessibilityLabel="Mark all as complete"
                style={styles.toggleAll}
              >
                <Text style={[styles.chevron, allComplete && styles.chevronChecked]}>⌄</Text>
              </Pressable>
            )}
            <TextInput
              value={entry}
              onChangeText={setEntry}
              onSubmitEditing={addTodo}
              returnKeyType="done"
              placeholder="What needs to be done?"
              placeholderTextColor="#a8a8a8"
              accessibilityLabel="What needs to be done?"
              style={styles.newTodoInput}
            />
          </View>

          {visibleTodos.map((todo) => (
            <View key={todo.id} style={styles.todoRow}>
              <Pressable
                onPress={() => toggleTodo(todo.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: todo.completed }}
                accessibilityLabel={`Toggle ${todo.title}`}
                style={[styles.checkCircle, todo.completed && styles.checkCircleDone]}
              >
                {todo.completed && <Text style={styles.checkmark}>✓</Text>}
              </Pressable>
              {editingId === todo.id ? (
                <TextInput
                  ref={editInput}
                  value={editingTitle}
                  onChangeText={setEditingTitle}
                  onSubmitEditing={saveEdit}
                  onBlur={() => {
                    if (ignoreNextBlur.current) {
                      ignoreNextBlur.current = false;
                      return;
                    }
                    saveEdit();
                  }}
                  onKeyPress={(event) => {
                    if (event.nativeEvent.key === 'Escape' || event.nativeEvent.key === 'Esc') cancelEdit();
                  }}
                  returnKeyType="done"
                  selectTextOnFocus
                  accessibilityLabel={`Edit ${todo.title}`}
                  style={styles.editInput}
                />
              ) : (
                <Pressable
                  onPress={() => beginEdit(todo)}
                  accessibilityRole="button"
                  accessibilityLabel={todo.title}
                  style={styles.todoTitleTap}
                >
                  <Text style={[styles.todoTitle, todo.completed && styles.todoTitleDone]}>{todo.title}</Text>
                </Pressable>
              )}
              {editingId !== todo.id && (
                <Pressable
                  onPress={() => setTodos((items) => items.filter((item) => item.id !== todo.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${todo.title}`}
                  hitSlop={10}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              )}
            </View>
          ))}

          {todos.length > 0 && (
            <View style={styles.footer}>
              <Text accessibilityLabel={`${activeCount} ${activeCount === 1 ? 'item' : 'items'} left`} style={styles.count}>
                {activeCount} {activeCount === 1 ? 'item' : 'items'} left
              </Text>
              <View style={styles.filterGroup}>
                {filters.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setFilter(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === item }}
                    accessibilityLabel={item}
                    style={[styles.filterButton, filter === item && styles.filterSelected]}
                  >
                    <Text style={styles.filterText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
              {hasCompleted ? (
                <Pressable onPress={() => setTodos((items) => items.filter((todo) => !todo.completed))} accessibilityRole="button" accessibilityLabel="Clear completed">
                  <Text style={styles.clearText}>Clear completed</Text>
                </Pressable>
              ) : <View style={styles.clearSpace} />}
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.infoText}>Double-click to edit a todo</Text>
          <Text style={styles.infoText}>Created by Sindre Sorhus</Text>
          <Text style={styles.infoText}>Updated by the TodoMVC Team</Text>
          <Text style={styles.infoText}>Part of TodoMVC</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  page: { flex: 1, alignItems: 'center', paddingTop: Platform.OS === 'android' ? 58 : 42, backgroundColor: '#f5f5f5' },
  heading: { fontSize: 68, fontWeight: '200', lineHeight: 78, color: '#e87b7b', letterSpacing: -2 },
  card: { width: '86%', maxWidth: 560, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  emptyCard: { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  newTodoRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ed9999', backgroundColor: '#fff' },
  toggleAll: { alignSelf: 'stretch', width: 58, justifyContent: 'center', alignItems: 'center' },
  chevron: { fontSize: 31, lineHeight: 31, color: '#777', transform: [{ translateY: -5 }] },
  chevronChecked: { color: '#555' },
  newTodoInput: { flex: 1, height: 70, paddingHorizontal: 17, fontSize: 20, fontStyle: 'italic', color: '#4d4d4d' },
  todoRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ededed', backgroundColor: '#fff' },
  checkCircle: { width: 58, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' },
  checkCircleDone: {},
  checkmark: { color: '#5dc2b8', fontSize: 24, fontWeight: '300', borderWidth: 1, borderColor: '#9adbd4', borderRadius: 20, height: 26, width: 26, textAlign: 'center', lineHeight: 24 },
  todoTitleTap: { flex: 1, justifyContent: 'center', alignSelf: 'stretch' },
  todoTitle: { fontSize: 20, color: '#4d4d4d', paddingVertical: 15 },
  todoTitleDone: { color: '#c5c5c5', textDecorationLine: 'line-through' },
  editInput: { flex: 1, height: 54, borderWidth: 1, borderColor: '#999', marginVertical: 5, paddingHorizontal: 8, fontSize: 20, color: '#4d4d4d', backgroundColor: '#fff' },
  removeButton: { width: 49, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' },
  removeText: { fontSize: 31, color: '#cc9a9a', fontWeight: '200' },
  footer: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  count: { width: 115, color: '#555', fontSize: 12 },
  filterGroup: { flexDirection: 'row', alignItems: 'center' },
  filterButton: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 3 },
  filterSelected: { borderColor: '#ebaaaa' },
  filterText: { color: '#555', fontSize: 12 },
  clearText: { color: '#555', fontSize: 12 },
  clearSpace: { width: 86 },
  info: { alignItems: 'center', marginTop: 47 },
  infoText: { fontSize: 10, lineHeight: 15, color: '#a6a6a6' },
});
