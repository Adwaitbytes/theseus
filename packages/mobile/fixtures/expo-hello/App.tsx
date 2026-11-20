import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

const STORAGE_KEY = 'expo-hello/todos';

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.completed === 'boolean'
  );
}

function parseTodos(raw: string | null): Todo[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isTodo) : [];
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => setTodos(parseTodos(raw)))
      .catch((error: unknown) => setStorageError(String(error)))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    // Writing before the first read finishes would overwrite saved todos with the empty initial list.
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos)).catch((error: unknown) =>
      setStorageError(String(error)),
    );
  }, [todos, loaded]);

  const addTodo = () => {
    const title = draft.trim();
    if (title.length === 0) return;
    setTodos((current) => [...current, { id: `${Date.now()}`, title, completed: false }]);
    setDraft('');
  };

  const toggleTodo = (id: string) => {
    setTodos((current) =>
      current.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)),
    );
  };

  const remaining = todos.filter((todo) => !todo.completed).length;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.title} accessibilityRole="header">
            todos
          </Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addTodo}
            placeholder="What needs to be done?"
            placeholderTextColor="#9a9a9a"
            accessibilityLabel="New todo"
            testID="new-todo"
            returnKeyType="done"
            submitBehavior="submit"
          />
          {storageError !== null && (
            <Text style={styles.error} accessibilityRole="alert">
              Could not save todos: {storageError}
            </Text>
          )}
          <FlatList
            data={todos}
            keyExtractor={(todo) => todo.id}
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => toggleTodo(item.id)}
                style={styles.row}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.completed }}
                accessibilityLabel={item.title}
                testID={`todo-${item.id}`}
              >
                <View style={[styles.check, item.completed && styles.checkDone]} />
                <Text style={[styles.rowText, item.completed && styles.rowTextDone]}>
                  {item.title}
                </Text>
              </Pressable>
            )}
          />
          <Text style={styles.footer} accessibilityLabel="Todo count" testID="todo-count">
            {remaining} {remaining === 1 ? 'item' : 'items'} left
          </Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 48 },
  title: {
    fontSize: 64,
    fontWeight: '200',
    color: '#b83f45',
    textAlign: 'center',
    letterSpacing: -1,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#111111',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  error: { color: '#b83f45', marginTop: 8 },
  list: { marginTop: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#c8c8c8',
    marginRight: 14,
  },
  checkDone: { borderColor: '#5dc2af', backgroundColor: '#5dc2af' },
  rowText: { fontSize: 18, color: '#222222', flexShrink: 1 },
  rowTextDone: { color: '#a0a0a0', textDecorationLine: 'line-through' },
  footer: { textAlign: 'center', color: '#777777', paddingVertical: 16 },
});
