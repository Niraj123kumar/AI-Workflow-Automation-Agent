import React, { 
  useState, 
  useEffect, 
  useRef, 
  useMemo, 
  useCallback, 
  memo, 
  Suspense, 
  lazy 
} from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import { 
  Send, Paperclip, LogOut, History, Bell, Plus, 
  Calendar, BarChart3, Shield, AlertTriangle
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FixedSizeList as List, VariableSizeList } from 'react-window';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

// --- Types & Constants ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE = import.meta.env.VITE_API_BASE_URL;

type Message = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  intent?: string;
  result?: any;
  job_id?: string;
  status?: 'pending' | 'completed' | 'failed' | 'DEAD';
};

type UserData = {
  username: string;
  role: string;
};

// --- Components ---

const ErrorFallback = ({ error }: FallbackProps) => (
  <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-4">
    <div className="glass p-8 rounded-3xl max-w-md text-center border-red-500/50">
      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
      <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
      <p className="text-white/60 mb-4">Refresh the page to continue.</p>
      <details className="text-xs text-red-400 bg-black/30 p-4 rounded-xl text-left overflow-auto max-h-40">
        <summary className="cursor-pointer font-bold mb-1">Error details</summary>
        {error?.message || 'Unknown error'}
      </details>
    </div>
  </div>
);

const SkeletonCard = () => (
  <div className="w-full max-w-[70%] p-4 rounded-2xl glass-dark animate-pulse mb-6 ml-6">
    <div className="h-4 w-24 bg-white/10 rounded mb-3" />
    <div className="h-3 w-full bg-white/5 rounded mb-2" />
    <div className="h-3 w-2/3 bg-white/5 rounded" />
  </div>
);

