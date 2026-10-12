import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import initSqlJs from 'sql.js';

// ── Parse cache ─────────────────────────────────────────────────────────────
// Each main.jsonl is keyed by (mtimeMs, size). If a file is unchanged since
// the last parse we reuse the cached Session instead of re-reading and
// re-parsing it, so repeated refreshes are near-instant. The cache is
// persisted to disk (globalStorage) so it survives VS Code restarts.

let parseCacheDir: string | undefined;
let parseCache: Record<string, { mtimeMs: number; size: number; session: Session | null }> = {};
let parseCacheLoaded = false;

/**
 * Set the directory used to persist the parse cache. Call once from
 * activate() with the extension's globalStoragePath.
 */
export function setParseCacheDir(dir: string): void {
  parseCacheDir = dir;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* ignore */ }
}

function parseCacheFile(): string {
  return path.join(parseCacheDir ?? os.tmpdir(), 'parse-cache.json');
}

function loadParseCache(): void {
  if (parseCacheLoaded) return;
  parseCacheLoaded = true;
  try {
    const raw = fs.readFileSync(parseCacheFile(), 'utf8');
    parseCache = JSON.parse(raw);
  } catch { /* no cache yet */ }
}

function saveParseCache(): void {
  if (!parseCacheDir) return;
  try {
    fs.writeFileSync(parseCacheFile(), JSON.stringify(parseCache));
  } catch { /* ignore */ }
}

function cachedSession(file: string, mtimeMs: number, size: number): Session | null | undefined {
  loadParseCache();
  const hit = parseCache[file];
  if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return hit.session;
  return undefined; // miss
}

function storeSession(file: string, mtimeMs: number, size: number, session: Session | null): void {
  parseCache[file] = { mtimeMs, size, session };
}

// ── Data model ──────────────────────────────────────────────────────────────

export interface LlmRequest {
  ts: number;          // epoch ms
  durMs: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  responseId: string;
}

export interface Session {
  sid: string;
  path: string;
  title: string;
  firstTs: number;
  lastTs: number;
  vscodeVersion: string;
  copilotVersion: string;
  requests: LlmRequest[];
  deleted?: boolean;
}

export interface SessionSummary {
  sid: string;
  title: string;
  deleted?: boolean;
  firstTs: number;
  lastTs: number;
  vscodeVersion: string;
  copilotVersion: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  models: { model: string; count: number }[];
  requests: LlmRequest[];
}

export interface UsageReport {
  generatedAt: number;
  days: number | null;   // null = all
  theme: string;
  chartType: string;     // bar | line | area
  chartMetric: string;   // total | stacked | requests
  chartLogScale: boolean;
  sessions: SessionSummary[];
  totals: {
    sessions: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
  };
}

// ── Log discovery ───────────────────────────────────────────────────────────

export function vscodeUserDir(): string {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Code', 'User');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'Code', 'User');
}

/**
 * Find all main.jsonl files across both (new and legacy) layouts.
 * If `root` is given, it is used as the "User" directory directly.
 */
export function findMainJsonlFiles(root?: string): string[] {
  const user = root ?? vscodeUserDir();
  const files: string[] = [];
  if (!fs.existsSync(user)) {
    return files;
  }

  // New layout: globalStorage/github.copilot-chat/debug-logs/<sid>/main.jsonl
  const newRoot = path.join(user, 'globalStorage', 'github.copilot-chat', 'debug-logs');
  if (fs.existsSync(newRoot) && fs.statSync(newRoot).isDirectory()) {
    for (const entry of safeReaddir(newRoot)) {
      const p = path.join(newRoot, entry, 'main.jsonl');
      if (fs.existsSync(p)) files.push(p);
    }
  }

  // Legacy layout: workspaceStorage/<hash>/GitHub.copilot-chat/debug-logs/<sid>/main.jsonl
  const wsRoot = path.join(user, 'workspaceStorage');
  if (fs.existsSync(wsRoot) && fs.statSync(wsRoot).isDirectory()) {
    for (const hash of safeReaddir(wsRoot)) {
      const oldRoot = path.join(wsRoot, hash, 'GitHub.copilot-chat', 'debug-logs');
      if (fs.existsSync(oldRoot) && fs.statSync(oldRoot).isDirectory()) {
        for (const entry of safeReaddir(oldRoot)) {
          const p = path.join(oldRoot, entry, 'main.jsonl');
          if (fs.existsSync(p)) files.push(p);
        }
      }
    }
  }

  return files;
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// ── Log parsing ─────────────────────────────────────────────────────────────

function asInt(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function parseSession(filePath: string): Session | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  return parseSessionContent(filePath, content);
}

// ── Live session detection (session-store.db) ───────────────────────────────

let sqlJsPromise: Promise<any> | undefined;

function getSqlJs(): Promise<any> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: () =>
        path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    });
  }
  return sqlJsPromise;
}

