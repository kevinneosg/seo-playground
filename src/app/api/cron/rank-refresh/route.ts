export const dynamic = 'force-dynamic';
// Sequential live/advanced chunks for ~20 keywords can run past a minute.
export const maxDuration = 300;

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getCredentials, getTrackedKeywords, getLatestRankCheck,
  getSetting, saveRankCheck,
} from '@/lib/db';
import { matchOrganicRank, locationParam, type SerpItem } from '@/app/dashboard/rank-tracker/rank-match';

// Live/advanced returns one task per keyword in request order.
interface SerpResponse {
  tasks?: Array<{
    status_code?: number;
    cost?: number;
    result?: Array<{ items?: SerpItem[] }>;
  }>;
}

// One row per tracked keyword. `position` is this run's organic rank (or the
// prior value if the refresh call failed); `previous` is the rank stored
// before this run — the caller diffs the two for week-over-week movement.
interface RankRow {
  keyword: string;
  domain: string;
  location: string;
  position: number | null;
  previous: number | null;
}

// Small batches keep each live/advanced request well under the 60s timeout
// and gentle on the DataForSEO rate limit; the job is weekly so wall-clock
// (~2 min for ~20 keywords) is irrelevant.
const CHUNK = 5;
const CHUNK_TIMEOUT_MS = 60_000;

function unauthorized(reason: string) {
  return NextResponse.json({ ok: false, error: reason }, { status: 401 });
}

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (!secretMatches(req.headers.get('x-cron-secret'), expected)) {
    return unauthorized('Invalid cron secret');
  }

  const creds = await getCredentials();
  if (!creds) {
    return NextResponse.json({ ok: false, error: 'No DataForSEO credentials' }, { status: 503 });
  }

  const keywords = await getTrackedKeywords();
  if (keywords.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, refreshed: 0, costTotal: 0, summary: [] });
  }

  // Snapshot prior ranks BEFORE saving new ones so deltas reflect last run.
  const previous = new Map<number, number | null>();
  for (const kw of keywords) {
    const last = await getLatestRankCheck(kw.id);
    previous.set(kw.id, last?.position ?? null);
  }

  const depth = parseInt(await getSetting('rank_tracker_depth') ?? '100', 10);
  const auth = btoa(`${creds.login}:${creds.pass}`);

  const summary: RankRow[] = [];
  let refreshed = 0;
  let costTotal = 0;

  for (let offset = 0; offset < keywords.length; offset += CHUNK) {
    const batch = keywords.slice(offset, offset + CHUNK);

    const prevRow = (kw: (typeof batch)[number]): RankRow => ({
      keyword: kw.keyword,
      domain: kw.domain,
      location: kw.location,
      position: previous.get(kw.id) ?? null,
      previous: previous.get(kw.id) ?? null,
    });

    let res: Response;
    try {
      res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          batch.map((kw) => ({
            keyword: kw.keyword,
            ...locationParam(kw.location),
            language_name: kw.language,
            depth,
          })),
        ),
        signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS),
      });
    } catch (e) {
      console.error('[cron-rank-refresh] chunk fetch failed:', (e as Error)?.message);
      for (const kw of batch) summary.push(prevRow(kw));
      continue;
    }
    if (!res.ok) {
      console.warn('[cron-rank-refresh] chunk non-OK:', res.status, res.statusText);
      for (const kw of batch) summary.push(prevRow(kw));
      continue;
    }

    const data = await res.json() as SerpResponse;
    for (let i = 0; i < batch.length; i++) {
      const kw = batch[i];
      const task = data.tasks?.[i];
      if (task?.status_code !== 20000) {
        summary.push(prevRow(kw));
        continue;
      }
      const items = task.result?.[0]?.items ?? [];
      const cost = task.cost ?? null;
      const { rank, url, title } = matchOrganicRank(items, kw.domain);
      await saveRankCheck(kw.id, rank, url, title, cost);
      refreshed++;
      if (cost) costTotal += cost;
      summary.push({
        keyword: kw.keyword,
        domain: kw.domain,
        location: kw.location,
        position: rank,
        previous: previous.get(kw.id) ?? null,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: keywords.length,
    refreshed,
    costTotal: Number(costTotal.toFixed(4)),
    summary,
  });
}
