export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getCredentials, getBlBulkBlHistory, saveBlBulkBl, getBlBulkBlResults, type BlBulkBlEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';

interface BulkBlItem {
  target?: string;
  rank?: number;
  backlinks?: number;
  new_backlinks?: number;
  lost_backlinks?: number;
  referring_domains?: number;
  referring_main_domains?: number;
  referring_ips?: number;
  spam_score?: number;
  broken_backlinks?: number;
}

interface SearchParams { targets?: string; history_id?: string; }

async function fetchBulkBacklinks(targets: string[], login: string, pass: string): Promise<{ items: BulkBlItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/bulk_backlinks/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ targets }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: BulkBlItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function SpamBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-slate-300">—</span>;
  const cls = score >= 60 ? 'bg-red-50 text-red-600 border-red-200' : score >= 30 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>{score}</span>;
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function BulkBacklinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = await getCredentials();
  const params = await searchParams;
  const rawTargets = params.targets?.trim() ?? '';
  const historyId = params.history_id;

  let items: BulkBlItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlBulkBlEntry | null = null;

  if (historyId) {
    const saved = await getBlBulkBlResults<BulkBlItem>(historyId);
    if (saved) { items = saved; activeEntry = (await getBlBulkBlHistory()).find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTargets) {
    const targetList = rawTargets.split('\n').map((t) => t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean).slice(0, 1000);
    if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchBulkBacklinks(targetList, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlBulkBlEntry = { id: crypto.randomUUID().slice(0, 8), ts: Date.now(), targets: targetList.join(', '), count: items.length, cost };
        await saveBlBulkBl(entry, items);
      }
    }
  }

  const history = await getBlBulkBlHistory();
  const sorted = [...items].sort((a, b) => (b.backlinks ?? 0) - (a.backlinks ?? 0));
  const maxBl = Math.max(...sorted.map((i) => i.backlinks ?? 0), 1);

  const csvData = sorted.map((item) => ({
    target: item.target ?? '',
    backlinks: item.backlinks ?? '',
    new_backlinks: item.new_backlinks ?? '',
    lost_backlinks: item.lost_backlinks ?? '',
    referring_domains: item.referring_domains ?? '',
    referring_main_domains: item.referring_main_domains ?? '',
    referring_ips: item.referring_ips ?? '',
    spam_score: item.spam_score ?? '',
    broken_backlinks: item.broken_backlinks ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <Link href="/dashboard/backlinks" className="hover:text-slate-600 transition-colors">Backlinks</Link>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Bulk Backlinks</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Bulk Backlinks</h1>
        <p className="text-sm text-slate-400 mt-1">Backlink summary for a list of domains in a single request.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Fetch" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domains <span className="normal-case font-normal tracking-normal text-slate-300">(one per line)</span></label>
          <textarea name="targets" rows={6} defaultValue={activeEntry?.targets?.split(', ').join('\n') ?? rawTargets} placeholder={"example.com\ncompetitor.com\nanother.fr"} required
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y bg-white dark:bg-slate-800" />
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawTargets) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{sorted.length} domains</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {sorted.length > 0 && <ExportCSVButton data={csvData} filename="bulk-backlinks.csv" columns={[{key:'target',label:'Domain'},{key:'backlinks',label:'Backlinks'},{key:'new_backlinks',label:'New'},{key:'lost_backlinks',label:'Lost'},{key:'referring_domains',label:'Ref. Domains'},{key:'referring_main_domains',label:'Main RD'},{key:'referring_ips',label:'Ref. IPs'},{key:'spam_score',label:'Spam'},{key:'broken_backlinks',label:'Broken'}]} />}
            </div>
          </div>
          {sorted.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Domain</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Backlinks</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 text-emerald-600 hidden sm:table-cell">+New</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 text-red-500 hidden sm:table-cell">−Lost</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Ref. Domains</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">Ref. IPs</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">Spam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {sorted.map((item, i) => {
                    const share = Math.round(((item.backlinks ?? 0) / maxBl) * 100);
                    return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-200 font-medium">{item.target ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmt(item.backlinks)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600 tabular-nums hidden sm:table-cell text-xs">{item.new_backlinks ? `+${fmt(item.new_backlinks)}` : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-red-500 tabular-nums hidden sm:table-cell text-xs">{item.lost_backlinks ? `-${fmt(item.lost_backlinks)}` : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">{fmt(item.referring_domains)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">{fmt(item.referring_ips)}</td>
                        <td className="px-4 py-3 text-center hidden lg:table-cell"><SpamBadge score={item.spam_score} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <Link key={entry.id} href={`/dashboard/backlinks/bulk-backlinks?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.targets}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} domains{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