/**
 * Read the session ids VS Code still lists in its chat view.
 *
 * VS Code removes a row from the `sessions` table of `session-store.db`
 * when a session is deleted, but the debug-log directory stays on disk —
 * so "sid not in db" == "deleted from the chat list".
 *
 * Only the main db file is read (copied to a temp file first, so the live
 * VS Code database is never touched). Returns null when the db is missing
 * or unreadable; callers then skip deleted-marking entirely.
 */
export async function loadLiveSessionIds(): Promise<Set<string> | null> {
  const dbPath = path.join(
    vscodeUserDir(), 'globalStorage', 'github.copilot-chat', 'session-store.db',
  );
  if (!fs.existsSync(dbPath)) return null;
  const tmp = path.join(os.tmpdir(), `copilot-tokens-db-${process.pid}-${Date.now()}.db`);
  try {
    fs.copyFileSync(dbPath, tmp);
    const SQL = await getSqlJs();
    const db = new SQL.Database(fs.readFileSync(tmp));
    try {
      const res = db.exec('SELECT id FROM sessions');
      const ids = new Set<string>();
      if (res.length > 0) for (const row of res[0].values) ids.add(String(row[0]));
      return ids;
    } finally {
      db.close();
    }
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

/**
 * Load all sessions, dedupe by sid, filter by days (null = all), mark
 * sessions deleted from the VS Code chat list, and sort live sessions
 * first (newest lastTs first) with deleted ones grouped after.
 */
export async function loadSessions(
  root?: string,
  days: number | null = 7,
  onProgress?: (done: number, total: number) => void,
): Promise<Session[]> {
  const files = findMainJsonlFiles(root);

  // Skip files whose last write predates the window: they cannot contain
  // requests inside the window, so there is no need to read them at all.
  let candidates = files;
  if (days !== null) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    candidates = files.filter(f => {
      try {
        return fs.statSync(f).mtimeMs >= cutoff;
      } catch {
        return true;
      }
    });
  }

  // Read + parse unchanged files from the cache, changed files in parallel.
  const seen = new Map<string, Session>();
  const toParse: { file: string; mtimeMs: number; size: number }[] = [];
  for (const file of candidates) {
    let mtimeMs = 0, size = 0;
    try {
      const st = fs.statSync(file);
      mtimeMs = st.mtimeMs;
      size = st.size;
    } catch {
      continue;
    }
    const hit = cachedSession(file, mtimeMs, size);
    if (hit !== undefined) {
      if (hit && !seen.has(hit.sid)) seen.set(hit.sid, hit);
    } else {
      toParse.push({ file, mtimeMs, size });
    }
  }

  // Parse the changed files with bounded concurrency. Reading every file at
  // once (Promise.all over all files) can pull multiple GB into memory and
  // crash the extension host with an out-of-memory abort. A small window of
  // parallel reads keeps memory flat while still being much faster than
  // strictly sequential parsing. onProgress reports how many files are done
  // so the UI can show a progress bar.
  const CONCURRENCY = 2;
  const total = toParse.length;
  let done = 0;
  const parsed: (Session | null)[] = [];
  for (let i = 0; i < toParse.length; i += CONCURRENCY) {
    const chunk = toParse.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async ({ file, mtimeMs, size }) => {
        const s = await parseSessionAsync(file);
        storeSession(file, mtimeMs, size, s);
        return s;
      }),
    );
    parsed.push(...results);
    done += chunk.length;
    if (onProgress) onProgress(done, total);
  }
  for (const s of parsed) {
    if (s && !seen.has(s.sid)) seen.set(s.sid, s);
  }
  saveParseCache();

  let sessions = [...seen.values()];
  if (days !== null) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    sessions = sessions.filter(s => s.lastTs >= cutoff);
  }

  const live = await loadLiveSessionIds();
  if (live) for (const s of sessions) s.deleted = !live.has(s.sid);

  sessions.sort((a, b) =>
    Number(a.deleted ?? false) - Number(b.deleted ?? false) || b.lastTs - a.lastTs);
  return sessions;
}

