'use client';

import { useState, lazy, Suspense } from 'react';
import { LANGUAGES } from '@/lib/geo-options';

const MapPicker = lazy(() => import('./MapPicker'));

type QueueMode = 'live' | 'priority' | 'standard';

const QUEUE_MODES: { value: QueueMode; label: string; price: string; costPerCall: number; wait: string }[] = [
  { value: 'live',     label: 'Live',     price: '$0.002',  costPerCall: 0.002,  wait: '~6 sec' },
  { value: 'priority', label: 'Priority', price: '$0.0012', costPerCall: 0.0012, wait: '~1 min' },
  { value: 'standard', label: 'Standard', price: '$0.0006', costPerCall: 0.0006, wait: '5–45 min' },
];

interface Props {
  defaults: {
    keyword: string;
    location: string;
    locationCoordinate: string;
    defaultCenter: string;
    language: string;
    device: string;
    os: string;
    depth: string;
    minRating: string;
    timeFilter: string;
    gridMode: boolean;
    forceGridMode?: boolean;
    gridSize: string;
    spacingKm: string;
    gridTarget: string;
    queueMode: string;
  };
}

const GRID_SIZES = [
  { value: '3',  label: '3×3 — 9 pts' },
  { value: '5',  label: '5×5 — 25 pts' },
  { value: '7',  label: '7×7 — 49 pts' },
  { value: '9',  label: '9×9 — 81 pts' },
  { value: '11', label: '11×11 — 121 pts' },
];

const SPACINGS = [
  { value: '0.1',  label: '100 m' },
  { value: '0.2',  label: '200 m' },
  { value: '0.3',  label: '300 m' },
  { value: '0.5',  label: '500 m' },
  { value: '0.75', label: '750 m' },
  { value: '1',    label: '1 km' },
  { value: '1.5',  label: '1.5 km' },
  { value: '2',    label: '2 km' },
  { value: '3',    label: '3 km' },
  { value: '5',    label: '5 km' },
];

