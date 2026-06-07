import { Pool, types } from 'pg';

// BIGINT (OID 20) is returned as a string by pg's default parser. Our BIGINT
// columns hold epoch-ms timestamps and identity ids that are well within
// Number.MAX_SAFE_INTEGER, and the exported interfaces type them as `number`,
// so coerce them back to JS numbers to preserve the existing return shapes.
types.setTypeParser(20, (val) => (val === null ? null : Number(val)));

// --- Singleton pool ---

let _pool: Pool | null = null;

function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.railway.internal') ||
    host === 'railway.internal'
  );
}

function shouldUseSsl(connectionString: string): boolean {
  if (process.env.PGSSL === 'disable') return false;
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    // If the URL can't be parsed, default to no SSL (safest for private nets).
    return false;
  }
  return !isLocalHost(host);
}

function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    _pool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return _pool;
}

// --- Lazy schema init (runs exactly once, before first query) ---

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = initSchema().catch((err) => {
      // Reset so a later query can retry if init failed transiently.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/**
 * Run a parameterized query, ensuring the schema exists first.
 * Mirrors better-sqlite3's prepare().get()/all()/run() ergonomics by exposing
 * the raw pg result; callers read `.rows` / `.rows[0]` / `.rowCount`.
 */
async function query<R extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: R[]; rowCount: number }> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
}

export async function initSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS serp_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      device TEXT NOT NULL,
      depth INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      items TEXT NOT NULL,
      target_hits TEXT
    );

    CREATE TABLE IF NOT EXISTS kd_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      se TEXT NOT NULL,
      se_type TEXT NOT NULL,
      label TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      params TEXT NOT NULL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lf_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      params TEXT NOT NULL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS target_domains (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kw_overview_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keywords TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backlinks_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      cost DOUBLE PRECISION,
      result TEXT NOT NULL,
      links TEXT,
      links_total INTEGER
    );

    CREATE TABLE IF NOT EXISTS competitors_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ranked_kw_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS onpage_tasks (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      url TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cost DOUBLE PRECISION,
      error_message TEXT,
      result TEXT
    );

    CREATE TABLE IF NOT EXISTS tracked_keywords (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      keyword TEXT NOT NULL,
      domain TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'France',
      language TEXT NOT NULL DEFAULT 'fr',
      created_at BIGINT NOT NULL,
      UNIQUE(keyword, domain, location, language)
    );

    CREATE TABLE IF NOT EXISTS rank_checks (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      keyword_id BIGINT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      checked_at BIGINT NOT NULL,
      date TEXT NOT NULL,
      position INTEGER,
      url TEXT,
      title TEXT,
      cost DOUBLE PRECISION
    );

    CREATE TABLE IF NOT EXISTS rank_check_tasks (
      task_id TEXT PRIMARY KEY,
      keyword_id BIGINT NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      posted_at BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS ref_domains_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      cost DOUBLE PRECISION,
      total INTEGER,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anchors_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      cost DOUBLE PRECISION,
      total INTEGER,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hist_rank_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_intersection_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target1 TEXT NOT NULL,
      target2 TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kw_difficulty_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keywords TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS related_kw_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      depth INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grid_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keyword TEXT NOT NULL,
      target TEXT NOT NULL,
      center TEXT NOT NULL,
      grid_size INTEGER NOT NULL,
      spacing_km DOUBLE PRECISION NOT NULL,
      language TEXT NOT NULL,
      cost DOUBLE PRECISION,
      results TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instant_page_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      url TEXT NOT NULL,
      cost DOUBLE PRECISION,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reddit_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews_tasks (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      business TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      depth INTEGER NOT NULL,
      sort_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cost DOUBLE PRECISION,
      result_count INTEGER,
      result TEXT
    );

    CREATE TABLE IF NOT EXISTS site_audit_tasks (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      start_url TEXT,
      max_crawl_pages INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      pages_crawled INTEGER,
      cost DOUBLE PRECISION,
      error_message TEXT,
      summary TEXT,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS top_searches_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      limit_count INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_tech_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      cost DOUBLE PRECISION,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_find_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      mode TEXT NOT NULL,
      query TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_whois_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      domain TEXT NOT NULL,
      cost DOUBLE PRECISION,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_ref_networks (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_page_intersection (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_domain_intersection (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target1 TEXT NOT NULL,
      target2 TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_history (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_bulk_backlinks (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_bulk_ref_domains (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keyword_ideas_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_intent_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      keywords TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_intersection_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      pages TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_categories_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subdomains_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traffic_estimation_searches (
      id TEXT PRIMARY KEY,
      ts BIGINT NOT NULL,
      targets TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost DOUBLE PRECISION,
      items TEXT NOT NULL
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rank_checks_kw ON rank_checks(keyword_id, checked_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rank_check_tasks_kw ON rank_check_tasks(keyword_id)`);

  // Migrations — add columns that may not exist in older DBs.
  await pool.query('ALTER TABLE serp_searches ADD COLUMN IF NOT EXISTS target_hits TEXT');
  await pool.query('ALTER TABLE backlinks_searches ADD COLUMN IF NOT EXISTS links TEXT');
  await pool.query('ALTER TABLE backlinks_searches ADD COLUMN IF NOT EXISTS links_total INTEGER');
  await pool.query(`ALTER TABLE grid_searches ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done'`);
  await pool.query('ALTER TABLE grid_searches ADD COLUMN IF NOT EXISTS task_ids TEXT');
  await pool.query(`ALTER TABLE grid_searches ADD COLUMN IF NOT EXISTS queue_mode TEXT NOT NULL DEFAULT 'live'`);
  await pool.query('ALTER TABLE reviews_tasks ADD COLUMN IF NOT EXISTS meta TEXT');
  await pool.query('ALTER TABLE domain_find_searches ADD COLUMN IF NOT EXISTS keyword TEXT');
  await pool.query('ALTER TABLE domain_find_searches ADD COLUMN IF NOT EXISTS technology TEXT');
}

// --- Settings ---

export async function getSetting(key: string): Promise<string | null> {
  const row = (await query<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key])).rows[0];
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
}

export async function deleteSetting(key: string): Promise<void> {
  await query('DELETE FROM settings WHERE key = $1', [key]);
}

// --- Credentials ---

export async function getCredentials(): Promise<{ login: string; pass: string } | null> {
  const login = await getSetting('dfs-login');
  const pass = await getSetting('dfs-pass');
  if (!login || !pass) return null;
  return { login, pass };
}

export async function saveCredentials(login: string, pass: string): Promise<void> {
  await setSetting('dfs-login', login);
  await setSetting('dfs-pass', pass);
}

export async function clearCredentials(): Promise<void> {
  await deleteSetting('dfs-login');
  await deleteSetting('dfs-pass');
}

// --- Target domains ---

export async function getTargetDomains(): Promise<string[]> {
  const rows = (await query<{ domain: string }>('SELECT domain FROM target_domains ORDER BY created_at DESC')).rows;
  return rows.map((r) => r.domain);
}

export async function addTargetDomain(domain: string): Promise<void> {
  const clean = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  await query('INSERT INTO target_domains (domain, created_at) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING', [clean, Date.now()]);
}

export async function removeTargetDomain(domain: string): Promise<void> {
  await query('DELETE FROM target_domains WHERE domain = $1', [domain]);
}

// --- SERP history ---

export interface TargetHit {
  domain: string;
  position: number;
}

export interface SerpHistoryEntry {
  id: string;
  ts: number;
  keyword: string;
  location: string;
  language: string;
  device: string;
  depth: number;
  count: number;
  targetHits?: TargetHit[];
}

export async function getSerpHistory(): Promise<SerpHistoryEntry[]> {
  const rows = (await query<{ id: string; ts: number; keyword: string; location: string; language: string; device: string; depth: number; result_count: number; target_hits: string | null }>(
    'SELECT id, ts, keyword, location, language, device, depth, result_count, target_hits FROM serp_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, location: r.location, language: r.language, device: r.device, depth: r.depth,
    count: r.result_count,
    targetHits: r.target_hits ? JSON.parse(r.target_hits) : undefined,
  }));
}

export async function saveSerpSearch<T>(entry: SerpHistoryEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO serp_searches (id, ts, keyword, location, language, device, depth, result_count, items, target_hits) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keyword = EXCLUDED.keyword, location = EXCLUDED.location, language = EXCLUDED.language, device = EXCLUDED.device, depth = EXCLUDED.depth, result_count = EXCLUDED.result_count, items = EXCLUDED.items, target_hits = EXCLUDED.target_hits',
    [entry.id, entry.ts, entry.keyword, entry.location, entry.language, entry.device, entry.depth, entry.count, JSON.stringify(items), entry.targetHits ? JSON.stringify(entry.targetHits) : null]
  );
}

export async function getSerpResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM serp_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Keyword Data history ---

export interface KdHistoryEntry {
  id: string;
  ts: number;
  se: string;
  seType: string;
  label: string;
  count: number;
  cost?: number;
  params: Record<string, string>;
}

export async function getKdHistory(): Promise<KdHistoryEntry[]> {
  const rows = (await query<{ id: string; ts: number; se: string; se_type: string; label: string; result_count: number; cost: number | null; params: string }>(
    'SELECT id, ts, se, se_type, label, result_count, cost, params FROM kd_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, se: r.se, seType: r.se_type, label: r.label,
    count: r.result_count, cost: r.cost ?? undefined, params: JSON.parse(r.params),
  }));
}

export async function saveKdSearch<T>(entry: KdHistoryEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO kd_searches (id, ts, se, se_type, label, result_count, cost, params, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, se = EXCLUDED.se, se_type = EXCLUDED.se_type, label = EXCLUDED.label, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, params = EXCLUDED.params, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.se, entry.seType, entry.label, entry.count, entry.cost ?? null, JSON.stringify(entry.params), JSON.stringify(items)]
  );
}

export async function getKdResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM kd_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Local Finder history ---

export interface LfHistoryEntry {
  id: string;
  ts: number;
  keyword: string;
  location: string;
  count: number;
  cost?: number;
  params: Record<string, string>;
}

export async function getLfHistory(): Promise<LfHistoryEntry[]> {
  const rows = (await query<{ id: string; ts: number; keyword: string; location: string; result_count: number; cost: number | null; params: string }>(
    'SELECT id, ts, keyword, location, result_count, cost, params FROM lf_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, location: r.location,
    count: r.result_count, cost: r.cost ?? undefined, params: JSON.parse(r.params),
  }));
}

export async function saveLfSearch<T>(entry: LfHistoryEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO lf_searches (id, ts, keyword, location, result_count, cost, params, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keyword = EXCLUDED.keyword, location = EXCLUDED.location, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, params = EXCLUDED.params, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.keyword, entry.location, entry.count, entry.cost ?? null, JSON.stringify(entry.params), JSON.stringify(items)]
  );
}

export async function getLfResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM lf_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- OnPage tasks ---

export interface OnpageTask {
  id: string;
  ts: number;
  url: string;
  target: string;
  status: 'pending' | 'in_progress' | 'finished' | 'error';
  cost?: number;
  errorMessage?: string;
}

export async function getOnpageTasks(): Promise<OnpageTask[]> {
  const rows = (await query<{ id: string; ts: number; url: string; target: string; status: string; cost: number | null; error_message: string | null }>(
    'SELECT id, ts, url, target, status, cost, error_message FROM onpage_tasks ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, url: r.url, target: r.target,
    status: r.status as OnpageTask['status'],
    cost: r.cost ?? undefined,
    errorMessage: r.error_message ?? undefined,
  }));
}

