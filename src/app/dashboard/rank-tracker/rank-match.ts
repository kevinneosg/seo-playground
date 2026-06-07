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
