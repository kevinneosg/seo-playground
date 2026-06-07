export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getCredentials, getSetting, getBlRefNetHistory, saveBlRefNet, getBlRefNetResults, type BlRefNetEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';

interface NetworkItem {
  network_address?: string;
  ip_count?: number;
  referring_domains?: number;
  backlinks?: number;
  rank?: number;
}

interface SearchParams { target?: string; history_id?: string; }

async function fetchNetworks(target: string, login: string, pass: string): Promise<{ items: NetworkItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/referring_networks/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target, limit: 1000, order_by: ['referring_domains,desc'] }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: NetworkItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function ReferringNetworksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = await getCredentials();
  const params = await searchParams;
  const defaultDomain = await getSetting('default_domain') ?? '';
  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const historyId = params.history_id;

  let items: NetworkItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlRefNetEntry | null = null;

  if (historyId) {
    const saved = await getBlRefNetResults<NetworkItem>(historyId);
    if (saved) { items = saved; activeEntry = (await getBlRefNetHistory()).find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget) {
    if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchNetworks(rawTarget, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlRefNetEntry = { id: crypto.randomUUID().slice(0, 8), ts: Date.now(), target: rawTarget, count: items.length, cost };
        await saveBlRefNet(entry, items);
      }
    }
  }

  const history = await getBlRefNetHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;
  const maxDomains = Math.max(...items.map((i) => i.referring_domains ?? 0), 1);

  const csvData = items.map((item) => ({
    network: item.network_address ?? '',
    ip_count: item.ip_count ?? '',
    referring_domains: item.referring_domains ?? '',
    backlinks: item.backlinks ?? '',
    rank: item.rank ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <Link href="/dashboard/backlinks" className="hover:text-slate-600 transition-colors">Backlinks</Link>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Referring Networks</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Referring Networks</h1>
        <p className="text-sm text-slate-400 mt-1">IP subnets and networks sending backlinks to a domain.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domain</label>
          <input type="text" name="target" defaultValue={displayTarget || defaultDomain} placeholder="example.com" required
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawTarget) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} networks — {displayTarget}</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && <ExportCSVButton data={csvData} filename={`referring-networks-${displayTarget}.csv`} columns={[{key:'network',label:'Network'},{key:'ip_count',label:'IPs'},{key:'referring_domains',label:'Ref. Domains'},{key:'backlinks',label:'Backlinks'},{key:'rank',label:'Rank'}]} />}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No networks found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Network</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Ref. domains</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">IPs</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:table-cell">Backlinks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {items.map((item, i) => {
                    const share = Math.round(((item.referring_domains ?? 0) / maxDomains) * 100);
                    return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-3 text-[11px] font-mono text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-800 dark:text-slate-200">{item.network_address ?? '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">{fmt(item.referring_domains)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{fmt(item.ip_count)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">{fmt(item.backlinks)}</td>
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
                <Link key={entry.id} href={`/dashboard/backlinks/referring-networks?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} networks{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
