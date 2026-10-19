import * as vscode from 'vscode';
import { loadSessions, summarize, setParseCacheDir, UsageReport, Session } from './parser';
import { getStrings, resolveLanguage, Lang } from './i18n';
import { webviewHtml } from './webview';

let panel: vscode.WebviewPanel | undefined;
let view: vscode.WebviewView | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let currentDays: number | null = 7;
let currentTheme: string = 'default';
let currentChartType: string = 'bar';
let currentChartMetric: string = 'total';
let currentChartLogScale = false;
let disabled = false;
let sessionCache: { sessions: Session[]; at: number; days: number | null } | undefined;
const SESSION_CACHE_TTL_MS = 30_000;
// Monotonic id for report requests. pushReport() can be called concurrently
// (initial sidebar retries, window switches, auto-refresh); only the most
// recent request may post its result, otherwise a stale report can overwrite
// a newer one (e.g. switching 7d -> 14d then seeing 7d data again).
let reportSeq = 0;

function getLanguage(): Lang {
  const cfg = vscode.workspace.getConfiguration('copilotTokens');
  const setting = cfg.get<string>('language', 'auto');
  return resolveLanguage(setting, vscode.env.language);
}

/**
 * Parsed sessions are cached for a short TTL. Re-reading and re-parsing
 * every main.jsonl on disk for a pure display change (chart type, metric,
 * theme) is what made switching feel laggy; only days changes, explicit
 * refresh, and the auto-refresh timer force a reload from disk.
 */
async function getSessions(
  days: number | null,
  force = false,
  onProgress?: (done: number, total: number) => void,
): Promise<Session[]> {
  // The cache is keyed by window (days) as well as time: a force=false request
  // must never reuse sessions parsed for a different window, otherwise a
  // concurrent request (e.g. a sidebar retry) can post a report labelled 14d
  // but containing 7d data.
  if (
    !force &&
    sessionCache &&
    sessionCache.days === days &&
    Date.now() - sessionCache.at < SESSION_CACHE_TTL_MS
  ) {
    return sessionCache.sessions;
  }
  // Pass days so loadSessions can skip files whose mtime predates the
  // window. Passing null would force reading every log file (potentially GBs)
  // and blow up memory. summarize() still filters precisely by request ts.
  const sessions = await loadSessions(undefined, days, onProgress);
  sessionCache = { sessions, at: Date.now(), days };
  return sessions;
}

async function buildReport(
  days: number | null,
  force = false,
  onProgress?: (done: number, total: number) => void,
): Promise<UsageReport> {
  const all = await getSessions(days, force, onProgress);
  // summarize() filters requests by timestamp inside the selected window, so
  // the chart and totals never include data outside the range.
  const report = summarize(all, days);
  report.theme = currentTheme;
  report.chartType = currentChartType;
  report.chartMetric = currentChartMetric;
  report.chartLogScale = currentChartLogScale;
  return report;
}

async function pushReport(force = false): Promise<UsageReport | undefined> {
  // Snapshot the window at request time so a concurrent window switch can't
  // change what this request computes, and take a monotonic id so only the
  // most recent request posts its result (stale reports are dropped).
  const days = currentDays;
  const seq = ++reportSeq;
  const daysLabel = days === null ? 'all' : String(days);
  const loadingMsg = { type: 'loading', days: daysLabel };
  if (panel) panel.webview.postMessage(loadingMsg);
  if (view) view.webview.postMessage(loadingMsg);

  const report = await buildReport(days, force, (done, total) => {
    if (seq !== reportSeq) return; // a newer request superseded this one
    const msg = { type: 'loading', days: daysLabel, done, total };
    if (panel) panel.webview.postMessage(msg);
    if (view) view.webview.postMessage(msg);
  });
  if (seq !== reportSeq) return report; // stale — a newer request won
  if (panel) panel.webview.postMessage({ type: 'report', report });
  if (view) view.webview.postMessage({ type: 'report', report });
  updateStatusBar(report);
  return report;
}

/**
 * Wire a webview's message handler. When the page script finishes loading it
 * sends {type:'ready'}; we push a fresh report in response so the first paint
 * has data. Reports are also pushed unconditionally on every refresh, so a
 * missed handshake can never leave a view blank.
 */
function wireWebview(webview: vscode.Webview): void {
  webview.onDidReceiveMessage(msg => {
    if (msg.type === 'ready') {
      void pushReport();
      return;
    }
    handleMessage(msg);
  });
}

function updateStatusBar(report: UsageReport): void {
  if (!statusBar) return;
  const s = getStrings(getLanguage());
  const t = report.totals;
  statusBar.text = `$(zap) ${t.totalTokens.toLocaleString()}`;
  statusBar.tooltip =
    `${s.title}\n` +
    `${s.sessions}: ${t.sessions}   ${s.requests}: ${t.requests}\n` +
    `${s.total}: ${t.totalTokens.toLocaleString()} (${report.days === null ? s.all : report.days + 'd'})`;
  statusBar.show();
}