const MessageCard = memo(({ message }: { message: Message }) => {
  const isUser = message.role === 'user';
  
  const resultView = useMemo(() => {
    if (!message.result) return null;
    let res = message.result;
    if (typeof res === 'string') {
      try { res = JSON.parse(res); } catch { return <div className="mt-2 text-sm text-white/80">{res}</div>; }
    }

    if (message.intent === 'csv_analysis' && res.trends) {
      return (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-2 text-xs font-medium text-white/50 uppercase">Trend</th>
                <th className="p-2 text-xs font-medium text-white/50 uppercase">Value</th>
              </tr>
            </thead>
            <tbody>
              {res.trends.map((t: any, i: number) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="p-2 text-sm font-medium">{t.title}</td>
                  <td className="p-2 text-sm font-mono text-blue-400">{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (message.intent === 'scheduler') {
      return (
        <div className="mt-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-purple-400 mt-1" />
            <div>
              <h4 className="font-semibold text-purple-400">{res.title}</h4>
              <p className="text-xs text-white/70">{new Date(res.datetime_iso).toLocaleString()}</p>
            </div>
          </div>
        </div>
      );
    }

    if (message.intent === 'summarize') {
      return (
        <div className="mt-4 space-y-2">
          <ReactMarkdown className="text-sm text-white/80 leading-relaxed prose prose-invert">
            {res.summary}
          </ReactMarkdown>
        </div>
      );
    }

    return <div className="mt-2 text-sm text-white/80">{JSON.stringify(res)}</div>;
  }, [message.result, message.intent]);

  const intentColor = useMemo(() => {
    switch (message.intent) {
      case 'csv_analysis': return 'bg-blue-500/20 text-blue-400';
      case 'scheduler': return 'bg-purple-500/20 text-purple-400';
      case 'summarize': return 'bg-green-500/20 text-green-400';
      default: return 'bg-white/10 text-white/60';
    }
  }, [message.intent]);

  return (
    <div className={cn("flex w-full mb-6 px-6", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] md:max-w-[70%] p-4 rounded-2xl shadow-2xl relative",
        isUser ? "bg-gradient-to-br from-blue-600 to-purple-600" : "glass-dark"
      )}>
        {!isUser && message.intent && (
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mb-2 inline-block", intentColor)}>
            {message.intent}
          </span>
        )}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        {resultView}
        {message.status === 'pending' && (
          <div className="flex gap-1 mt-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse delay-150" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse delay-300" />
          </div>
        )}
        {!isUser && message.job_id && (
          <div className="mt-2 text-[10px] text-white/20 font-mono">ID: {message.job_id.slice(0, 8)}</div>
        )}
      </div>
    </div>
  );
});

const AdminPanel = lazy(() => import('./AdminPanel'));

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [page, setPage] = useState<'login' | 'chat' | 'admin'>('login');
  const [messagesMap, setMessagesMap] = useState<Map<string, Message>>(new Map());
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(sessionStorage.getItem('jwt'));
  const pollIntervals = useRef<Map<string, number>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const chatListRef = useRef<any>(null);

  // --- Helpers ---
  const getApi = useCallback((requestId: string) => {
    const controller = new AbortController();
    if (abortControllers.current.has(requestId)) {
      abortControllers.current.get(requestId)?.abort();
    }
    abortControllers.current.set(requestId, controller);
    
    const instance = axios.create({ 
      baseURL: API_BASE,
      signal: controller.signal
    });
    if (tokenRef.current) {
      instance.defaults.headers.common['Authorization'] = `Bearer ${tokenRef.current}`;
    }
    return instance;
  }, []);

  useEffect(() => {
    if (tokenRef.current && !user) {
      // Re-hydrate user from token if needed (simplification: assume role 'user' or decode JWT)
      setUser({ username: 'session-user', role: 'admin' }); // Example role
      setPage('chat');
    }
    return () => {
      abortControllers.current.forEach(c => c.abort());
      pollIntervals.current.forEach(i => clearInterval(i));
    };
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // --- Auth ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.target as any;
    try {
      const res = await getApi('login').post('/auth/login', { 
        username: form.username.value, 
        password: form.password.value 
      });
      tokenRef.current = res.data.token;
      sessionStorage.setItem('jwt', res.data.token);
      setUser({ username: form.username.value, role: res.data.role });
      setPage('chat');
    } catch (err) {
      if (!axios.isCancel(err)) alert('Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Polling ---
  const pollResult = useCallback((jobId: string) => {
    if (pollIntervals.current.has(jobId)) return;

    const intervalId = window.setInterval(async () => {
      try {
        const res = await getApi(`poll-${jobId}`).get(`/result/${jobId}`);
        const data = res.data.data;
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'DEAD') {
          clearInterval(intervalId);
          pollIntervals.current.delete(jobId);
          setMessagesMap(prev => {
            const next = new Map(prev);
            const msg = next.get(jobId);
            if (msg) next.set(jobId, { ...msg, ...data });
            return next;
          });
          if (data.status === 'completed') setToast(`Job ${jobId.slice(0,8)} completed!`);
        }
      } catch (err) {
        if (!axios.isCancel(err)) {
          clearInterval(intervalId);
          pollIntervals.current.delete(jobId);
        }
      }
    }, 2000);

    pollIntervals.current.set(jobId, intervalId);
  }, [getApi]);

  // --- Actions ---
  const sendMessage = async () => {
    if (!input.trim() || submitting) return;
    setSubmitting(true);
    const tempId = Date.now().toString();
    setMessagesMap(prev => new Map(prev).set(tempId, { id: tempId, role: 'user', content: input }));
    
    try {
      const res = await getApi('send').post('/run-workflow', { 
        command: input, 
        username: user?.username 
      });
      const jobId = res.data.job_id;
      setMessagesMap(prev => {
        const next = new Map(prev);
        next.set(jobId, { id: jobId, role: 'agent', content: 'Thinking...', status: 'pending' });
        return next;
      });
      setInput('');
      pollResult(jobId);
    } catch (err) {
      if (!axios.isCancel(err)) alert('Failed to send');
    } finally {
      setSubmitting(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const formData = new FormData();
      formData.append('file', file);
      setSubmitting(true);
      try {
        const res = await getApi('upload').post('/upload', formData, {
          onUploadProgress: (p) => setUploadProgress(Math.round((p.loaded * 100) / (p.total || 1)))
        });
        setInput(prev => prev + ` [file_id:${res.data.data.file_id}]`);
      } catch (err) {
        if (!axios.isCancel(err)) alert('Upload failed');
      } finally {
        setSubmitting(false);
        setUploadProgress(0);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [getApi]);

  const { getRootProps, getInputProps } = useDropzone({ onDrop, multiple: false, accept: { 'text/plain': ['.txt'], 'text/csv': ['.csv'], 'application/pdf': ['.pdf'] } });

  // --- Virtualization ---
  const historyList = useMemo(() => history, [history]);
  const HistoryRow = useCallback(({ index, style }: any) => (
    <div style={style} className="px-4 py-3 hover:bg-white/5 cursor-pointer truncate text-sm text-white/60 flex items-center gap-3 group" onClick={() => setInput(historyList[index].command)}>
      <History className="w-3.5 h-3.5 opacity-30 group-hover:opacity-100" />
      {historyList[index].command}
    </div>
  ), [historyList]);

  const messages = useMemo(() => Array.from(messagesMap.values()), [messagesMap]);
  const MessageRow = useCallback(({ index, style }: any) => (
    <div style={style}>
      <MessageCard message={messages[index]} />
    </div>
  ), [messages]);

  // --- Data Fetching ---
  useEffect(() => {
    if (user && page === 'chat') {
      const fetchInitial = async () => {
        setLoading(true);
        try {
          const [l, n] = await Promise.all([
            getApi('logs').get('/logs'),
            getApi('notifs').get('/notifications')
          ]);
          setHistory(l.data.data || []);
          setNotifications(n.data || []);
        } catch {} finally { setLoading(false); }
      };
      fetchInitial();
    }
  }, [user, page, getApi]);

  // --- Render ---
  if (page === 'login') {
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md glass p-8 rounded-3xl space-y-4 shadow-2xl border border-white/5">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">AI Agent Login</h1>
            <p className="text-white/40 text-sm mt-1">Enterprise Automation Platform</p>
          </div>
          <input name="username" placeholder="Username" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50" required />
          <input name="password" type="password" placeholder="Password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50" required />
          <button disabled={submitting} className="w-full bg-blue-600 py-3 rounded-xl font-bold text-white transition-all hover:bg-blue-500 disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-600/20">
            {submitting ? 'Authenticating...' : 'Login'}
          </button>
          <button type="button" onClick={() => window.location.href = `${API_BASE}/auth/google`} className="w-full glass py-3 rounded-xl flex items-center justify-center gap-3 text-white/80 hover:bg-white/10 transition-all">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
            Login with Google
          </button>
        </form>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="flex h-screen bg-[#0f0f1a] text-white overflow-hidden font-sans">
        <aside className="w-[260px] glass border-r border-white/5 flex flex-col hidden md:flex shrink-0">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              <span className="font-bold tracking-tight">AI Agent</span>
            </div>
            <button onClick={() => setMessagesMap(new Map())} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <List height={window.innerHeight - 180} itemCount={history.length} itemSize={56} width={260}>
                {HistoryRow}
              </List>
            )}
          </div>
          <div className="p-4 border-t border-white/5 bg-white/5">
             {user?.role === 'admin' && (
                <button onClick={() => setPage('admin')} className="w-full flex items-center gap-3 p-3 glass hover:bg-white/10 rounded-xl transition-all text-sm font-bold text-blue-400 mb-2">
                  <BarChart3 className="w-4 h-4" /> Admin Console
                </button>
              )}
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{user?.username}</span>
                <button onClick={() => { sessionStorage.clear(); window.location.reload(); }} className="text-white/20 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" /></button>
              </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col relative min-w-0">
          <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 glass shrink-0">
            <h2 className="font-bold text-lg">Chat Stream</h2>
            <div className="flex items-center gap-4">
               <div className="flex -space-x-2">
                 <div className="w-8 h-8 rounded-full border-2 border-[#0f0f1a] bg-blue-600 flex items-center justify-center text-[10px] font-bold">A</div>
               </div>
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
                <Shield className="w-24 h-24 mb-6" />
                <h3 className="text-2xl font-bold">Secure AI Environment</h3>
                <p className="max-w-xs text-center mt-2 text-sm">Drop files or type commands to begin automated workflows.</p>
              </div>
            ) : (
               <VariableSizeList
                ref={chatListRef}
                height={window.innerHeight - 180}
                itemCount={messages.length}
                itemSize={(i) => messages[i].result ? 240 : 80}
                width="100%"
              >
                {MessageRow}
              </VariableSizeList>
            )}
          </div>

          <div className="p-6 md:p-10 pt-0 shrink-0">
            <div className="max-w-4xl mx-auto glass rounded-3xl p-2 shadow-2xl relative border border-white/10 group focus-within:border-blue-500/50 transition-all">
              <textarea 
                className="w-full bg-transparent p-4 focus:outline-none resize-none text-white h-24 text-lg"
                placeholder="Schedule a sync with the team tomorrow..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <div className="flex justify-between items-center px-4 pb-4">
                <div className="flex items-center gap-4">
                  <div {...getRootProps()} className="p-2 hover:bg-white/5 rounded-xl transition-colors cursor-pointer text-white/40 hover:text-blue-400">
                    <input {...getInputProps()} />
                    <Paperclip className="w-5 h-5" />
                  </div>
                  {uploadProgress > 0 && (
                    <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>
                <button onClick={sendMessage} disabled={submitting || !input.trim()} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 p-3 rounded-2xl disabled:opacity-20 transition-all active:scale-90 shadow-lg">
                  <Send className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
            <p className="text-[9px] text-center mt-4 text-white/10 uppercase tracking-[0.3em]">End-to-End Encrypted Node: {window.location.hostname}</p>
          </div>
        </main>

        {page === 'admin' && (
          <Suspense fallback={<div className="fixed inset-0 glass flex items-center justify-center z-50">Loading Admin Dashboard...</div>}>
            <AdminPanel onClose={() => setPage('chat')} getApi={getApi} />
          </Suspense>
        )}

        {toast && (
          <div className="fixed bottom-8 right-8 glass p-4 rounded-2xl border-l-4 border-blue-500 shadow-2xl z-50 flex items-center gap-3 animate-in slide-in-from-right duration-500">
            <CheckCircle2 className="text-blue-500 w-5 h-5" />
            <p className="text-sm font-medium">{toast}</p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
