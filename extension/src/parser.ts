import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
}

export interface SessionSummary {
  sid: string;
  title: string;
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

/**
 * Load all sessions, dedupe by sid, filter by days (null = all),
 * sort by lastTs descending.
 */
export function loadSessions(root?: string, days: number | null = 7): Session[] {
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
  sessions.sort((a, b) => b.lastTs - a.lastTs);
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