function handleMessage(msg: any): void {
  switch (msg.type) {
    case 'setDays':
      currentDays = msg.days;
      // Persist so the choice survives a restart. Writing the config fires
      // onDidChangeConfiguration, which re-reads days and pushes a fresh
      // report (force reload so the new window re-runs mtime-skip and shows
      // real parse progress).
      vscode.workspace.getConfiguration('copilotTokens').update('days', msg.days, true);
      break;
    case 'setTheme':
      currentTheme = msg.theme;
      vscode.workspace.getConfiguration('copilotTokens').update('theme', msg.theme, true);
      break; // webview applies the theme locally; no re-parse needed
    case 'setChart':
      currentChartType = msg.chartType;
      currentChartMetric = msg.chartMetric;
      vscode.workspace.getConfiguration('copilotTokens').update('chartType', msg.chartType, true);
      vscode.workspace.getConfiguration('copilotTokens').update('chartMetric', msg.chartMetric, true);
      break; // webview re-renders the chart locally; no re-parse needed
    case 'setChartLog':
      currentChartLogScale = msg.log;
      vscode.workspace.getConfiguration('copilotTokens').update('chartLogScale', msg.log, true);
      break; // webview re-renders the chart locally; no re-parse needed
    case 'refresh': {
      void pushReport(true).then(report => {
        if (report) {
          const s = getStrings(getLanguage());
          const text = `${s.refreshed} · ${s.sessions} ${report.totals.sessions} · ${s.total} ${report.totals.totalTokens.toLocaleString()}`;
          panel?.webview.postMessage({ type: 'toast', text });
          view?.webview.postMessage({ type: 'toast', text });
        }
      });
      break;
    }
    case 'export':
      void exportJson();
      break;
    case 'exportCsv':
      void exportCsv();
      break;
  }
}

function startAutoRefresh(): void {
  stopAutoRefresh();
  if (disabled) return;
  const seconds = vscode.workspace.getConfiguration('copilotTokens').get<number>('autoRefresh', 60);
  if (seconds > 0) {
    refreshTimer = setInterval(() => {
      // Only refresh while a view is actually open; otherwise there is
      // nothing to update and we avoid background parsing entirely.
      if (panel || view) void pushReport(true);
    }, seconds * 1000);
  }
}

/**
 * Disable stops all background activity: the auto-refresh timer, the
 * status bar item, and the full-width panel. The extension stays loaded
 * (VS Code cannot disable an extension from inside itself) but does no
 * work until re-enabled. Enable restores everything.
 */
function setDisabled(value: boolean): void {
  disabled = value;
  if (value) {
    stopAutoRefresh();
    if (panel) {
      panel.dispose();
      panel = undefined;
    }
    statusBar?.hide();
  } else {
    statusBar?.show();
    startAutoRefresh();
    void pushReport();
  }
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function ensurePanel(): vscode.WebviewPanel {
  // Opening the panel is always allowed, even while disabled: the sidebar
  // view (resolveWebviewView) also opens when disabled, so Show Usage should
  // behave the same instead of erroring. Disable only stops background work
  // (auto-refresh, status bar); it does not block the user from viewing data.
  if (panel) {
    panel.reveal();
    return panel;
  }
  const strings = getStrings(getLanguage());
  panel = vscode.window.createWebviewPanel(
    'copilotTokens',
    strings.title,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = webviewHtml(strings, panel.webview.cspSource);

  wireWebview(panel.webview);

  panel.onDidDispose(() => { panel = undefined; });
  pushReport();
  return panel;
}

async function exportJson(): Promise<void> {
  const strings = getStrings(getLanguage());
  try {
    const report = await buildReport(currentDays);
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          ? `${vscode.workspace.workspaceFolders[0].uri.fsPath}/copilot-tokens-${new Date().toISOString().slice(0, 10)}.json`
          : `copilot-tokens-${new Date().toISOString().slice(0, 10)}.json`,
      ),
      filters: { JSON: ['json'] },
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(report, null, 2), 'utf8'));
    panel?.webview.postMessage({ type: 'toast', text: strings.exportDone });
  } catch {
    panel?.webview.postMessage({ type: 'toast', text: strings.exportFailed });
  }
}

/** Escape a value for a CSV cell (quote if it contains comma/quote/newline). */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCsv(): Promise<void> {
  const strings = getStrings(getLanguage());
  try {
    const report = await buildReport(currentDays);
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          ? `${vscode.workspace.workspaceFolders[0].uri.fsPath}/copilot-tokens-${new Date().toISOString().slice(0, 10)}.csv`
          : `copilot-tokens-${new Date().toISOString().slice(0, 10)}.csv`,
      ),
      filters: { CSV: ['csv'] },
    });
    if (!uri) return;

    const header = [
      'session', 'title', 'deleted', 'first_ts', 'last_ts',
      'vscode_version', 'copilot_version', 'requests',
      'input_tokens', 'output_tokens', 'cached_tokens', 'total_tokens',
      'models',
    ];
    const rows = report.sessions.map(s => [
      s.sid, s.title, s.deleted ? '1' : '0', s.firstTs, s.lastTs,
      s.vscodeVersion, s.copilotVersion, s.requestCount,
      s.inputTokens, s.outputTokens, s.cachedTokens, s.totalTokens,
      s.models.map(m => `${m.model}(${m.count})`).join('; '),
    ]);
    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    await vscode.workspace.fs.writeFile(uri, Buffer.from('\ufeff' + csv, 'utf8'));
    panel?.webview.postMessage({ type: 'toast', text: strings.csvDone });
  } catch {
    panel?.webview.postMessage({ type: 'toast', text: strings.csvFailed });
  }
}

class TokensViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    // WebviewView's webview already exists here and enableScripts defaults to
    // false: static HTML renders but <script> is silently NOT executed. It
    // must be enabled on the options BEFORE assigning html.
    webviewView.webview.options = { enableScripts: true };
    view = webviewView;
    const strings = getStrings(getLanguage());
    webviewView.webview.html = webviewHtml(strings, webviewView.webview.cspSource);
    wireWebview(webviewView.webview);
    webviewView.onDidDispose(() => {
      if (view === webviewView) view = undefined;
    });
    // Push now and once more shortly after: the page script may not be ready
    // for the first message, and the {type:'ready'} handler pushes again. The
    // retry guarantees the sidebar shows data even if the handshake is lost.
    // pushReport() is race-guarded, so a stale retry can never overwrite a
    // newer report (e.g. after the user switches the time window).
    for (const delay of [0, 1500]) {
      setTimeout(() => void pushReport(), delay);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  // Persist the parse cache under globalStorage so repeated loads (and loads
  // across restarts) reuse already-parsed sessions instead of re-reading logs.
  setParseCacheDir(context.globalStorageUri.fsPath);

  const cfg = vscode.workspace.getConfiguration('copilotTokens');
  currentDays = cfg.get<number>('days', 7);
  currentTheme = cfg.get<string>('theme', 'default');
  currentChartType = cfg.get<string>('chartType', 'bar');
  currentChartMetric = cfg.get<string>('chartMetric', 'total');
  currentChartLogScale = cfg.get<boolean>('chartLogScale', false);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'copilotTokens.show';
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('copilotTokens.show', () => {
      ensurePanel();
    }),
    vscode.commands.registerCommand('copilotTokens.refresh', () => {
      ensurePanel();
      void pushReport();
    }),
    vscode.commands.registerCommand('copilotTokens.exportJson', () => {
      ensurePanel();
      void exportJson();
    }),
    vscode.commands.registerCommand('copilotTokens.exportCsv', () => {
      ensurePanel();
      void exportCsv();
    }),
    vscode.commands.registerCommand('copilotTokens.disable', () => {
      setDisabled(true);
      vscode.window.showInformationMessage(getStrings(getLanguage()).disabledMsg);
    }),
    vscode.commands.registerCommand('copilotTokens.enable', () => {
      setDisabled(false);
      vscode.window.showInformationMessage(getStrings(getLanguage()).enabledMsg);
    }),
    vscode.window.registerWebviewViewProvider('copilotTokens.view', new TokensViewProvider()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('copilotTokens.autoRefresh')) {
        startAutoRefresh();
        return;
      }
      // Only re-read the window when the days setting itself changed. The
      // other chart settings (theme/type/metric/log) are updated live from the
      // webview and must NOT clobber currentDays, which the user sets via the
      // dropdown (in-memory, not persisted). Re-reading days here on every
      // chart setting change would reset a 14d selection back to the default 7.
      if (e.affectsConfiguration('copilotTokens.days')) {
        currentDays = vscode.workspace.getConfiguration('copilotTokens').get<number>('days', 7);
        // Force a reload so the new window re-runs mtime-skip and shows real
        // parse progress; the 30s session cache would otherwise return stale
        // sessions instantly with no progress feedback.
        void pushReport(true);
        return;
      }
      if (
        e.affectsConfiguration('copilotTokens.theme') ||
        e.affectsConfiguration('copilotTokens.chartType') ||
        e.affectsConfiguration('copilotTokens.chartMetric') ||
        e.affectsConfiguration('copilotTokens.chartLogScale')
      ) {
        const c = vscode.workspace.getConfiguration('copilotTokens');
        currentTheme = c.get<string>('theme', 'default');
        currentChartType = c.get<string>('chartType', 'bar');
        currentChartMetric = c.get<string>('chartMetric', 'total');
        currentChartLogScale = c.get<boolean>('chartLogScale', false);
        // No re-parse needed for pure display settings; the webview already
        // re-renders locally. Avoid pushing a report that could race.
      }
    }),
  );

  startAutoRefresh();
  // Lazy first parse: do NOT parse here. Parsing only happens once the panel
  // or sidebar is actually opened (ensurePanel / resolveWebviewView / ready),
  // so activation stays fast even with many log files.
}

export function deactivate(): void {
  stopAutoRefresh();
  panel?.dispose();
  panel = undefined;
}