export async function upsertOnpageTask(task: OnpageTask): Promise<void> {
  await query(
    `INSERT INTO onpage_tasks (id, ts, url, target, status, cost, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, url = EXCLUDED.url, target = EXCLUDED.target, status = EXCLUDED.status, cost = EXCLUDED.cost, error_message = EXCLUDED.error_message`,
    [task.id, task.ts, task.url, task.target, task.status, task.cost ?? null, task.errorMessage ?? null]
  );
}

export async function getOnpageResult<T>(taskId: string): Promise<T | null> {
  const row = (await query<{ result: string | null }>('SELECT result FROM onpage_tasks WHERE id = $1', [taskId])).rows[0];
  if (!row?.result) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

export async function saveOnpageResult<T>(taskId: string, result: T): Promise<void> {
  await query('UPDATE onpage_tasks SET result = $1, status = $2 WHERE id = $3', [JSON.stringify(result), 'finished', taskId]);
}

// --- Ranked Keywords ---

export interface RankedKwSearchEntry {
  id: string;
  ts: number;
  target: string;
  location: string;
  language: string;
  count: number;
  totalCount: number;
  cost?: number;
}

export async function getRankedKwHistory(): Promise<RankedKwSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; location: string; language: string; result_count: number; total_count: number; cost: number | null }>(
    'SELECT id, ts, target, location, language, result_count, total_count, cost FROM ranked_kw_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language,
    count: r.result_count, totalCount: r.total_count, cost: r.cost ?? undefined,
  }));
}

