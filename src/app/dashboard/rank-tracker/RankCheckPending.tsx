'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api-base';

interface Props {
  domain?: string;
  total: number;
}

const POLL_INTERVAL = 20_000;

export default function RankCheckPending({ domain, total }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(total);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);

  const checkStatus = useCallback(async () => {
    if (checking || doneRef.current) return;
    setChecking(true);
    setError(null);
    try {
      const url = apiUrl('/api/rank-check' + (domain ? '?domain=' + encodeURIComponent(domain) : ''));
      const res = await fetch(url);
      const data = await res.json() as { pending?: number; done?: number; total?: number; error?: string };
      setLastChecked(new Date());
      if (data.error) {
        setError(data.error);
        return;
      }
      setPending(data.pending ?? 0);
      if ((data.done ?? 0) > 0 || (data.pending ?? 0) === 0) {
        if ((data.pending ?? 0) === 0) doneRef.current = true;
        router.refresh();
      }
    } catch {
      setError('Network error — will retry.');
    } finally {
      setChecking(false);
    }
  }, [domain, checking, router]);

  useEffect(() => {
    checkStatus();
    const timer = setInterval(checkStatus, POLL_INTERVAL);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <svg className="animate-spin w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-bold text-slate-700">
            Checking rankings… <span className="tabular-nums text-slate-500">{pending} left</span>
          </span>
        </div>
        <button
          onClick={checkStatus}
          disabled={checking}
          className="text-[11px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 disabled:opacity-40 transition-colors"
        >
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>
      <div className="px-6 pb-4 -mt-1">
        <p className="text-[11px] text-slate-400">
          {error ? (
            <span className="text-red-500">{error}</span>
          ) : lastChecked ? (
            <>Standard queue — results typically in a few minutes · auto-refreshes every {POLL_INTERVAL / 1000}s</>
          ) : (
            <>Connecting to DataForSEO…</>
          )}
        </p>
      </div>
    </div>
  );
}
