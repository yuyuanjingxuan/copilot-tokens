import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import initSqlJs from 'sql.js';

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

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
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
export async function loadSessions(root?: string, days: number | null = 7): Promise<Session[]> {
  const seen = new Map<string, Session>();
  for (const file of findMainJsonlFiles(root)) {
    const s = parseSession(file);
    if (s && !seen.has(s.sid)) seen.set(s.sid, s);
  }

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