export async function saveRankedKwSearch<T>(entry: RankedKwSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO ranked_kw_searches (id, ts, target, location, language, result_count, total_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, total_count = EXCLUDED.total_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.totalCount, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getRankedKwResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM ranked_kw_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Keyword Overview ---

export interface KwOverviewSearchEntry {
  id: string;
  ts: number;
  keywords: string;
  location: string;
  language: string;
  count: number;
  cost?: number;
}

export async function getKwOverviewHistory(): Promise<KwOverviewSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; keywords: string; location: string; language: string; result_count: number; cost: number | null }>(
    'SELECT id, ts, keywords, location, language, result_count, cost FROM kw_overview_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keywords: r.keywords, location: r.location, language: r.language,
    count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export async function saveKwOverviewSearch<T>(entry: KwOverviewSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO kw_overview_searches (id, ts, keywords, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keywords = EXCLUDED.keywords, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.keywords, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getKwOverviewResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM kw_overview_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Backlinks ---

export interface BacklinksSearchEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
  linksTotal?: number;
}

export async function getBacklinksHistory(): Promise<BacklinksSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; cost: number | null; links_total: number | null }>(
    'SELECT id, ts, target, cost, links_total FROM backlinks_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined, linksTotal: r.links_total ?? undefined }));
}

export async function saveBacklinksSearch<T, L>(entry: BacklinksSearchEntry, result: T, links?: L[], linksTotal?: number): Promise<void> {
  await query(
    'INSERT INTO backlinks_searches (id, ts, target, cost, result, links, links_total) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, cost = EXCLUDED.cost, result = EXCLUDED.result, links = EXCLUDED.links, links_total = EXCLUDED.links_total',
    [entry.id, entry.ts, entry.target, entry.cost ?? null, JSON.stringify(result), links ? JSON.stringify(links) : null, linksTotal ?? null]
  );
}

export async function getBacklinksResult<T>(id: string): Promise<T | null> {
  const row = (await query<{ result: string }>('SELECT result FROM backlinks_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

export async function getBacklinksLinks<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ links: string | null }>('SELECT links FROM backlinks_searches WHERE id = $1', [id])).rows[0];
  if (!row?.links) return null;
  try { return JSON.parse(row.links) as T[]; } catch { return null; }
}

// --- Competitors ---

export interface CompetitorsSearchEntry {
  id: string;
  ts: number;
  target: string;
  location: string;
  language: string;
  count: number;
  cost?: number;
}

export async function getCompetitorsHistory(): Promise<CompetitorsSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; location: string; language: string; result_count: number; cost: number | null }>(
    'SELECT id, ts, target, location, language, result_count, cost FROM competitors_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language,
    count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export async function saveCompetitorsSearch<T>(entry: CompetitorsSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO competitors_searches (id, ts, target, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getCompetitorsResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM competitors_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Rank Tracker ---

export interface TrackedKeyword {
  id: number;
  keyword: string;
  domain: string;
  location: string;
  language: string;
  createdAt: number;
}

export interface RankCheck {
  id: number;
  keywordId: number;
  checkedAt: number;
  date: string;
  position: number | null;
  url: string | null;
  title: string | null;
  cost: number | null;
}

export async function getTrackedKeywords(): Promise<TrackedKeyword[]> {
  const rows = (await query<{ id: number; keyword: string; domain: string; location: string; language: string; created_at: number }>(
    'SELECT id, keyword, domain, location, language, created_at FROM tracked_keywords ORDER BY created_at DESC'
  )).rows;
  return rows.map((r) => ({ id: Number(r.id), keyword: r.keyword, domain: r.domain, location: r.location, language: r.language, createdAt: Number(r.created_at) }));
}

export async function addTrackedKeyword(keyword: string, domain: string, location: string, language: string): Promise<number> {
  const k = keyword.trim();
  const d = domain.trim();
  const inserted = (await query<{ id: number }>(
    'INSERT INTO tracked_keywords (keyword, domain, location, language, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (keyword, domain, location, language) DO NOTHING RETURNING id',
    [k, d, location, language, Date.now()]
  )).rows[0];
  if (inserted) return Number(inserted.id);
  const existing = (await query<{ id: number }>(
    'SELECT id FROM tracked_keywords WHERE keyword = $1 AND domain = $2 AND location = $3 AND language = $4',
    [k, d, location, language]
  )).rows[0];
  return Number(existing.id);
}

export async function removeTrackedKeyword(id: number): Promise<void> {
  await query('DELETE FROM tracked_keywords WHERE id = $1', [id]);
}

export async function saveRankCheck(keywordId: number, position: number | null, url: string | null, title: string | null, cost: number | null): Promise<void> {
  const now = Date.now();
  const date = new Date(now).toISOString().split('T')[0];
  // Only one check per day per keyword — upsert by date.
  const existing = (await query<{ id: number }>('SELECT id FROM rank_checks WHERE keyword_id = $1 AND date = $2', [keywordId, date])).rows[0];
  if (existing) {
    await query('UPDATE rank_checks SET checked_at = $1, position = $2, url = $3, title = $4, cost = $5 WHERE id = $6',
      [now, position, url, title, cost, existing.id]);
  } else {
    await query('INSERT INTO rank_checks (keyword_id, checked_at, date, position, url, title, cost) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [keywordId, now, date, position, url, title, cost]);
  }
}

export async function getRankHistory(keywordId: number, days = 30): Promise<RankCheck[]> {
  const rows = (await query<{ id: number; keyword_id: number; checked_at: number; date: string; position: number | null; url: string | null; title: string | null; cost: number | null }>(
    'SELECT id, keyword_id, checked_at, date, position, url, title, cost FROM rank_checks WHERE keyword_id = $1 ORDER BY date DESC LIMIT $2',
    [keywordId, days]
  )).rows;
  return rows.map((r) => ({ id: Number(r.id), keywordId: Number(r.keyword_id), checkedAt: Number(r.checked_at), date: r.date, position: r.position, url: r.url, title: r.title, cost: r.cost }));
}

export async function getLatestRankCheck(keywordId: number): Promise<RankCheck | null> {
  const row = (await query<{ id: number; keyword_id: number; checked_at: number; date: string; position: number | null; url: string | null; title: string | null; cost: number | null }>(
    'SELECT id, keyword_id, checked_at, date, position, url, title, cost FROM rank_checks WHERE keyword_id = $1 ORDER BY date DESC LIMIT 1',
    [keywordId]
  )).rows[0];
  if (!row) return null;
  return { id: Number(row.id), keywordId: Number(row.keyword_id), checkedAt: Number(row.checked_at), date: row.date, position: row.position, url: row.url, title: row.title, cost: row.cost };
}

// --- Async rank-check tasks (Standard queue + polling) ---

export interface RankCheckTask {
  task_id: string;
  keyword_id: number;
  domain: string;
}

export async function addRankCheckTasks(rows: { task_id: string; keyword_id: number; domain: string }[]): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  for (const r of rows) {
    await query(
      'INSERT INTO rank_check_tasks (task_id, keyword_id, domain, posted_at, status) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (task_id) DO NOTHING',
      [r.task_id, r.keyword_id, r.domain, now, 'pending']
    );
  }
}

export async function getPendingRankCheckTasks(domain?: string): Promise<RankCheckTask[]> {
  const rows = domain
    ? (await query<{ task_id: string; keyword_id: number; domain: string }>(
        "SELECT task_id, keyword_id, domain FROM rank_check_tasks WHERE status = 'pending' AND domain = $1",
        [domain]
      )).rows
    : (await query<{ task_id: string; keyword_id: number; domain: string }>(
        "SELECT task_id, keyword_id, domain FROM rank_check_tasks WHERE status = 'pending'"
      )).rows;
  return rows.map((r) => ({ task_id: r.task_id, keyword_id: Number(r.keyword_id), domain: r.domain }));
}

export async function deleteRankCheckTask(taskId: string): Promise<void> {
  await query('DELETE FROM rank_check_tasks WHERE task_id = $1', [taskId]);
}

export async function countPendingRankCheckTasks(domain?: string): Promise<number> {
  const row = domain
    ? (await query<{ n: string }>("SELECT COUNT(*)::int AS n FROM rank_check_tasks WHERE status = 'pending' AND domain = $1", [domain])).rows[0]
    : (await query<{ n: string }>("SELECT COUNT(*)::int AS n FROM rank_check_tasks WHERE status = 'pending'")).rows[0];
  return Number(row?.n ?? 0);
}

// --- Referring Domains ---

export interface RefDomainsSearchEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
  total?: number;
}

export async function getRefDomainsHistory(): Promise<RefDomainsSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; cost: number | null; total: number | null }>(
    'SELECT id, ts, target, cost, total FROM ref_domains_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined, total: r.total ?? undefined }));
}

export async function saveRefDomainsSearch<T>(entry: RefDomainsSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO ref_domains_searches (id, ts, target, cost, total, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, cost = EXCLUDED.cost, total = EXCLUDED.total, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.target, entry.cost ?? null, entry.total ?? null, JSON.stringify(items)]
  );
}

export async function getRefDomainsResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM ref_domains_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Anchors ---

export interface AnchorsSearchEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
  total?: number;
}

