export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  getCredentials, getSetting, getGridHistory, getGridEntry, saveGridSearch,
  saveGridSearchPending, getGridResults, type GridSearchEntry, type GridPoint, type GridQueueMode,
} from '@/lib/db';
import LocalFinderForm from '../local-finder/LocalFinderForm';
import GridResults from '../local-finder/GridResults';
import GridPending from '../local-finder/GridPending';
import { fetchGridSearch, postGridTasksQueue, stableGridId } from '../local-finder/grid-api';

interface SearchParams {
  keyword?: string;
  location_coordinate?: string;
  language?: string;
  grid_size?: string;
  spacing_km?: string;
  grid_target?: string;
  grid_history_id?: string;
  queue_mode?: string;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function gridRerunUrl(entry: { keyword: string; center: string; grid_size: number; spacing_km: number; target: string; language: string; queue_mode: string }, basePath = '/dashboard/geo-grid') {
  const p = new URLSearchParams({
    keyword: entry.keyword,
    location_coordinate: entry.center,
    grid_size: String(entry.grid_size),
    spacing_km: String(entry.spacing_km),
    grid_target: entry.target,
    language: entry.language,
    queue_mode: entry.queue_mode,
    mode: 'grid',
  });
  return `${basePath}?${p.toString()}`;
}

export default async function GeoGridPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = await getCredentials();
  const params = await searchParams;
  const gridHistoryId = params.grid_history_id;

  const defaultLanguage = await getSetting('default_language') ?? 'English';
  const defaultCoordinates = await getSetting('default_coordinates') ?? '';

  let gridResults: GridPoint[] | null = null;
  let gridEntry: GridSearchEntry | null = null;
  let gridPending: { id: string; totalPoints: number; queueMode: GridQueueMode } | null = null;
  let gridError: string | null = null;
  let gridCost: number | undefined;

  // Load from history
  if (gridHistoryId) {
    const entry = await getGridEntry(gridHistoryId);
    if (!entry) {
      gridError = 'Search not found.';
    } else if (entry.status === 'pending') {
      gridEntry = entry;
      gridPending = { id: entry.id, totalPoints: entry.grid_size ** 2, queueMode: entry.queue_mode };
    } else {
      gridResults = await getGridResults(gridHistoryId);
      gridEntry = entry;
    }
  }

  // Fresh grid search
  if (!gridHistoryId && params.keyword?.trim() && params.location_coordinate && params.grid_target) {
    if (!creds) {
      gridError = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const gridSize = Math.min(Math.max(parseInt(params.grid_size ?? '5', 10), 3), 11);
      const spacingKm = parseFloat(params.spacing_km ?? '1');
      const queueMode = (params.queue_mode ?? 'live') as GridQueueMode;

      const id = stableGridId(
        params.keyword, params.location_coordinate, gridSize, spacingKm, params.grid_target, queueMode,
      );

      const alreadySaved = await getGridEntry(id);
      if (alreadySaved) {
        gridEntry = alreadySaved;
        if (alreadySaved.status === 'pending') {
          gridPending = { id, totalPoints: gridSize ** 2, queueMode };
        } else {
          gridResults = await getGridResults(id);
          gridCost = alreadySaved.cost;
        }
      } else {
        const baseEntry: GridSearchEntry = {
          id, ts: Date.now(),
          keyword: params.keyword,
          target: params.grid_target,
          center: params.location_coordinate,
          grid_size: gridSize,
          spacing_km: spacingKm,
          language: params.language ?? defaultLanguage,
          status: 'done',
          queue_mode: queueMode,
        };

        if (queueMode === 'live') {
          const result = await fetchGridSearch(
            params.keyword, params.location_coordinate,
            gridSize, spacingKm, params.language ?? defaultLanguage,
            params.grid_target, creds.login, creds.pass,
          );
          if (result.error) {
            gridError = result.error;
          } else {
            gridResults = result.results;
            gridCost = result.cost;
            gridEntry = { ...baseEntry, cost: result.cost };
            await saveGridSearch(gridEntry, result.results);
          }
        } else {
          const result = await postGridTasksQueue(
            params.keyword, params.location_coordinate,
            gridSize, spacingKm, params.language ?? defaultLanguage,
            creds.login, creds.pass,
          );
          if (result.error) {
            gridError = result.error;
          } else {
            gridEntry = { ...baseEntry, status: 'pending', cost: result.cost };
            await saveGridSearchPending(gridEntry, result.taskPoints);
            gridPending = { id, totalPoints: gridSize ** 2, queueMode };
          }
        }
      }
    }
  }

  const gridHistory = await getGridHistory();

  const formDefaults = {
    keyword: (params.keyword ?? '').toString(),
    location: '',
    locationCoordinate: (params.location_coordinate ?? '').toString(),
    defaultCenter: defaultCoordinates,
    language: (params.language ?? defaultLanguage).toString(),
    device: 'desktop',
    os: 'windows',
    depth: '20',
    minRating: '',
    timeFilter: '',
    gridMode: true,
    forceGridMode: true,
    gridSize: (params.grid_size ?? '5').toString(),
    spacingKm: (params.spacing_km ?? '1').toString(),
    gridTarget: (params.grid_target ?? '').toString(),
    queueMode: (params.queue_mode ?? 'live').toString(),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Geo-Grid Ranking</h1>
        <p className="text-sm text-slate-400 mt-1">Visualize your local ranking across a geographic grid of points.</p>
      </div>

      <LocalFinderForm defaults={formDefaults} />

      <div id="results">
        {gridError && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{gridError}</div>
        )}
        {gridPending && gridEntry && (
          <GridPending
            searchId={gridPending.id}
            totalPoints={gridPending.totalPoints}
            queueMode={gridPending.queueMode}
            keyword={gridEntry.keyword}
            target={gridEntry.target}
            gridSize={gridEntry.grid_size}
          />
        )}
        {gridResults && gridEntry && (
          <GridResults
            results={gridResults}
            gridSize={gridEntry.grid_size}
            keyword={gridEntry.keyword}
            target={gridEntry.target}
            cost={gridCost ?? gridEntry.cost}
          />
        )}
      </div>

      {gridHistory.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Grid Search History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {gridHistory.map((entry) => {
              const isActive = entry.id === gridHistoryId;
              const isPending = entry.status === 'pending';
              return (
                <div key={entry.id} className={`flex items-center gap-2 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <Link href={`/dashboard/geo-grid?grid_history_id=${entry.id}#results`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800 dark:text-slate-200'}`}>
                        {entry.keyword}
                      </p>
                      <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">{entry.grid_size}×{entry.grid_size}</span>
                      {isPending && (
                        <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">Pending</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      Target: {entry.target} · {entry.spacing_km} km
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                    <Link
                      href={gridRerunUrl(entry)}
                      className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-800 transition-colors"
                      title="Run this search again"
                    >
                      Re-run ↻
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
