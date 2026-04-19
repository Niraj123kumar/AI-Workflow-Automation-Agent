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
  Calendar, BarChart3, Shield, AlertTriangle, CheckCircle2,
  Activity, Zap, Clock, ChevronDown, ChevronUp
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FixedSizeList as List, VariableSizeList } from 'react-window';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

// --- Types & Constants ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000';

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
        {(error as any)?.message || 'Unknown error'}
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
  const [showTrace, setShowTrace] = useState(false);
  const [displayed, setDisplayed] = useState("");
  const typeRef = useRef<any>(null);

  const resultText = useMemo(() => {
    if (!message.result) return "";
    if (typeof message.result === 'string') return message.result;
    if (message.intent === 'summarize' && message.result.summary) return message.result.summary;
    return JSON.stringify(message.result);
  }, [message.result, message.intent]);

  useEffect(() => {
    if (isUser || message.status !== 'completed' || !resultText) {
      setDisplayed(resultText);
      return;
    }
    
    let i = 0;
    if (typeRef.current) clearInterval(typeRef.current);
    
    typeRef.current = setInterval(() => {
      setDisplayed(resultText.slice(0, i + 1));
      i++;
      if (i >= resultText.length) {
        if (typeRef.current) clearInterval(typeRef.current);
        typeRef.current = null;
      }
    }, 8);
    
    return () => {
      if (typeRef.current) clearInterval(typeRef.current);
    };
  }, [message.status, resultText, isUser]);

  const resultView = useMemo(() => {
    if (!message.result) return null;
    let res = message.result;
    if (typeof res === 'string') {
      try { res = JSON.parse(res); } catch { return <div className="mt-2 text-sm text-white/80 leading-relaxed">{displayed}{typeRef.current && "|"}</div>; }
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
            {displayed + (typeRef.current ? "|" : "")}
          </ReactMarkdown>
        </div>
      );
    }

    return <div className="mt-2 text-sm text-white/80 leading-relaxed">{displayed}{typeRef.current && "|"}</div>;
  }, [message.result, message.intent, displayed]);

  const intentColor = useMemo(() => {
    switch (message.intent) {
      case 'csv_analysis': return 'bg-blue-500/20 text-blue-400';
      case 'scheduler': return 'bg-purple-500/20 text-purple-400';
      case 'summarize': return 'bg-green-500/20 text-green-400';
      default: return 'bg-white/10 text-white/60';
    }
  }, [message.intent]);

  const TraceStep = ({ label, value, active }: { label: string, value?: string, active?: boolean }) => (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-3 w-full">
        <div className={cn("w-3 h-3 rounded-full shrink-0", active ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-gray-600")} />
        <div className="flex-1 flex items-baseline justify-between min-w-0">
          <span className="text-xs text-gray-300 truncate">{label}</span>
          <span className="text-[10px] text-gray-500 ml-2 font-mono whitespace-nowrap">{value || "—"}</span>
        </div>
      </div>
      <div className="w-0.5 h-4 bg-gray-600/50 my-1 ml-[-204px]" style={{ marginLeft: "-221px" }} />
    </div>
  );

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
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</div>
        {resultView}
        {message.status === 'pending' && (
          <div className="flex gap-1 mt-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse delay-150" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-pulse delay-300" />
          </div>
        )}
        {!isUser && message.job_id && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-white/20 font-mono">ID: {message.job_id.slice(0, 8)}</div>
              {message.status === 'completed' && (
                <button 
                  onClick={() => setShowTrace(!showTrace)}
                  className="text-[10px] text-gray-400 hover:text-gray-200 underline cursor-pointer transition-colors"
                >
                  {showTrace ? "Hide trace" : "Show trace"}
                </button>
              )}
            </div>
            
            {showTrace && message.status === 'completed' && (
              <div className="mt-2 p-3 rounded-xl bg-black/30 border border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-0 flex flex-col items-start">
                  <TraceStep 
                    label="Request received" 
                    value={message.result?.timestamp ? new Date(message.result.timestamp).toLocaleTimeString() : undefined} 
                    active={!!message.result?.timestamp} 
                  />
                  <TraceStep 
                    label="Task pushed to Redis queue" 
                    value={message.result?.timestamp ? new Date(message.result.timestamp).toLocaleTimeString() : undefined} 
                    active={!!message.result?.timestamp} 
                  />
                  <TraceStep 
                    label="Worker picked up task" 
                    value={message.result?.worker_id ? `${message.result.worker_id}` : undefined} 
                    active={!!message.result?.worker_id} 
                  />
                  <TraceStep 
                    label="Intent detected" 
                    value={message.result?.intent?.toUpperCase()} 
                    active={!!message.result?.intent} 
                  />
                  <TraceStep 
                    label="Tool executed" 
                    value={message.result?.duration_ms ? `${message.result.duration_ms}ms` : undefined} 
                    active={!!message.result?.duration_ms} 
                  />
                  <div className="flex items-center gap-3 w-full">
                    <div className={cn("w-3 h-3 rounded-full shrink-0", message.result?.completed_at ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-gray-600")} />
                    <div className="flex-1 flex items-baseline justify-between min-w-0">
                      <span className="text-xs text-gray-300">Result delivered</span>
                      <span className="text-[10px] text-gray-500 ml-2 font-mono whitespace-nowrap">
                        {message.result?.completed_at ? new Date(message.result.completed_at).toLocaleTimeString() : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const AdminPanel = lazy(() => import('./AdminPanel'));

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [page, setPage] = useState<'login' | 'chat' | 'admin' | 'live'>('login');
  const [messagesMap, setMessagesMap] = useState<Map<string, Message>>(new Map());
  const [input, setInput] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);

  // Live Dashboard State
  const [healthData, setHealthData] = useState<any>(null);
  const [workerData, setWorkerData] = useState<any[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);

  const tokenRef = useRef<string | null>(sessionStorage.getItem('jwt'));
  const pollIntervals = useRef<Map<string, number>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const chatListRef = useRef<any>(null);
  const dashboardIntervals = useRef<number[]>([]);

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
    const checkHealth = async () => {
      try {
        const res = await axios.get(`${API_BASE}/health`);
        setMockMode(res.data.mock_mode);
      } catch {}
    };
    checkHealth();

    if (tokenRef.current && !user) {
      // Re-hydrate user from token if needed (simplification: assume role 'user' or decode JWT)
      setUser({ username: 'session-user', role: 'admin' }); // Example role
      setPage('chat');
    }
    return () => {
      abortControllers.current.forEach(c => c.abort());
      pollIntervals.current.forEach(i => clearInterval(i));
      dashboardIntervals.current.forEach(i => clearInterval(i));
    };
  }, []);

  // Live Dashboard Polling
  useEffect(() => {
    if (page === 'live' && user?.role === 'admin') {
      const fetchInitial = async () => {
        try {
          const res = await getApi('live-total').get('/logs?page=1&page_size=1');
          setTotalJobs(res.data.total || 0);
        } catch {}
      };
      fetchInitial();

      const pollHealth = async () => {
        try {
          const res = await getApi('live-health').get('/health');
          setHealthData(res.data);
        } catch {}
      };
      const pollWorkers = async () => {
        try {
          const res = await getApi('live-workers').get('/admin/workers');
          setWorkerData(res.data.data || []);
        } catch {}
      };

      pollHealth();
      pollWorkers();

      const hInterval = window.setInterval(pollHealth, 5000);
      const wInterval = window.setInterval(pollWorkers, 5000);
      dashboardIntervals.current = [hInterval, wInterval];

      return () => {
        dashboardIntervals.current.forEach(i => clearInterval(i));
        dashboardIntervals.current = [];
      };
    }
  }, [page, user, getApi]);

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

        // Update message map on every poll to reflect latest status/content
        setMessagesMap(prev => {
          const next = new Map(prev);
          const msg = next.get(jobId);
          if (msg) next.set(jobId, { ...msg, ...data });
          return next;
        });

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'DEAD') {
          clearInterval(intervalId);
          pollIntervals.current.delete(jobId);
          if (data.status === 'completed') setToast(`Job ${jobId.slice(0,8)} completed!`);
          
          // Reset list heights as the result might change the item size
          setTimeout(() => {
            chatListRef.current?.resetAfterIndex(0);
          }, 0);
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
        username: user?.username,
        recipient_email: recipientEmail || null
      });
      const jobId = res.data.job_id;
      setMessagesMap(prev => {
        const next = new Map(prev);
        next.set(jobId, { id: jobId, role: 'agent', content: 'Thinking...', status: 'pending' });
        return next;
      });
      setInput('');
      setRecipientEmail('');
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
      <div className="flex h-screen bg-[#0f0f1a] text-white overflow-hidden font-sans flex-col">
        {mockMode && (
          <div className="bg-yellow-400 text-yellow-900 text-center text-sm py-2 font-medium shrink-0">
            Running in demo mode — OpenAI key not set. Responses are simulated.
          </div>
        )}
        <div className="flex flex-1 overflow-hidden">
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
                {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}
              </div>
            ) : history.length > 20 ? (
              <List height={window.innerHeight - 180} itemCount={history.length} itemSize={56} width={260}>
                {HistoryRow}
              </List>
            ) : (
              <div className="overflow-y-auto h-full">
                {history.map((item, idx) => (
                  <div key={idx} style={{height: 56}} className="px-4 py-3 hover:bg-white/5 cursor-pointer truncate text-sm text-white/60 flex items-center gap-3 group" onClick={() => setInput(item.command)}>
                    <History className="w-3.5 h-3.5 opacity-30 group-hover:opacity-100" />
                    {item.command}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 border-t border-white/5 bg-white/5 space-y-2">
             {user?.role === 'admin' && (
                <>
                  <button 
                    onClick={() => setPage('live')} 
                    className={cn(
                      "w-full flex items-center gap-3 p-3 glass hover:bg-white/10 rounded-xl transition-all text-sm font-bold mb-2",
                      page === 'live' ? "text-green-400 border-green-500/50 bg-green-500/5" : "text-gray-400"
                    )}
                  >
                    <Activity className="w-4 h-4" /> Live Dashboard
                  </button>
                  <button 
                    onClick={() => setPage('admin')} 
                    className={cn(
                      "w-full flex items-center gap-3 p-3 glass hover:bg-white/10 rounded-xl transition-all text-sm font-bold mb-2",
                      page === 'admin' ? "text-blue-400 border-blue-500/50 bg-blue-500/5" : "text-gray-400"
                    )}
                  >
                    <BarChart3 className="w-4 h-4" /> Admin Console
                  </button>
                </>
              )}
              <div className="flex items-center justify-between px-2 pt-2 border-t border-white/5">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{user?.username}</span>
                <button onClick={() => { sessionStorage.clear(); window.location.reload(); }} className="text-white/20 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" /></button>
              </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col relative min-w-0">
          <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 glass shrink-0">
            <h2 className="font-bold text-lg">{page === 'live' ? 'Live System Status' : 'Chat Stream'}</h2>
            <div className="flex items-center gap-4">
               {page === 'live' && (
                 <button onClick={() => setPage('chat')} className="text-xs text-blue-400 hover:underline">Back to Chat</button>
               )}
               <div className="flex -space-x-2">
                 <div className="w-8 h-8 rounded-full border-2 border-[#0f0f1a] bg-blue-600 flex items-center justify-center text-[10px] font-bold">A</div>
               </div>
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            {page === 'live' ? (
              <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
                {/* System Status Banner */}
                {(() => {
                  const workersAlive = workerData.filter(w => w.alive).length;
                  const queueDepth = healthData?.queue_depth || 0;
                  
                  if (workersAlive === 2 && queueDepth < 10) {
                    return <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-2xl text-center font-bold tracking-widest text-sm">ALL SYSTEMS GREEN</div>;
                  } else if (workersAlive === 0) {
                    return <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-center font-bold tracking-widest text-sm">SYSTEM DOWN</div>;
                  } else {
                    return <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-4 rounded-2xl text-center font-bold tracking-widest text-sm">DEGRADED</div>;
                  }
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Worker Cards */}
                  {[0, 1].map(idx => {
                    const worker = workerData[idx];
                    return (
                      <div key={idx} className="glass p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white/40 uppercase">Worker {idx + 1}</span>
                          <div className={cn("w-2 h-2 rounded-full", worker?.alive ? "bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-red-400")} />
                        </div>
                        <div>
                          <div className="text-xl font-bold">{worker?.alive ? "Active" : "Offline"}</div>
                          <div className="text-[10px] text-white/20 font-mono mt-1 truncate">{worker?.worker_id || "N/A"}</div>
                        </div>
                        <div className="pt-4 border-t border-white/5">
                          <div className="text-[9px] uppercase text-white/40 font-bold mb-1">Last Seen</div>
                          <div className="text-xs text-white/60 font-mono">{worker?.last_seen_iso ? new Date(worker.last_seen_iso).toLocaleTimeString() : "—"}</div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Queue Depth Card */}
                  <div className="glass p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white/40 uppercase">Queue Depth</span>
                      <Zap className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{healthData?.queue_depth ?? 0}</div>
                      <div className="text-xs text-white/40 mt-1">Tasks pending</div>
                    </div>
                  </div>

                  {/* Total Jobs Card */}
                  <div className="glass p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white/40 uppercase">System Total</span>
                      <Clock className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{totalJobs}</div>
                      <div className="text-xs text-white/40 mt-1">Jobs completed</div>
                    </div>
                  </div>
                </div>

                <div className="glass p-8 rounded-[40px] border border-white/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Activity className="w-32 h-32 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" />
                    Real-time Architecture Visualization
                  </h3>
                  <p className="text-sm text-white/60 max-w-2xl leading-relaxed">
                    The AI Agent stack is built using a distributed producer-consumer architecture. 
                    The React SPA acts as the producer, pushing tasks into a Redis queue. 
                    Independent Python workers consume tasks via a blocking RPOP pattern, ensuring 
                    idempotency and high throughput. Health metrics are collected in real-time 
                    via Prometheus and Loki.
                  </p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
                <Shield className="w-24 h-24 mb-6" />
                <h3 className="text-2xl font-bold">Secure AI Environment</h3>
                <p className="max-w-xs text-center mt-2 text-sm">Drop files or type commands to begin automated workflows.</p>
              </div>
            ) : messages.length > 20 ? (
               <VariableSizeList
                ref={chatListRef}
                height={window.innerHeight - 180}
                itemCount={messages.length}
                itemSize={(i) => messages[i].result ? 240 : 80}
                width="100%"
              >
                {MessageRow}
              </VariableSizeList>
            ) : (
              <div className="overflow-y-auto h-full pb-10">
                {messages.map((m) => (
                  <MessageCard key={m.id} message={m} />
                ))}
                {loading && <SkeletonCard />}
              </div>
            )}
          </div>

          <div className="p-6 md:p-10 pt-0 shrink-0">
            <div className="max-w-4xl mx-auto glass rounded-3xl p-2 shadow-2xl relative border border-white/10 group focus-within:border-blue-500/50 transition-all">
              <div className="flex items-center gap-2 px-4 pt-2 mb-2">
                <button 
                  onClick={() => setInput("Analyze this CSV and provide the top 5 trends with insights")}
                  className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full border border-gray-600 hover:bg-gray-700 cursor-pointer transition-colors"
                >
                  Analyze CSV
                </button>
                <button 
                  onClick={() => setInput("Schedule a team standup meeting tomorrow at 10am with the engineering team")}
                  className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full border border-gray-600 hover:bg-gray-700 cursor-pointer transition-colors"
                >
                  Schedule Meeting
                </button>
                <button 
                  onClick={() => {
                    setInput("Summarize today's AI industry developments and send the report");
                    setRecipientEmail("demo@example.com");
                  }}
                  className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full border border-gray-600 hover:bg-gray-700 cursor-pointer transition-colors"
                >
                  Summarize & Send
                </button>
              </div>

              {(input.toLowerCase().includes('send') || input.toLowerCase().includes('report')) && (
                <div className="px-4 pt-2">
                  <input 
                    type="email" 
                    placeholder="Send result to email (optional)" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                    value={recipientEmail}
                    onChange={e => setRecipientEmail(e.target.value)}
                  />
                </div>
              )}
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
      </div>
    </ErrorBoundary>
  );
}