export async function getAnchorsHistory(): Promise<AnchorsSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; cost: number | null; total: number | null }>(
    'SELECT id, ts, target, cost, total FROM anchors_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined, total: r.total ?? undefined }));
}

export async function saveAnchorsSearch<T>(entry: AnchorsSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO anchors_searches (id, ts, target, cost, total, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, cost = EXCLUDED.cost, total = EXCLUDED.total, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.target, entry.cost ?? null, entry.total ?? null, JSON.stringify(items)]
  );
}

export async function getAnchorsResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM anchors_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Historical Rank Overview ---

export interface HistRankSearchEntry {
  id: string;
  ts: number;
  target: string;
  location: string;
  language: string;
  cost?: number;
}

export async function getHistRankHistory(): Promise<HistRankSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; location: string; language: string; cost: number | null }>(
    'SELECT id, ts, target, location, language, cost FROM hist_rank_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language, cost: r.cost ?? undefined }));
}

export async function saveHistRankSearch<T>(entry: HistRankSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO hist_rank_searches (id, ts, target, location, language, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, location = EXCLUDED.location, language = EXCLUDED.language, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.target, entry.location, entry.language, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getHistRankResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM hist_rank_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Domain Intersection ---

export interface DomainIntersectionSearchEntry {
  id: string;
  ts: number;
  target1: string;
  target2: string;
  location: string;
  language: string;
  count: number;
  totalCount: number;
  cost?: number;
}

export async function getDomainIntersectionHistory(): Promise<DomainIntersectionSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; target1: string; target2: string; location: string; language: string; result_count: number; total_count: number; cost: number | null }>(
    'SELECT id, ts, target1, target2, location, language, result_count, total_count, cost FROM domain_intersection_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target1: r.target1, target2: r.target2, location: r.location, language: r.language, count: r.result_count, totalCount: r.total_count, cost: r.cost ?? undefined }));
}

export async function saveDomainIntersectionSearch<T>(entry: DomainIntersectionSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO domain_intersection_searches (id, ts, target1, target2, location, language, result_count, total_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target1 = EXCLUDED.target1, target2 = EXCLUDED.target2, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, total_count = EXCLUDED.total_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.target1, entry.target2, entry.location, entry.language, entry.count, entry.totalCount, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getDomainIntersectionResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM domain_intersection_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Keyword Difficulty ---

export interface KwDifficultySearchEntry {
  id: string;
  ts: number;
  keywords: string;
  location: string;
  language: string;
  count: number;
  cost?: number;
}

export async function getKwDifficultyHistory(): Promise<KwDifficultySearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; keywords: string; location: string; language: string; result_count: number; cost: number | null }>(
    'SELECT id, ts, keywords, location, language, result_count, cost FROM kw_difficulty_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keywords: r.keywords, location: r.location, language: r.language,
    count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export async function saveKwDifficultySearch<T>(entry: KwDifficultySearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO kw_difficulty_searches (id, ts, keywords, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keywords = EXCLUDED.keywords, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.keywords, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getKwDifficultyResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM kw_difficulty_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Related Keywords ---

export interface RelatedKwSearchEntry {
  id: string;
  ts: number;
  keyword: string;
  location: string;
  language: string;
  depth: number;
  count: number;
  cost?: number;
}

export async function getRelatedKwHistory(): Promise<RelatedKwSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; keyword: string; location: string; language: string; depth: number; result_count: number; cost: number | null }>(
    'SELECT id, ts, keyword, location, language, depth, result_count, cost FROM related_kw_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, location: r.location, language: r.language,
    depth: r.depth, count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export async function saveRelatedKwSearch<T>(entry: RelatedKwSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO related_kw_searches (id, ts, keyword, location, language, depth, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keyword = EXCLUDED.keyword, location = EXCLUDED.location, language = EXCLUDED.language, depth = EXCLUDED.depth, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.keyword, entry.location, entry.language, entry.depth, entry.count, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getRelatedKwResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM related_kw_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Grid Search ---

export type GridQueueMode = 'live' | 'priority' | 'standard';
export type GridStatus = 'done' | 'pending' | 'error';

export interface GridSearchEntry {
  id: string;
  ts: number;
  keyword: string;
  target: string;
  center: string;
  grid_size: number;
  spacing_km: number;
  language: string;
  cost?: number;
  status: GridStatus;
  queue_mode: GridQueueMode;
}

export interface GridTaskPoint {
  task_id: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
}

export interface GridLocalItem {
  rank_group: number;
  title: string;
  domain?: string;
  url?: string;
  cid?: string;
  rating_value?: number;
  rating_votes?: number;
  is_target: boolean;
}

export interface GridPoint {
  row: number;
  col: number;
  lat?: number;
  lng?: number;
  rank: number | null;
  items?: GridLocalItem[];
}

export async function getGridHistory(): Promise<GridSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string }>(
    'SELECT id, ts, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode FROM grid_searches ORDER BY ts DESC LIMIT 20'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, target: r.target, center: r.center,
    grid_size: r.grid_size, spacing_km: r.spacing_km, language: r.language, cost: r.cost ?? undefined,
    status: (r.status ?? 'done') as GridStatus,
    queue_mode: (r.queue_mode ?? 'live') as GridQueueMode,
  }));
}

export async function getGridEntry(id: string): Promise<(GridSearchEntry & { task_ids?: GridTaskPoint[] }) | null> {
  const row = (await query<{ id: string; ts: number; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string; task_ids: string | null }>(
    'SELECT id, ts, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode, task_ids FROM grid_searches WHERE id = $1',
    [id]
  )).rows[0];
  if (!row) return null;
  return {
    id: row.id, ts: row.ts, keyword: row.keyword, target: row.target, center: row.center,
    grid_size: row.grid_size, spacing_km: row.spacing_km, language: row.language, cost: row.cost ?? undefined,
    status: (row.status ?? 'done') as GridStatus,
    queue_mode: (row.queue_mode ?? 'live') as GridQueueMode,
    task_ids: row.task_ids ? JSON.parse(row.task_ids) as GridTaskPoint[] : undefined,
  };
}

export async function saveGridSearch(entry: GridSearchEntry, results: GridPoint[]): Promise<void> {
  await query(
    'INSERT INTO grid_searches (id, ts, keyword, target, center, grid_size, spacing_km, language, cost, results, status, queue_mode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keyword = EXCLUDED.keyword, target = EXCLUDED.target, center = EXCLUDED.center, grid_size = EXCLUDED.grid_size, spacing_km = EXCLUDED.spacing_km, language = EXCLUDED.language, cost = EXCLUDED.cost, results = EXCLUDED.results, status = EXCLUDED.status, queue_mode = EXCLUDED.queue_mode',
    [entry.id, entry.ts, entry.keyword, entry.target, entry.center, entry.grid_size, entry.spacing_km, entry.language, entry.cost ?? null, JSON.stringify(results), entry.status, entry.queue_mode]
  );
}

export async function saveGridSearchPending(entry: GridSearchEntry, taskPoints: GridTaskPoint[]): Promise<void> {
  await query(
    'INSERT INTO grid_searches (id, ts, keyword, target, center, grid_size, spacing_km, language, cost, results, status, queue_mode, task_ids) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keyword = EXCLUDED.keyword, target = EXCLUDED.target, center = EXCLUDED.center, grid_size = EXCLUDED.grid_size, spacing_km = EXCLUDED.spacing_km, language = EXCLUDED.language, cost = EXCLUDED.cost, results = EXCLUDED.results, status = EXCLUDED.status, queue_mode = EXCLUDED.queue_mode, task_ids = EXCLUDED.task_ids',
    [entry.id, entry.ts, entry.keyword, entry.target, entry.center, entry.grid_size, entry.spacing_km, entry.language, entry.cost ?? null, '[]', 'pending', entry.queue_mode, JSON.stringify(taskPoints)]
  );
}

export async function completeGridSearch(id: string, results: GridPoint[], cost: number): Promise<void> {
  await query(
    "UPDATE grid_searches SET results = $1, cost = $2, status = 'done', task_ids = NULL WHERE id = $3",
    [JSON.stringify(results), cost, id]
  );
}

export async function getGridResults(id: string): Promise<GridPoint[] | null> {
  const row = (await query<{ results: string }>('SELECT results FROM grid_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.results) as GridPoint[];
    return parsed.length > 0 ? parsed : null;
  } catch { return null; }
}

// --- Instant Pages ---

export interface InstantPageEntry {
  id: string;
  ts: number;
  url: string;
  cost?: number;
}

export async function getInstantPageHistory(): Promise<InstantPageEntry[]> {
  const rows = (await query<{ id: string; ts: number; url: string; cost: number | null }>(
    'SELECT id, ts, url, cost FROM instant_page_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, url: r.url, cost: r.cost ?? undefined }));
}

export async function saveInstantPageResult<T>(entry: InstantPageEntry, result: T): Promise<void> {
  await query(
    'INSERT INTO instant_page_searches (id, ts, url, cost, result) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, url = EXCLUDED.url, cost = EXCLUDED.cost, result = EXCLUDED.result',
    [entry.id, entry.ts, entry.url, entry.cost ?? null, JSON.stringify(result)]
  );
}

export async function getInstantPageResult<T>(id: string): Promise<T | null> {
  const row = (await query<{ result: string }>('SELECT result FROM instant_page_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

// --- Reddit ---

export interface RedditSearchEntry {
  id: string;
  ts: number;
  targets: string;
  count: number;
  cost?: number;
}

export async function getRedditHistory(): Promise<RedditSearchEntry[]> {
  const rows = (await query<{ id: string; ts: number; targets: string; result_count: number; cost: number | null }>(
    'SELECT id, ts, targets, result_count, cost FROM reddit_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}

export async function saveRedditSearch<T>(entry: RedditSearchEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO reddit_searches (id, ts, targets, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, targets = EXCLUDED.targets, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getRedditResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM reddit_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Top Searches ---

export interface TopSearchesEntry {
  id: string;
  ts: number;
  location: string;
  language: string;
  limitCount: number;
  count: number;
  totalCount?: number;
  cost?: number;
}

export async function getTopSearchesHistory(): Promise<TopSearchesEntry[]> {
  const rows = (await query<{ id: string; ts: number; location: string; language: string; limit_count: number; result_count: number; total_count: number | null; cost: number | null }>(
    'SELECT id, ts, location, language, limit_count, result_count, total_count, cost FROM top_searches_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, location: r.location, language: r.language,
    limitCount: r.limit_count, count: r.result_count,
    totalCount: r.total_count ?? undefined, cost: r.cost ?? undefined,
  }));
}

export async function saveTopSearches<T>(entry: TopSearchesEntry, items: T[]): Promise<void> {
  await query(
    'INSERT INTO top_searches_searches (id, ts, location, language, limit_count, result_count, total_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, location = EXCLUDED.location, language = EXCLUDED.language, limit_count = EXCLUDED.limit_count, result_count = EXCLUDED.result_count, total_count = EXCLUDED.total_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, entry.location, entry.language, entry.limitCount, entry.count, entry.totalCount ?? null, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getTopSearchesResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM top_searches_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Google Reviews ---

export interface ReviewsTask {
  id: string;
  ts: number;
  business: string;
  location: string;
  language: string;
  depth: number;
  sortBy: string;
  status: 'pending' | 'ready' | 'error';
  cost?: number;
  resultCount?: number;
}

export async function saveReviewsTask(id: string, business: string, location: string, language: string, depth: number, sortBy: string, cost?: number): Promise<void> {
  await query(
    'INSERT INTO reviews_tasks (id, ts, business, location, language, depth, sort_by, status, cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, business = EXCLUDED.business, location = EXCLUDED.location, language = EXCLUDED.language, depth = EXCLUDED.depth, sort_by = EXCLUDED.sort_by, status = EXCLUDED.status, cost = EXCLUDED.cost',
    [id, Date.now(), business, location, language, depth, sortBy, 'pending', cost ?? null]
  );
}

export async function getReviewsTasks(): Promise<ReviewsTask[]> {
  const rows = (await query<{ id: string; ts: number; business: string; location: string; language: string; depth: number; sort_by: string; status: string; cost: number | null; result_count: number | null }>(
    'SELECT id, ts, business, location, language, depth, sort_by, status, cost, result_count FROM reviews_tasks ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, business: r.business, location: r.location, language: r.language,
    depth: r.depth, sortBy: r.sort_by, status: r.status as ReviewsTask['status'],
    cost: r.cost ?? undefined, resultCount: r.result_count ?? undefined,
  }));
}

export async function updateReviewsTask(id: string, status: ReviewsTask['status'], items: unknown[], cost?: number, resultCount?: number, meta?: unknown): Promise<void> {
  // Use COALESCE so that passing null preserves the existing cost (set at task_post time).
  const costVal = (cost !== undefined && cost > 0) ? cost : null;
  await query(
    'UPDATE reviews_tasks SET status = $1, result = $2, cost = COALESCE($3, cost), result_count = $4, meta = $5 WHERE id = $6',
    [status, JSON.stringify(items), costVal, resultCount ?? items.length, meta != null ? JSON.stringify(meta) : null, id]
  );
}

export async function getReviewsTaskResult<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ result: string | null }>('SELECT result FROM reviews_tasks WHERE id = $1', [id])).rows[0];
  if (!row?.result) return null;
  try { return JSON.parse(row.result) as T[]; } catch { return null; }
}

export async function getReviewsTaskMeta<T>(id: string): Promise<T | null> {
  const row = (await query<{ meta: string | null }>('SELECT meta FROM reviews_tasks WHERE id = $1', [id])).rows[0];
  if (!row?.meta) return null;
  try { return JSON.parse(row.meta) as T; } catch { return null; }
}

// --- Domain Technologies ---

export interface DomainTechEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
}

export async function getDomainTechHistory(): Promise<DomainTechEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; cost: number | null }>(
    'SELECT id, ts, target, cost FROM domain_tech_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined }));
}

export async function saveDomainTechSearch<T>(entry: DomainTechEntry, result: T): Promise<void> {
  await query(
    'INSERT INTO domain_tech_searches (id, ts, target, cost, result) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, cost = EXCLUDED.cost, result = EXCLUDED.result',
    [entry.id, entry.ts, entry.target, entry.cost ?? null, JSON.stringify(result)]
  );
}

export async function getDomainTechResult<T>(id: string): Promise<T | null> {
  const row = (await query<{ result: string }>('SELECT result FROM domain_tech_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

// --- Domain Find (by keyword + technology combined) ---

export interface DomainFindEntry {
  id: string;
  ts: number;
  keyword?: string;
  technology?: string;
  count: number;
  totalCount?: number;
  cost?: number;
}

export async function getDomainFindHistory(): Promise<DomainFindEntry[]> {
  const rows = (await query<{ id: string; ts: number; keyword: string | null; technology: string | null; result_count: number; total_count: number | null; cost: number | null }>(
    'SELECT id, ts, keyword, technology, result_count, total_count, cost FROM domain_find_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, keyword: r.keyword ?? undefined, technology: r.technology ?? undefined, count: r.result_count, totalCount: r.total_count ?? undefined, cost: r.cost ?? undefined }));
}

export async function saveDomainFindSearch<T>(entry: DomainFindEntry, items: T[]): Promise<void> {
  const label = [entry.technology && `tech:${entry.technology}`, entry.keyword && `kw:${entry.keyword}`].filter(Boolean).join(' + ') || '';
  await query(
    'INSERT INTO domain_find_searches (id, ts, mode, query, keyword, technology, result_count, total_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, mode = EXCLUDED.mode, query = EXCLUDED.query, keyword = EXCLUDED.keyword, technology = EXCLUDED.technology, result_count = EXCLUDED.result_count, total_count = EXCLUDED.total_count, cost = EXCLUDED.cost, items = EXCLUDED.items',
    [entry.id, entry.ts, 'find', label, entry.keyword ?? null, entry.technology ?? null, entry.count, entry.totalCount ?? null, entry.cost ?? null, JSON.stringify(items)]
  );
}

export async function getDomainFindResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM domain_find_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Domain Whois ---

export interface DomainWhoisEntry {
  id: string;
  ts: number;
  domain: string;
  cost?: number;
}

export async function getDomainWhoisHistory(): Promise<DomainWhoisEntry[]> {
  const rows = (await query<{ id: string; ts: number; domain: string; cost: number | null }>(
    'SELECT id, ts, domain, cost FROM domain_whois_searches ORDER BY ts DESC LIMIT 30'
  )).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, domain: r.domain, cost: r.cost ?? undefined }));
}

export async function saveDomainWhoisSearch<T>(entry: DomainWhoisEntry, result: T): Promise<void> {
  await query(
    'INSERT INTO domain_whois_searches (id, ts, domain, cost, result) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, domain = EXCLUDED.domain, cost = EXCLUDED.cost, result = EXCLUDED.result',
    [entry.id, entry.ts, entry.domain, entry.cost ?? null, JSON.stringify(result)]
  );
}

export async function getDomainWhoisResult<T>(id: string): Promise<T | null> {
  const row = (await query<{ result: string }>('SELECT result FROM domain_whois_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

// --- Site Audit ---

export interface SiteAuditEntry {
  id: string;
  ts: number;
  target: string;
  startUrl?: string;
  maxCrawlPages: number;
  status: 'pending' | 'in_progress' | 'finished' | 'error';
  pagesCrawled?: number;
  cost?: number;
  errorMessage?: string;
}

export async function getSiteAuditHistory(): Promise<SiteAuditEntry[]> {
  const rows = (await query<{ id: string; ts: number; target: string; start_url: string | null; max_crawl_pages: number; status: string; pages_crawled: number | null; cost: number | null; error_message: string | null }>(
    'SELECT id, ts, target, start_url, max_crawl_pages, status, pages_crawled, cost, error_message FROM site_audit_tasks ORDER BY ts DESC LIMIT 20'
  )).rows;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, target: r.target, startUrl: r.start_url ?? undefined,
    maxCrawlPages: r.max_crawl_pages, status: r.status as SiteAuditEntry['status'],
    pagesCrawled: r.pages_crawled ?? undefined, cost: r.cost ?? undefined,
    errorMessage: r.error_message ?? undefined,
  }));
}

export async function getSiteAuditTask(id: string): Promise<SiteAuditEntry | null> {
  const row = (await query<{ id: string; ts: number; target: string; start_url: string | null; max_crawl_pages: number; status: string; pages_crawled: number | null; cost: number | null; error_message: string | null }>(
    'SELECT id, ts, target, start_url, max_crawl_pages, status, pages_crawled, cost, error_message FROM site_audit_tasks WHERE id = $1',
    [id]
  )).rows[0];
  if (!row) return null;
  return {
    id: row.id, ts: row.ts, target: row.target, startUrl: row.start_url ?? undefined,
    maxCrawlPages: row.max_crawl_pages, status: row.status as SiteAuditEntry['status'],
    pagesCrawled: row.pages_crawled ?? undefined, cost: row.cost ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}

export async function upsertSiteAuditTask(entry: SiteAuditEntry): Promise<void> {
  await query(
    'INSERT INTO site_audit_tasks (id, ts, target, start_url, max_crawl_pages, status, pages_crawled, cost, error_message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, start_url = EXCLUDED.start_url, max_crawl_pages = EXCLUDED.max_crawl_pages, status = EXCLUDED.status, pages_crawled = EXCLUDED.pages_crawled, cost = EXCLUDED.cost, error_message = EXCLUDED.error_message',
    [entry.id, entry.ts, entry.target, entry.startUrl ?? null, entry.maxCrawlPages, entry.status, entry.pagesCrawled ?? null, entry.cost ?? null, entry.errorMessage ?? null]
  );
}

export async function saveSiteAuditResult<S, P>(id: string, summary: S, pages: P[], pagesCrawled?: number): Promise<void> {
  await query(
    "UPDATE site_audit_tasks SET summary = $1, pages = $2, status = 'finished', pages_crawled = COALESCE($3, pages_crawled) WHERE id = $4",
    [JSON.stringify(summary), JSON.stringify(pages), pagesCrawled ?? null, id]
  );
}

export async function getSiteAuditSummary<T>(id: string): Promise<T | null> {
  const row = (await query<{ summary: string | null }>('SELECT summary FROM site_audit_tasks WHERE id = $1', [id])).rows[0];
  if (!row?.summary) return null;
  try { return JSON.parse(row.summary) as T; } catch { return null; }
}

export async function getSiteAuditPages<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ pages: string | null }>('SELECT pages FROM site_audit_tasks WHERE id = $1', [id])).rows[0];
  if (!row?.pages) return null;
  try { return JSON.parse(row.pages) as T[]; } catch { return null; }
}

// ─── Keyword Ideas ────────────────────────────────────────────────────────────

export interface KeywordIdeasEntry { id: string; ts: number; keyword: string; location: string; language: string; count: number; cost?: number; }
type KIRow = { id: string; ts: number; keyword: string; location: string; language: string; result_count: number; cost: number | null };

export async function getKeywordIdeasHistory(): Promise<KeywordIdeasEntry[]> {
  const rows = (await query<KIRow>('SELECT id, ts, keyword, location, language, result_count, cost FROM keyword_ideas_searches ORDER BY ts DESC LIMIT 20')).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, keyword: r.keyword, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveKeywordIdeasSearch(entry: KeywordIdeasEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO keyword_ideas_searches (id, ts, keyword, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keyword = EXCLUDED.keyword, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.keyword, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getKeywordIdeasResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM keyword_ideas_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Search Intent ────────────────────────────────────────────────────────────

export interface SearchIntentEntry { id: string; ts: number; keywords: string; location: string; language: string; count: number; cost?: number; }
type SIRow = { id: string; ts: number; keywords: string; location: string; language: string; result_count: number; cost: number | null };

export async function getSearchIntentHistory(): Promise<SearchIntentEntry[]> {
  const rows = (await query<SIRow>('SELECT id, ts, keywords, location, language, result_count, cost FROM search_intent_searches ORDER BY ts DESC LIMIT 20')).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, keywords: r.keywords, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveSearchIntentSearch(entry: SearchIntentEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO search_intent_searches (id, ts, keywords, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, keywords = EXCLUDED.keywords, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.keywords, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getSearchIntentResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM search_intent_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Page Intersection ────────────────────────────────────────────────────────

export interface PageIntersectionEntry { id: string; ts: number; pages: string; location: string; language: string; count: number; cost?: number; }
type PIRow = { id: string; ts: number; pages: string; location: string; language: string; result_count: number; cost: number | null };

export async function getPageIntersectionHistory(): Promise<PageIntersectionEntry[]> {
  const rows = (await query<PIRow>('SELECT id, ts, pages, location, language, result_count, cost FROM page_intersection_searches ORDER BY ts DESC LIMIT 20')).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, pages: r.pages, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function savePageIntersectionSearch(entry: PageIntersectionEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO page_intersection_searches (id, ts, pages, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, pages = EXCLUDED.pages, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.pages, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getPageIntersectionResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM page_intersection_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Domain Categories ────────────────────────────────────────────────────────

export interface DomainCategoriesEntry { id: string; ts: number; target: string; location: string; language: string; count: number; cost?: number; }
type DCRow = { id: string; ts: number; target: string; location: string; language: string; result_count: number; cost: number | null };

export async function getDomainCategoriesHistory(): Promise<DomainCategoriesEntry[]> {
  const rows = (await query<DCRow>('SELECT id, ts, target, location, language, result_count, cost FROM domain_categories_searches ORDER BY ts DESC LIMIT 20')).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveDomainCategoriesSearch(entry: DomainCategoriesEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO domain_categories_searches (id, ts, target, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getDomainCategoriesResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM domain_categories_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Subdomains ───────────────────────────────────────────────────────────────

export interface SubdomainsEntry { id: string; ts: number; target: string; location: string; language: string; count: number; cost?: number; }
type SDRow = { id: string; ts: number; target: string; location: string; language: string; result_count: number; cost: number | null };

export async function getSubdomainsHistory(): Promise<SubdomainsEntry[]> {
  const rows = (await query<SDRow>('SELECT id, ts, target, location, language, result_count, cost FROM subdomains_searches ORDER BY ts DESC LIMIT 20')).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveSubdomainsSearch(entry: SubdomainsEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO subdomains_searches (id, ts, target, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getSubdomainsResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM subdomains_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Traffic Estimation ───────────────────────────────────────────────────────

export interface TrafficEstimationEntry { id: string; ts: number; targets: string; location: string; language: string; count: number; cost?: number; }
type TERow = { id: string; ts: number; targets: string; location: string; language: string; result_count: number; cost: number | null };

export async function getTrafficEstimationHistory(): Promise<TrafficEstimationEntry[]> {
  const rows = (await query<TERow>('SELECT id, ts, targets, location, language, result_count, cost FROM traffic_estimation_searches ORDER BY ts DESC LIMIT 20')).rows;
  return rows.map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveTrafficEstimationSearch(entry: TrafficEstimationEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO traffic_estimation_searches (id, ts, targets, location, language, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, targets = EXCLUDED.targets, location = EXCLUDED.location, language = EXCLUDED.language, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.targets, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getTrafficEstimationResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM traffic_estimation_searches WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Referring Networks ───────────────────────────────────────────

export interface BlRefNetEntry { id: string; ts: number; target: string; count: number; cost?: number; }
type BlRNRow = { id: string; ts: number; target: string; result_count: number; cost: number | null };
export async function getBlRefNetHistory(): Promise<BlRefNetEntry[]> {
  return (await query<BlRNRow>('SELECT id, ts, target, result_count, cost FROM bl_ref_networks ORDER BY ts DESC LIMIT 20')).rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveBlRefNet(entry: BlRefNetEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO bl_ref_networks (id, ts, target, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.target, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getBlRefNetResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM bl_ref_networks WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Page Intersection ────────────────────────────────────────────

export interface BlPageIntEntry { id: string; ts: number; targets: string; count: number; cost?: number; }
type BlPIRow = { id: string; ts: number; targets: string; result_count: number; cost: number | null };
export async function getBlPageIntHistory(): Promise<BlPageIntEntry[]> {
  return (await query<BlPIRow>('SELECT id, ts, targets, result_count, cost FROM bl_page_intersection ORDER BY ts DESC LIMIT 20')).rows.map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveBlPageInt(entry: BlPageIntEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO bl_page_intersection (id, ts, targets, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, targets = EXCLUDED.targets, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getBlPageIntResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM bl_page_intersection WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Domain Intersection ──────────────────────────────────────────

export interface BlDomIntEntry { id: string; ts: number; target1: string; target2: string; count: number; cost?: number; }
type BlDIRow = { id: string; ts: number; target1: string; target2: string; result_count: number; cost: number | null };
export async function getBlDomIntHistory(): Promise<BlDomIntEntry[]> {
  return (await query<BlDIRow>('SELECT id, ts, target1, target2, result_count, cost FROM bl_domain_intersection ORDER BY ts DESC LIMIT 20')).rows.map((r) => ({ id: r.id, ts: r.ts, target1: r.target1, target2: r.target2, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveBlDomInt(entry: BlDomIntEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO bl_domain_intersection (id, ts, target1, target2, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target1 = EXCLUDED.target1, target2 = EXCLUDED.target2, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.target1, entry.target2, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getBlDomIntResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM bl_domain_intersection WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: History ───────────────────────────────────────────────────────

export interface BlHistEntry { id: string; ts: number; target: string; count: number; cost?: number; }
type BlHRow = { id: string; ts: number; target: string; result_count: number; cost: number | null };
export async function getBlHistHistory(): Promise<BlHistEntry[]> {
  return (await query<BlHRow>('SELECT id, ts, target, result_count, cost FROM bl_history ORDER BY ts DESC LIMIT 20')).rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveBlHist(entry: BlHistEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO bl_history (id, ts, target, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, target = EXCLUDED.target, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.target, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getBlHistResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM bl_history WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Bulk Backlinks ────────────────────────────────────────────────

export interface BlBulkBlEntry { id: string; ts: number; targets: string; count: number; cost?: number; }
type BlBBRow = { id: string; ts: number; targets: string; result_count: number; cost: number | null };
export async function getBlBulkBlHistory(): Promise<BlBulkBlEntry[]> {
  return (await query<BlBBRow>('SELECT id, ts, targets, result_count, cost FROM bl_bulk_backlinks ORDER BY ts DESC LIMIT 20')).rows.map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveBlBulkBl(entry: BlBulkBlEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO bl_bulk_backlinks (id, ts, targets, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, targets = EXCLUDED.targets, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getBlBulkBlResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM bl_bulk_backlinks WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Bulk Referring Domains ───────────────────────────────────────

export interface BlBulkRdEntry { id: string; ts: number; targets: string; count: number; cost?: number; }
type BlBRRow = { id: string; ts: number; targets: string; result_count: number; cost: number | null };
export async function getBlBulkRdHistory(): Promise<BlBulkRdEntry[]> {
  return (await query<BlBRRow>('SELECT id, ts, targets, result_count, cost FROM bl_bulk_ref_domains ORDER BY ts DESC LIMIT 20')).rows.map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}
export async function saveBlBulkRd(entry: BlBulkRdEntry, items: unknown[]): Promise<void> {
  await query('INSERT INTO bl_bulk_ref_domains (id, ts, targets, result_count, cost, items) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, targets = EXCLUDED.targets, result_count = EXCLUDED.result_count, cost = EXCLUDED.cost, items = EXCLUDED.items', [entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items)]);
}
export async function getBlBulkRdResults<T>(id: string): Promise<T[] | null> {
  const row = (await query<{ items: string }>('SELECT items FROM bl_bulk_ref_domains WHERE id = $1', [id])).rows[0];
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}
