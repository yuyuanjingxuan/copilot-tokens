import * as vscode from 'vscode';
import { loadSessions, summarize, UsageReport, Session } from './parser';
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
let sessionCache: { sessions: Session[]; at: number } | undefined;
const SESSION_CACHE_TTL_MS = 30_000;

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
async function getSessions(force = false): Promise<Session[]> {
  if (!force && sessionCache && Date.now() - sessionCache.at < SESSION_CACHE_TTL_MS) {
    return sessionCache.sessions;
  }
  const sessions = await loadSessions(undefined, null);
  sessionCache = { sessions, at: Date.now() };
  return sessions;
}

async function buildReport(force = false): Promise<UsageReport> {
  const all = await getSessions(force);
  let sessions = all;
  if (currentDays !== null) {
    const cutoff = Date.now() - currentDays * 24 * 60 * 60 * 1000;
    sessions = all.filter(s => s.lastTs >= cutoff);
  }
  const report = summarize(sessions, currentDays);
  report.theme = currentTheme;
  report.chartType = currentChartType;
  report.chartMetric = currentChartMetric;
  return report;
}

async function pushReport(force = false): Promise<UsageReport | undefined> {
  const report = await buildReport(force);
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
      void pushReport();
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
  }
}

function startAutoRefresh(): void {
  stopAutoRefresh();
  const seconds = vscode.workspace.getConfiguration('copilotTokens').get<number>('autoRefresh', 60);
  if (seconds > 0) {
    refreshTimer = setInterval(() => void pushReport(true), seconds * 1000);
  }
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function ensurePanel(): vscode.WebviewPanel {
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
    const report = await buildReport();
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
    // Push now and a few times after: the page script may not be ready for the
    // first message, and the {type:'ready'} handler pushes again. The retries
    // guarantee the sidebar shows data even if the handshake is lost.
    for (const delay of [0, 500, 1500, 3000]) {
      setTimeout(() => void pushReport(), delay);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('copilotTokens');
  currentDays = cfg.get<number>('days', 7);
  currentTheme = cfg.get<string>('theme', 'default');
  currentChartType = cfg.get<string>('chartType', 'bar');
  currentChartMetric = cfg.get<string>('chartMetric', 'total');

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
    vscode.window.registerWebviewViewProvider('copilotTokens.view', new TokensViewProvider()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('copilotTokens.autoRefresh')) {
        startAutoRefresh();
      } else if (
        e.affectsConfiguration('copilotTokens.days') ||
        e.affectsConfiguration('copilotTokens.theme') ||
        e.affectsConfiguration('copilotTokens.chartType') ||
        e.affectsConfiguration('copilotTokens.chartMetric')
      ) {
        const c = vscode.workspace.getConfiguration('copilotTokens');
        currentDays = c.get<number>('days', 7);
        currentTheme = c.get<string>('theme', 'default');
        currentChartType = c.get<string>('chartType', 'bar');
        currentChartMetric = c.get<string>('chartMetric', 'total');
        void pushReport();
      }
    }),
  );

  startAutoRefresh();
  void pushReport();
}

export function deactivate(): void {
  stopAutoRefresh();
  panel?.dispose();
  panel = undefined;
}