export default function LocalFinderForm({ defaults }: Props) {
  const [device, setDevice] = useState(defaults.device || 'desktop');
  const [coordinate, setCoordinate] = useState(defaults.locationCoordinate || defaults.defaultCenter);
  const [gridMode, setGridMode] = useState(defaults.gridMode || defaults.forceGridMode || false);
  const forceGrid = defaults.forceGridMode ?? false;
  const [gridSize, setGridSize] = useState(defaults.gridSize || '5');
  const [spacingKm, setSpacingKm] = useState(defaults.spacingKm || '1');
  const [queueMode, setQueueMode] = useState<QueueMode>((defaults.queueMode as QueueMode) || 'live');
  const [isLoading, setIsLoading] = useState(false);

  const osOptions =
    device === 'mobile'
      ? [{ value: 'android', label: 'Android' }, { value: 'ios', label: 'iOS' }]
      : [{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }];

  const defaultOs = osOptions.some((o) => o.value === defaults.os) ? defaults.os : osOptions[0].value;
  const callCount = parseInt(gridSize) ** 2;
  const selectedMode = QUEUE_MODES.find((m) => m.value === queueMode) ?? QUEUE_MODES[0];
  const estimatedCost = (callCount * selectedMode.costPerCall).toFixed(queueMode === 'live' ? 3 : 4);
  const showGridControls = (gridMode || forceGrid) && !!coordinate;

  return (
    <form method="GET" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" onSubmit={() => setIsLoading(true)}>
      <input type="hidden" name="mode" value={gridMode ? 'grid' : 'normal'} />
      <input type="hidden" name="queue_mode" value={queueMode} />

      {/* Keyword */}
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
          Keyword <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          name="keyword"
          defaultValue={defaults.keyword}
          placeholder="e.g. plumber, italian restaurant, dentist…"
          required
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
      </div>

      {/* Language */}
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
          Language <span className="text-red-400">*</span>
        </label>
        <select
          name="language"
          defaultValue={defaults.language || 'English'}
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Map + Grid Size / Spacing */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400">
            Location (map) <span className="text-red-400">*</span>
          </label>
          {coordinate && (
            <button
              type="button"
              onClick={() => { setCoordinate(''); if (!forceGrid) setGridMode(false); }}
              className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-2">
          <Suspense fallback={<div className="h-64 rounded-xl bg-slate-100 animate-pulse" />}>
            <MapPicker
              coordinate={coordinate}
              onChange={setCoordinate}
              showGrid={showGridControls}
              gridSize={parseInt(gridSize, 10)}
              spacingKm={parseFloat(spacingKm)}
            />
          </Suspense>
          <input
            type="text"
            name="location_coordinate"
            value={coordinate}
            onChange={(e) => setCoordinate(e.target.value)}
            placeholder="Click on the map to set a point — or type lat,lng"
            className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Grid size + spacing — directly below the map */}
          {showGridControls && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Grid size</label>
                <select
                  name="grid_size"
                  value={gridSize}
                  onChange={(e) => setGridSize(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {GRID_SIZES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Point spacing</label>
                <select
                  name="spacing_km"
                  value={spacingKm}
                  onChange={(e) => setSpacingKm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {SPACINGS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {coordinate && !showGridControls && (
            <p className="text-[11px] text-blue-600">
              Coordinates active — search will be centered on this point.
            </p>
          )}
        </div>
      </div>

      {/* Grid Search toggle + options */}
      {coordinate && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {!forceGrid && (
            <button
              type="button"
              onClick={() => setGridMode((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${gridMode ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                  {gridMode && <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-white"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Grid Search</span>
                <span className="text-[10px] text-slate-400 font-normal normal-case tracking-normal">— Local visibility analysis across a grid of points</span>
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${gridMode ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {(gridMode || forceGrid) && (
            <div className="px-4 pb-4 pt-3 bg-slate-50/50 space-y-4 border-t border-slate-100">
              {/* Target business */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Target business <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="grid_target"
                  defaultValue={defaults.gridTarget}
                  placeholder="e.g. Best Plumbing or bestplumbing.com"
                  required={gridMode}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">Name or domain — partial match, case-insensitive.</p>
              </div>

              {/* API Mode */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-2">API Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {QUEUE_MODES.map((mode) => {
                    const active = queueMode === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setQueueMode(mode.value)}
                        className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className={`text-xs font-black ${active ? 'text-blue-700' : 'text-slate-700'}`}>{mode.label}</span>
                        <span className={`text-[10px] font-mono ${active ? 'text-blue-500' : 'text-slate-400'}`}>{mode.price}/call</span>
                        <span className="text-[10px] text-slate-400">{mode.wait}</span>
                      </button>
                    );
                  })}
                </div>
                {queueMode !== 'live' && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {queueMode === 'priority'
                      ? 'Tasks are queued and processed server-side. The page will auto-refresh every 10 seconds until results are ready.'
                      : 'Tasks are queued for background processing. The page will check every 30 seconds — or you can come back later.'}
                  </p>
                )}
              </div>

              {/* Cost estimate */}
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-[11px] text-amber-700">
                  <span className="font-black">{callCount} API calls</span> ({gridSize}×{gridSize} points) — estimated cost: <span className="font-black">${estimatedCost}</span> at {selectedMode.price}/call.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Device + OS + Depth — hidden in grid mode */}
      {!gridMode && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Device</label>
              <select
                name="device"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">OS</label>
              <select
                name="os"
                defaultValue={defaultOs}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {osOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Depth</label>
              <select
                name="depth"
                defaultValue={defaults.depth || '20'}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Minimum rating</label>
              <select
                name="min_rating"
                defaultValue={defaults.minRating || ''}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">No filter</option>
                <option value="3.5">3.5+</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Hours filter</label>
              <select
                name="time_filter"
                defaultValue={defaults.timeFilter || ''}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">None</option>
                <option value="open_now">Open now</option>
                <option value="24_hours">Open 24/7</option>
              </select>
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {gridMode ? `Analyzing ${callCount} points…` : 'Searching…'}
          </span>
        ) : (
          gridMode ? `Run Grid Search (${callCount} points)` : 'Search'
        )}
      </button>
    </form>
  );
}
