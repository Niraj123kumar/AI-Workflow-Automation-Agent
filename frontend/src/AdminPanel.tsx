import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X, Activity, HardDrive, Cpu, Clock } from 'lucide-react';

export default function AdminPanel({ onClose, getApi }: { onClose: () => void, getApi: (id: string) => any }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const fetchJobs = async () => {
      try {
        const res = await getApi('admin-jobs').get('/admin/jobs', { signal: controller.signal });
        setJobs(Array.isArray(res.data.data) ? res.data.data : []);
      } catch (err) {
        if (!axios.isCancel(err)) console.error('Failed to fetch admin jobs', err);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
    return () => controller.abort();
  }, [getApi]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-5xl h-[80vh] glass rounded-3xl flex flex-col overflow-hidden shadow-2xl border border-white/10">
        <header className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold">Admin Dashboard</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="glass-dark p-4 rounded-2xl border border-white/5">
              <div className="flex items-center gap-2 text-white/40 mb-2">
                <Cpu className="w-4 h-4" /> <span className="text-xs font-bold uppercase">Total Jobs</span>
              </div>
              <div className="text-2xl font-bold">{jobs.length}</div>
            </div>
            {/* Add more metric cards here as needed */}
          </div>

          <div className="glass-dark rounded-2xl overflow-hidden border border-white/5">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5">
                  <th className="p-4 text-xs font-bold text-white/40 uppercase">Job ID</th>
                  <th className="p-4 text-xs font-bold text-white/40 uppercase">User</th>
                  <th className="p-4 text-xs font-bold text-white/40 uppercase">Intent</th>
                  <th className="p-4 text-xs font-bold text-white/40 uppercase">Status</th>
                  <th className="p-4 text-xs font-bold text-white/40 uppercase">Worker</th>
                  <th className="p-4 text-xs font-bold text-white/40 uppercase text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="p-4"><div className="h-4 bg-white/5 rounded w-full" /></td>
                    </tr>
                  ))
                ) : (
                  jobs.map((job) => (
                    <tr key={job.trace_id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 text-xs font-mono text-white/40">{job.trace_id.slice(0, 8)}...</td>
                      <td className="p-4 text-sm">{job.username}</td>
                      <td className="p-4">
                        <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase">
                          {job.intent || 'pending'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`flex items-center gap-1.5 text-sm ${job.status === 'completed' ? 'text-green-500' : 'text-red-500'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${job.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`} />
                          {job.status}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-white/40">{job.worker_id || '-'}</td>
                      <td className="p-4 text-sm text-right font-mono text-white/40">{job.duration_ms}ms</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
