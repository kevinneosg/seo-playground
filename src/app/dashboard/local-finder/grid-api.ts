import type { GridPoint, GridLocalItem, GridTaskPoint } from '@/lib/db';

export interface LocalPackItem {
  type: string;
  rank_group: number;
  rank_absolute: number;
  title?: string;
  description?: string;
  domain?: string;
  url?: string;
  phone?: string;
  booking_url?: string;
  is_paid?: boolean;
  rating?: { value?: number; votes_count?: number; rating_max?: number };
  cid?: string;
}

export function generateGridCoords(
  centerLat: number, centerLng: number, gridSize: number, spacingKm: number,
) {
  const latDeg = spacingKm / 111.32;
  const lngDeg = spacingKm / (111.32 * Math.cos(centerLat * Math.PI / 180));
  const half = Math.floor(gridSize / 2);
  const coords: { row: number; col: number; lat: number; lng: number }[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      coords.push({
        row, col,
        lat: centerLat + (half - row) * latDeg,
        lng: centerLng + (col - half) * lngDeg,
      });
    }
  }
  return coords;
}

export async function fetchOneGridPoint(
  keyword: string, lat: number, lng: number, language: string, auth: string,
): Promise<{ items: LocalPackItem[]; cost: number }> {
  let res: Response;
  try {
    res = await fetch('https://api.dataforseo.com/v3/serp/google/local_finder/live/advanced', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        keyword,
        location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)}`,
        language_name: language,
        depth: 20,
      }]),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { items: [], cost: 0 };
  }
  if (!res.ok) return { items: [], cost: 0 };
  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; cost?: number; result?: Array<{ items?: LocalPackItem[] }> }>;
  };
  const task = data?.tasks?.[0];
  if (!task || task.status_code !== 20000) return { items: [], cost: 0 };
  const items = (task.result?.[0]?.items ?? []).filter((i) => i.type === 'local_pack');
  return { items, cost: task.cost ?? 0 };
}

export async function fetchGridSearch(
  keyword: string, center: string, gridSize: number, spacingKm: number,
  language: string, target: string, login: string, pass: string,
): Promise<{ results: GridPoint[]; cost: number; error?: string }> {
  const parts = center.split(',').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return { results: [], cost: 0, error: 'Invalid coordinates.' };
  }
  const [centerLat, centerLng] = parts;
  const coords = generateGridCoords(centerLat, centerLng, gridSize, spacingKm);
  const auth = btoa(`${login}:${pass}`);
  const targetLower = target.toLowerCase();

  const pointResults = await Promise.all(
    coords.map(async ({ row, col, lat, lng }) => {
      const { items: rawItems, cost } = await fetchOneGridPoint(keyword, lat, lng, language, auth);

      const isTarget = (item: LocalPackItem) =>
        (item.title ?? '').toLowerCase().includes(targetLower) ||
        (item.domain ?? '').toLowerCase().includes(targetLower) ||
        (item.url ?? '').toLowerCase().includes(targetLower);

      const match = rawItems.find(isTarget);
      const items: GridLocalItem[] = rawItems.slice(0, 20).map((item) => ({
        rank_group: item.rank_group,
        title: item.title ?? '—',
        domain: item.domain,
        url: item.url,
        cid: item.cid,
        rating_value: item.rating?.value,
        rating_votes: item.rating?.votes_count,
        is_target: isTarget(item),
      }));

      return { point: { row, col, lat, lng, rank: match ? match.rank_group : null, items }, cost };
    })
  );

  const results = pointResults.map((r) => r.point);
  const totalCost = pointResults.reduce((s, r) => s + r.cost, 0);
  return { results, cost: totalCost };
}

export async function postGridTasksQueue(
  keyword: string, center: string, gridSize: number, spacingKm: number,
  language: string, login: string, pass: string,
): Promise<{ taskPoints: GridTaskPoint[]; cost: number; error?: string }> {
  const parts = center.split(',').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return { taskPoints: [], cost: 0, error: 'Invalid coordinates.' };
  }
  const [centerLat, centerLng] = parts;
  const coords = generateGridCoords(centerLat, centerLng, gridSize, spacingKm);
  const auth = btoa(`${login}:${pass}`);

  const CHUNK = 100;
  const allTaskPoints: GridTaskPoint[] = [];
  let totalCost = 0;

  for (let i = 0; i < coords.length; i += CHUNK) {
    const chunk = coords.slice(i, i + CHUNK);
    const body = chunk.map(({ lat, lng }) => ({
      keyword,
      location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      language_name: language,
      depth: 20,
    }));
    const res = await fetch('https://api.dataforseo.com/v3/serp/google/local_finder/task_post', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { taskPoints: [], cost: 0, error: `API error ${res.status}` };
    const data = await res.json() as {
      tasks?: Array<{ id?: string; status_code?: number; cost?: number }>;
    };
    if (!data.tasks) return { taskPoints: [], cost: 0, error: 'Empty response from DataForSEO.' };
    data.tasks.forEach((task, j) => {
      const coord = chunk[j];
      if (task.id) {
        allTaskPoints.push({ task_id: task.id, row: coord.row, col: coord.col, lat: coord.lat, lng: coord.lng });
      }
      totalCost += task.cost ?? 0;
    });
  }

  return { taskPoints: allTaskPoints, cost: totalCost };
}

export function stableGridId(
  keyword: string, center: string, gridSize: number,
  spacingKm: number, target: string, queueMode: string,
): string {
  const window = Math.floor(Date.now() / 60_000);
  const key = `${window}|${keyword}|${center}|${gridSize}|${spacingKm}|${target}|${queueMode}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