/** Async variant of parseSession that reads the file off the event loop. */
async function parseSessionAsync(filePath: string): Promise<Session | null> {
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  return parseSessionContent(filePath, content);
}

/**
 * Parse a session from already-read file content. Extracted from
 * parseSession so both the sync and async paths share the same logic.
 */
function parseSessionContent(filePath: string, content: string): Session | null {
  const sid = path.basename(path.dirname(filePath));
  const sess: Session = {
    sid,
    path: filePath,
    title: '',
    firstTs: 0,
    lastTs: 0,
    vscodeVersion: '',
    copilotVersion: '',
    requests: [],
  };
  let titleTaken = false;

  // Iterate line by line without materializing a giant array of every line
  // (content.split(/\r?\n/) would double memory for multi-hundred-MB files).
  let start = 0;
  while (start < content.length) {
    let end = content.indexOf('\n', start);
    if (end === -1) end = content.length;
    let line = content.slice(start, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    start = end + 1;

    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev: any;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const etype: string = ev.type ?? '';
    const ts = asInt(ev.ts);
    const attrs: any = ev.attrs ?? {};

    if (ts) {
      sess.firstTs = sess.firstTs ? Math.min(sess.firstTs, ts) : ts;
      sess.lastTs = Math.max(sess.lastTs, ts);
    }

    if (etype === 'session_start') {
      sess.vscodeVersion = String(attrs.vscodeVersion ?? '');
      sess.copilotVersion = String(attrs.copilotVersion ?? '');
    } else if (etype === 'user_message' && !titleTaken) {
      let text = String(attrs.content ?? '').trim();
      if (text) {
        text = text.replace(/\s+/g, ' ');
        const m = text.match(/<userRequest>\s*([\s\S]+?)\s*<\/userRequest>/);
        if (m) text = m[1];
        sess.title = text.length > 60 ? text.slice(0, 60) + '…' : text;
        titleTaken = true;
      }
    } else if (etype === 'llm_request') {
      sess.requests.push({
        ts,
        durMs: asInt(ev.dur),
        model: String(attrs.model ?? ''),
        inputTokens: asInt(attrs.inputTokens),
        outputTokens: asInt(attrs.outputTokens),
        cachedTokens: asInt(attrs.cachedTokens),
        responseId: String(attrs.responseId ?? ''),
      });
    }
  }

  if (sess.requests.length === 0) return null;
  sess.requests.sort((a, b) => a.ts - b.ts);
  return sess;
}

// ── Aggregation ─────────────────────────────────────────────────────────────

export function summarize(sessions: Session[], days: number | null): UsageReport {
  const summaries: SessionSummary[] = sessions.map(s => {
    const inputTokens = s.requests.reduce((a, r) => a + r.inputTokens, 0);
    const outputTokens = s.requests.reduce((a, r) => a + r.outputTokens, 0);
    const cachedTokens = s.requests.reduce((a, r) => a + r.cachedTokens, 0);
    const modelCounts = new Map<string, number>();
    for (const r of s.requests) {
      const m = r.model || '?';
      modelCounts.set(m, (modelCounts.get(m) ?? 0) + 1);
    }
    return {
      sid: s.sid,
      title: s.title,
      deleted: s.deleted,
      firstTs: s.firstTs,
      lastTs: s.lastTs,
      vscodeVersion: s.vscodeVersion,
      copilotVersion: s.copilotVersion,
      requestCount: s.requests.length,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens,
      models: [...modelCounts.entries()]
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => b.count - a.count),
      requests: s.requests,
    };
  });

  return {
    generatedAt: Date.now(),
    days,
    theme: 'default',
    chartType: 'bar',
    chartMetric: 'total',
    chartLogScale: false,
    sessions: summaries,
    totals: {
      sessions: summaries.length,
      requests: summaries.reduce((a, s) => a + s.requestCount, 0),
      inputTokens: summaries.reduce((a, s) => a + s.inputTokens, 0),
      outputTokens: summaries.reduce((a, s) => a + s.outputTokens, 0),
      cachedTokens: summaries.reduce((a, s) => a + s.cachedTokens, 0),
      totalTokens: summaries.reduce((a, s) => a + s.totalTokens, 0),
    },
  };
}
