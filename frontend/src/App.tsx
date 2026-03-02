import { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import axios from 'axios';
import Layout from './components/Layout/Layout';
import ChatInterface from './components/Chat/ChatInterface';
import InputBar from './components/Chat/InputBar';
import Login from './components/Login';
import UsageDashboard from './pages/UsageDashboard';
import AdminQuotaManagement from './pages/AdminQuotaManagement';
import UserPreferences from './pages/UserPreferences';
import UsageNotifications from './components/Usage/UsageNotifications';
import ProtectedRoute from './components/ProtectedRoute';
import { getApiUrl } from './config/api';
import { isAdmin, clearAuth, isTokenExpired } from './utils/auth';
import { TokenUsageProvider } from './contexts/TokenUsageContext';

// Initialise axios auth header synchronously from localStorage on module load.
// This prevents a race where useEffects (fetchModels, fetchThreads) fire on mount
// before the auth-headers effect runs, causing spurious 401s → login redirect loop.
const _initialToken = localStorage.getItem('mediquery_token');
if (_initialToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${_initialToken}`;
}

export interface Thread {
  id: string;
  title: string;
  updated_at: number;
  pinned: boolean;
}

export interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  data?: Record<string, unknown>;
  sql?: string;
  visualization_type?: string;
  thoughts?: string[];
}

interface RawMessage {
  id: string;
  role: string;
  text: string;
  meta?: {
    data?: Record<string, unknown>;
    sql?: string;
    visualization_type?: string;
    thoughts?: string[];
    query_plan?: string;
  };
}

type Theme = 'light' | 'dark' | 'system' | 'clinical-slate';
type AgentMode = 'fast' | 'multi-agent';

interface ModelOption {
  id: string;
  name: string;
  provider?: string;
}

// Inner component with access to router hooks
function AppContent() {
  const navigate = useNavigate();

  // State
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('mediquery_token'),
  );
  const [, setUser] = useState<string | null>(
    localStorage.getItem('mediquery_user'),
  );
  const [isLoading, setIsLoading] = useState(false);

  // Check if user is admin using role-based authorization
  const userIsAdmin = isAdmin();

  // Settings - Use backend defaults if localStorage is empty (first-time users)
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) || 'system',
  );
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>(() => {
    const savedMode = localStorage.getItem('agentMode');
    if (savedMode === 'thinking') {
      return 'multi-agent';
    }
    if (savedMode === 'fast' || savedMode === 'multi-agent') {
      return savedMode;
    }
    return 'multi-agent';
  });
  const [enable_memory, setEnableMemory] = useState<boolean>(() => {
    const saved = localStorage.getItem('enable_memory');
    return saved === null ? true : saved === 'true';
  });

  // Fetch available models from backend
  useEffect(() => {
    if (!token) {
      // Clear models when token is removed
      setModels([]);
      setSelectedModel('');
      return;
    }

    const fetchModels = async () => {
      try {
        const res = await axios.get(getApiUrl('/config/models'));
        const fetched = res.data.models;
        if (Array.isArray(fetched) && fetched.length > 0) {
          // Deduplicate models by id (backend may return duplicates)
          const uniqueModels = Array.from(
            new Map(fetched.map((m: ModelOption) => [m.id, m])).values(),
          );
          setModels(uniqueModels);
          setSelectedModel(uniqueModels[0].id);
        }
      } catch (err) {
        console.warn('Failed to fetch models', err);
      }
    };
    fetchModels();
  }, [token]);

  // Persistence
  useEffect(() => localStorage.setItem('theme', theme), [theme]);
  useEffect(() => localStorage.setItem('agentMode', agentMode), [agentMode]);
  useEffect(
    () => localStorage.setItem('enable_memory', String(enable_memory)),
    [enable_memory],
  );

  // Apply Theme
  useEffect(() => {
    const applyTheme = (
      themeName: 'light' | 'dark' | 'clinical-slate' | 'system',
    ) => {
      const effectiveTheme: 'light' | 'dark' | 'clinical-slate' =
        themeName === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : themeName;

      document.documentElement.setAttribute('data-theme', effectiveTheme);

      // Bridge: Shadcn v4 uses the `.dark` class for its dark variant
      // Our dark and clinical-slate themes both warrant dark Shadcn styling
      document.documentElement.classList.toggle(
        'dark',
        effectiveTheme === 'dark' || effectiveTheme === 'clinical-slate',
      );
    };

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches ? 'dark' : 'light');

      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyTheme(theme);
    }

    localStorage.setItem('theme', theme);
  }, [theme]);

  // Auth Headers
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Check for expired token on mount
  useEffect(() => {
    if (token && isTokenExpired()) {
      console.warn('Token expired on mount, clearing auth');
      setToken(null);
      setUser(null);
      clearAuth();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Run once on mount

  // Setup axios interceptor for 401 and 429 errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle 401 Unauthorized (expired/invalid token)
        if (error.response?.status === 401) {
          const isAuthEndpoint =
            error.config?.url?.includes('/auth/token') ||
            error.config?.url?.includes('/auth/register');

          if (!isAuthEndpoint) {
            console.warn(
              '401 Unauthorized - clearing auth and redirecting to login',
            );
            clearAuth();
            setToken(null);
            setUser(null);
            window.location.href = '/login';
          }
        }

        // Handle 429 Quota Exceeded
        if (error.response?.status === 429) {
          alert('Token quota exceeded. You have reached your monthly limit.');
        }

        return Promise.reject(error);
      },
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  // API Utils
  const fetchThreads = async () => {
    if (!token) return;
    try {
      const res = await axios.get(getApiUrl('/threads'));
      setThreads(res.data.threads || []);
    } catch (err) {
      console.error('Failed to fetch threads', err);
    }
  };

  const fetchMessages = async (threadId: string) => {
    try {
      const res = await axios.get(getApiUrl(`/threads/${threadId}/messages`));
      const rawMessages = (res.data.messages || []) as RawMessage[];
      const formattedMessages: Message[] = rawMessages.map((msg) => ({
        id: msg.id,
        sender: msg.role === 'user' ? 'user' : 'bot',
        text: msg.text,
        data: msg.meta?.data,
        sql: msg.meta?.sql,
        visualization_type: msg.meta?.visualization_type,
        thoughts:
          msg.meta?.thoughts && msg.meta.thoughts.length > 0
            ? msg.meta.thoughts
            : msg.meta?.query_plan
              ? [msg.meta.query_plan]
              : [],
      }));
      setMessages(formattedMessages);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  };

  // Effects
  useEffect(() => {
    if (token) fetchThreads();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchThreads recreated each render; token is the correct trigger

  useEffect(() => {
    if (currentThreadId && !isLoading) {
      fetchMessages(currentThreadId);
    } else if (!currentThreadId && !isLoading) {
      setMessages([]);
    }
  }, [currentThreadId, isLoading]);

  // Handlers
  const handleLogin = (newToken: string, username: string, role?: string) => {
    // Set auth header immediately so it is ready before any React effects fire.
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(username);
    localStorage.setItem('mediquery_token', newToken);
    localStorage.setItem('mediquery_user', username);
    if (role) {
      localStorage.setItem('role', role);
    }
    // React Router will handle navigation to home page
  };

  const handleLogout = async () => {
    try {
      await axios.post(getApiUrl('/auth/logout'));
    } catch (err) {
      console.warn('Backend logout failed', err);
    }
    setToken(null);
    setUser(null);
    clearAuth(); // Clear all auth data including role
    setMessages([]);
    setThreads([]);
    setCurrentThreadId(null);
  };

  const handleNewChat = () => {
    setCurrentThreadId(null);
    setMessages([]);
    navigate('/'); // Navigate back to chat page
  };

  const handleSelectThread = (threadId: string) => {
    setCurrentThreadId(threadId);
    navigate('/'); // Navigate back to chat page
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    try {
      await axios.patch(getApiUrl(`/threads/${threadId}`), { title: newTitle });
      fetchThreads();
    } catch (err) {
      console.error('Failed to rename thread', err);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await axios.delete(getApiUrl(`/threads/${threadId}`));
      if (currentThreadId === threadId) {
        handleNewChat();
      }
      fetchThreads();
    } catch (err) {
      console.error('Failed to delete thread', err);
    }
  };

  const handlePinThread = async (threadId: string, pinned: boolean) => {
    try {
      await axios.patch(getApiUrl(`/threads/${threadId}`), { pinned });
      fetchThreads();
    } catch (err) {
      console.error('Failed to pin thread', err);
    }
  };

  const handleShareThread = (threadId: string) => {
    // Mock share
    alert(`Shared thread ${threadId}`);
  };

  const handleClearMemory = async () => {
    try {
      await axios.delete(getApiUrl('/memory'));
    } catch (err) {
      console.error('Failed to clear memory', err);
    }
  };

  const handleOpenPreferences = () => {
    navigate('/preferences');
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Optimistic Update: User & Initial "Thinking" Bot Message
    const tempId = Date.now().toString();
    const userMsg: Message = { id: tempId, sender: 'user', text };
    const botId = (Date.now() + 1).toString();
    const thinkingMsg: Message = {
      id: botId,
      sender: 'bot',
      text: '',
      thoughts: ['Initializing agent workflow...'], // Initial thought
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('/queries/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          question: text,
          thread_id: currentThreadId,
          model_id: selectedModel,
          model_provider: models.find((m) => m.id === selectedModel)?.provider,
          // Map AgentMode to backend flags
          fast_mode: agentMode === 'fast',
          multi_agent: agentMode === 'multi-agent',
          enable_memory,
        }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const accumulatedThoughts: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.type === 'thought') {
              accumulatedThoughts.push(event.content);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botId
                    ? { ...msg, thoughts: [...accumulatedThoughts] }
                    : msg,
                ),
              );
            } else if (event.type === 'result') {
              const resData = event.payload;
              // Provide default empty values if missing
              const safeData = resData.data || {
                row_count: 0,
                columns: [],
                data: [],
              };

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botId
                    ? {
                        ...msg,
                        text:
                          resData.answer ||
                          resData.insight ||
                          'Analysis complete.',
                        data: safeData,
                        sql: resData.sql,
                        visualization_type: 'table',
                        thoughts: accumulatedThoughts,
                      }
                    : msg,
                ),
              );

              // Refresh threads list if needed (e.g. title update)
              fetchThreads();
            } else if (event.type === 'meta') {
              if (event.thread_id && event.thread_id !== currentThreadId) {
                setCurrentThreadId(event.thread_id);
              }
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === botId
                    ? {
                        ...msg,
                        text: `Error: ${event.content}`,
                        thoughts: [
                          ...accumulatedThoughts,
                          'Error encountered.',
                        ],
                      }
                    : msg,
                ),
              );
            }
          } catch (e) {
            console.warn('Stream parse error', e);
          }
        }
      }
    } catch (error: unknown) {
      const errorText = `I encountered an error processing your request: ${error instanceof Error ? error.message : String(error)}`;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botId
            ? {
                ...msg,
                text: errorText,
                thoughts: [...(msg.thoughts || []), 'Connection failed.'],
              }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <div className="flex h-screen flex-col items-center justify-center bg-(--bg-primary) p-4">
              <div className="w-full max-w-md rounded-2xl border border-(--border-subtle) bg-(--bg-secondary) p-8 shadow-lg">
                <div className="mb-8 text-center">
                  <h1 className="font-heading mb-2 text-2xl font-bold text-(--accent-primary)">
                    {import.meta.env.VITE_APP_TITLE || 'Mediquery'}
                  </h1>
                  <p className="text-(--text-secondary)">
                    Please sign in to continue
                  </p>
                </div>
                <Login onLogin={handleLogin} />
              </div>
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Main app with authenticated routes
  return (
    <TokenUsageProvider>
      <UsageNotifications />

      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />

        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={!!token}>
              <Layout
                onNewChat={handleNewChat}
                onLogout={handleLogout}
                threads={threads}
                currentChatId={currentThreadId}
                onSelectThread={handleSelectThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                onPinThread={handlePinThread}
                onShareThread={handleShareThread}
                theme={theme}
                setTheme={setTheme}
                onOpenPreferences={handleOpenPreferences}
              >
                <ChatInterface
                  messages={messages}
                  theme={theme}
                  onUpdateMessage={(id, updates) => {
                    setMessages((prev) =>
                      prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
                    );
                  }}
                />
                <InputBar
                  onSend={handleSend}
                  isLoading={isLoading}
                  agentMode={agentMode}
                  setAgentMode={setAgentMode}
                  models={models}
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute isAuthenticated={!!token}>
              <Layout
                onNewChat={handleNewChat}
                onLogout={handleLogout}
                threads={threads}
                currentChatId={currentThreadId}
                onSelectThread={handleSelectThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                onPinThread={handlePinThread}
                onShareThread={handleShareThread}
                theme={theme}
                setTheme={setTheme}
                onOpenPreferences={handleOpenPreferences}
              >
                <UsageDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute
              isAuthenticated={!!token}
              requireAdmin={true}
              isAdmin={userIsAdmin}
            >
              <Layout
                onNewChat={handleNewChat}
                onLogout={handleLogout}
                threads={threads}
                currentChatId={currentThreadId}
                onSelectThread={handleSelectThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                onPinThread={handlePinThread}
                onShareThread={handleShareThread}
                theme={theme}
                setTheme={setTheme}
                onOpenPreferences={handleOpenPreferences}
              >
                <AdminQuotaManagement />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/preferences"
          element={
            <ProtectedRoute isAuthenticated={!!token}>
              <Layout
                onNewChat={handleNewChat}
                onLogout={handleLogout}
                threads={threads}
                currentChatId={currentThreadId}
                onSelectThread={handleSelectThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                onPinThread={handlePinThread}
                onShareThread={handleShareThread}
                theme={theme}
                setTheme={setTheme}
                onOpenPreferences={handleOpenPreferences}
              >
                <UserPreferences
                  enable_memory={enable_memory}
                  setEnableMemory={setEnableMemory}
                  onClearMemory={handleClearMemory}
                  agentMode={agentMode}
                  setAgentMode={setAgentMode}
                />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </TokenUsageProvider>
  );
}

// Wrapper component that provides BrowserRouter
function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
