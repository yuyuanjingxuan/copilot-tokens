import * as vscode from 'vscode';
import { loadSessions, summarize, UsageReport } from './parser';
import { getStrings, resolveLanguage, Lang } from './i18n';
import { webviewHtml } from './webview';

let panel: vscode.WebviewPanel | undefined;
let view: vscode.WebviewView | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let currentDays: number | null = 7;
let currentTheme: string = 'default';

/** Webviews whose page script has loaded (sent {type:'ready'}). */
const readyWebviews = new Set<vscode.Webview>();

function sendTo(webview: vscode.Webview | undefined, msg: unknown): void {
  if (webview && readyWebviews.has(webview)) void webview.postMessage(msg);
}

/**
 * Wire a webview: report pushes are only delivered after the page script
 * signals readiness (otherwise the first message is lost because the
 * inline <script> has not registered its message listener yet).
 */
function wireWebview(webview: vscode.Webview): void {
  webview.onDidReceiveMessage(msg => {
    if (msg.type === 'ready') {
      readyWebviews.add(webview);
      void pushReport();
      return;
    }
    handleMessage(msg);
  });
}

function getLanguage(): Lang {
  const cfg = vscode.workspace.getConfiguration('copilotTokens');
  const setting = cfg.get<string>('language', 'auto');
  return resolveLanguage(setting, vscode.env.language);
}

async function buildReport(): Promise<UsageReport> {
  const sessions = await loadSessions(undefined, currentDays);
  const report = summarize(sessions, currentDays);
  report.theme = currentTheme;
  return report;
}

async function pushReport(): Promise<UsageReport | undefined> {
  const report = await buildReport();
  sendTo(panel?.webview, { type: 'report', report });
  sendTo(view?.webview, { type: 'report', report });
  updateStatusBar(report);
  return report;
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
      void pushReport();
      break;
    case 'refresh': {
      void pushReport().then(report => {
        if (report) {
          const s = getStrings(getLanguage());
          const text = `${s.refreshed} · ${s.sessions} ${report.totals.sessions} · ${s.total} ${report.totals.totalTokens.toLocaleString()}`;
          sendTo(panel?.webview, { type: 'toast', text });
          sendTo(view?.webview, { type: 'toast', text });
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
    refreshTimer = setInterval(() => void pushReport(), seconds * 1000);
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
  const webview = panel.webview;
  webview.html = webviewHtml(strings, webview.cspSource);

  wireWebview(webview);

  panel.onDidDispose(() => {
    readyWebviews.delete(webview);
    panel = undefined;
  });
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
    sendTo(panel?.webview, { type: 'toast', text: strings.exportDone });
    sendTo(view?.webview, { type: 'toast', text: strings.exportDone });
  } catch {
    sendTo(panel?.webview, { type: 'toast', text: strings.exportFailed });
    sendTo(view?.webview, { type: 'toast', text: strings.exportFailed });
  }
}

class TokensViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    view = webviewView;
    const strings = getStrings(getLanguage());
    webviewView.webview.html = webviewHtml(strings, webviewView.webview.cspSource);
    wireWebview(webviewView.webview);
    webviewView.onDidDispose(() => {
      readyWebviews.delete(webviewView.webview);
      if (view === webviewView) view = undefined;
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('copilotTokens');
  currentDays = cfg.get<number>('days', 7);
  currentTheme = cfg.get<string>('theme', 'default');

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
      } else if (e.affectsConfiguration('copilotTokens.days') || e.affectsConfiguration('copilotTokens.theme')) {
        const c = vscode.workspace.getConfiguration('copilotTokens');
        currentDays = c.get<number>('days', 7);
        currentTheme = c.get<string>('theme', 'default');
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
