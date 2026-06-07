export const dynamic = 'force-dynamic';

import { getCredentials } from '@/lib/db';
import { NextResponse } from 'next/server';

interface DFUserResponse {
  tasks?: Array<{ result?: Array<{ money?: { balance?: number } }> }>;
}

let cachedBalance: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const now = Date.now();
  if (cachedBalance !== null && now < cacheExpiry) {
    return NextResponse.json({ balance: cachedBalance });
  }

  const creds = await getCredentials();
  if (!creds) {
    console.warn('[balance] no DataForSEO credentials configured');
    return NextResponse.json({ balance: null });
  }

  try {
    const auth = btoa(`${creds.login}:${creds.pass}`);
    const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json() as DFUserResponse;
      const balance = (data.tasks?.[0]?.result?.[0]?.money?.balance ?? 0).toFixed(2);
      cachedBalance = balance;
      cacheExpiry = now + CACHE_TTL;
      return NextResponse.json({ balance });
    }
    console.warn('[balance] DataForSEO responded non-OK:', res.status, res.statusText);
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    console.error('[balance] DataForSEO fetch failed:', err?.name, err?.message, err?.cause?.code);
  }

  return NextResponse.json({ balance: '0.00' });
}
