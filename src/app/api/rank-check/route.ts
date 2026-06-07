export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getCredentials, getPendingRankCheckTasks, deleteRankCheckTask,
  countPendingRankCheckTasks, saveRankCheck, deleteStaleRankCheckTasks,
} from '@/lib/db';

// Abandon tasks that never appear in tasks_ready so the poller can't wedge.
const STALE_TASK_MS = 60 * 60 * 1000; // 60 min (Standard queue resolves in minutes)
import { matchOrganicRank, type SerpItem } from '@/app/dashboard/rank-tracker/rank-match';

interface TaskGetResponse {
  tasks?: Array<{
    status_code?: number;
    cost?: number;
    result?: Array<{ items?: SerpItem[] }>;
  }>;
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain') ?? undefined;

  const creds = await getCredentials();
  if (!creds) return NextResponse.json({ error: 'No credentials' }, { status: 401 });

  const pending = await getPendingRankCheckTasks(domain);
  if (pending.length === 0) return NextResponse.json({ pending: 0, done: 0, total: 0 });

  const auth = btoa(`${creds.login}:${creds.pass}`);
  const total = pending.length;

  // Which of our pending tasks has DataForSEO finished?
  let readyIds = new Set<string>();
  try {
    const readyRes = await fetch('https://api.dataforseo.com/v3/serp/google/organic/tasks_ready', {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (readyRes.ok) {
      const readyData = await readyRes.json() as {
        tasks?: Array<{ result?: Array<{ id: string }> }>;
      };
      readyIds = new Set((readyData?.tasks?.[0]?.result ?? []).map((r) => r.id));
    }
  } catch {
    // Transient — leave everything pending, client retries next poll.
    return NextResponse.json({ pending: total, done: 0, total });
  }

  let done = 0;
  for (const pt of pending) {
    if (!readyIds.has(pt.task_id)) continue;
    try {
      const getRes = await fetch(
        `https://api.dataforseo.com/v3/serp/google/organic/task_get/regular/${pt.task_id}`,
        { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) },
      );
      if (!getRes.ok) continue; // transient → retry next poll
      const data = await getRes.json() as TaskGetResponse;
      const task = data.tasks?.[0];
      if (!task) continue;

      if (task.status_code === 20000) {
        const items = task.result?.[0]?.items ?? [];
        const { rank, url, title } = matchOrganicRank(items, pt.domain);
        await saveRankCheck(pt.keyword_id, rank, url, title, task.cost ?? null);
        await deleteRankCheckTask(pt.task_id);
        done++;
      } else {
        // Permanent task error (and not still-processing, since it was in tasks_ready)
        // → drop it so it doesn't wedge the pending set.
        await deleteRankCheckTask(pt.task_id);
      }
    } catch {
      // Network/timeout → leave pending, retry next poll.
    }
  }

  await deleteStaleRankCheckTasks(STALE_TASK_MS);

  const remaining = await countPendingRankCheckTasks(domain);
  return NextResponse.json({ pending: remaining, done, total });
}
