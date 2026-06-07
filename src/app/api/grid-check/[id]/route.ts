export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCredentials, getGridEntry, completeGridSearch } from '@/lib/db';
import type { GridPoint, GridLocalItem, GridTaskPoint } from '@/lib/db';

interface DFSTaskGetResponse {
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{
      items?: Array<{
        type: string;
        rank_group: number;
        title?: string;
        domain?: string;
        url?: string;
        cid?: string;
        rating?: { value?: number; votes_count?: number };
      }>;
    }>;
  }>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const entry = await getGridEntry(id);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (entry.status === 'done') {
    return NextResponse.json({ status: 'done', ready: entry.grid_size ** 2, total: entry.grid_size ** 2 });
  }
  if (!entry.task_ids?.length) {
    return NextResponse.json({ status: 'error', error: 'No task IDs stored' }, { status: 400 });
  }

  const creds = await getCredentials();
  if (!creds) {
    return NextResponse.json({ error: 'No credentials' }, { status: 401 });
  }

  const auth = btoa(`${creds.login}:${creds.pass}`);
  const taskPoints = entry.task_ids;
  const total = taskPoints.length;
  const targetLower = entry.target.toLowerCase();

  // DataForSEO status codes that mean "task is still in the queue / being processed".
  // Any other non-20000 code is a permanent failure → treat as done with empty results
  // so the grid never gets stuck in an infinite pending loop.
  const STILL_PROCESSING = new Set([40602, 40601]);

  // Check each task in parallel
  const checks = await Promise.all(
    taskPoints.map(async (tp: GridTaskPoint) => {
      try {
        const res = await fetch(
          `https://api.dataforseo.com/v3/serp/google/local_finder/task_get/advanced/${tp.task_id}`,
          { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) },
        );
        if (!res.ok) return { tp, ready: false, items: [], cost: 0 };
        const data = await res.json() as DFSTaskGetResponse;
        const task = data.tasks?.[0];
        // Still in queue → not ready yet
        if (!task || STILL_PROCESSING.has(task.status_code ?? 0)) return { tp, ready: false, items: [], cost: 0 };
        // Success or permanent error → mark as done (empty items for errors)
        const rawItems = task.status_code === 20000
          ? (task.result?.[0]?.items ?? []).filter((i) => i.type === 'local_pack')
          : [];
        return { tp, ready: true, items: rawItems, cost: task.cost ?? 0 };
      } catch {
        // Network timeout or fetch error → not ready, will retry next poll
        return { tp, ready: false, items: [], cost: 0 };
      }
    }),
  );

  const readyCount = checks.filter((c) => c.ready).length;

  if (readyCount < total) {
    return NextResponse.json({ status: 'pending', ready: readyCount, total });
  }

  // All done — build GridPoints
  const isTarget = (title: string, domain: string, url: string) =>
    title.toLowerCase().includes(targetLower) ||
    domain.toLowerCase().includes(targetLower) ||
    url.toLowerCase().includes(targetLower);

  let totalCost = 0;
  const results: GridPoint[] = checks.map(({ tp, items, cost }) => {
    totalCost += cost;
    const match = items.find((item) =>
      isTarget(item.title ?? '', item.domain ?? '', item.url ?? ''),
    );
    const gridItems: GridLocalItem[] = items.slice(0, 20).map((item) => ({
      rank_group: item.rank_group,
      title: item.title ?? '—',
      domain: item.domain,
      url: item.url,
      cid: item.cid,
      rating_value: item.rating?.value,
      rating_votes: item.rating?.votes_count,
      is_target: isTarget(item.title ?? '', item.domain ?? '', item.url ?? ''),
    }));
    return { row: tp.row, col: tp.col, lat: tp.lat, lng: tp.lng, rank: match ? match.rank_group : null, items: gridItems };
  });

  await completeGridSearch(id, results, totalCost);

  return NextResponse.json({ status: 'done', ready: total, total, cost: totalCost });
}
