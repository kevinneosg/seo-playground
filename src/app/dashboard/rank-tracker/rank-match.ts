// Shared organic-rank matcher used by both the live batch path (actions.ts)
// and the async poll route (/api/rank-check). Kept out of the 'use server'
// module because server-action files may only export async functions.

export interface SerpItem {
  type: string;
  rank_absolute: number;
  rank_group: number;
  url?: string;
  title?: string;
  domain?: string;
}

export function cleanDomain(d: string): string {
  return d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

/**
 * Build the DataForSEO location field. A "lat,lng" value → location_coordinate
 * (a precise point reflects the real localized SERP); otherwise location_name.
 * Country-level names (e.g. "Singapore") crawl from a spot that can mis-rank vs
 * what users in-country actually see, so a coordinate is preferred.
 */
export function locationParam(location: string): { location_coordinate: string } | { location_name: string } {
  const v = location.trim();
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(v)
    ? { location_coordinate: v }
    : { location_name: location };
}

/**
 * Finds the tracked domain's organic rank within a SERP item list.
 * Shared so the live and async paths match identically.
 *
 * Returns `rank_group` (position among ORGANIC results) — the number users
 * mean by "we rank #N". NOT `rank_absolute`, which counts the local/map pack,
 * ads, snippets, etc. and overstates the position.
 */
export function matchOrganicRank(
  items: SerpItem[],
  trackedDomain: string,
): { rank: number | null; url: string | null; title: string | null } {
  // Split by '/' so a tracked domain like "example.com/page" still matches
  const domain = cleanDomain(trackedDomain).split('/')[0];
  const hit = items.find((item) => {
    if (item.type !== 'organic') return false;
    const d = cleanDomain(item.domain ?? item.url ?? '').split('/')[0];
    return d === domain || d.endsWith('.' + domain);
  });
  return { rank: hit?.rank_group ?? null, url: hit?.url ?? null, title: hit?.title ?? null };
}
