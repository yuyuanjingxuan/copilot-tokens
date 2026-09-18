import * as vscode from 'vscode';
import { loadSessions, summarize, UsageReport } from './parser';
import { getStrings, resolveLanguage, Lang } from './i18n';
import { webviewHtml } from './webview';

let panel: vscode.WebviewPanel | undefined;
let currentDays: number | null = 7;

function getLanguage(): Lang {
  const cfg = vscode.workspace.getConfiguration('copilotTokens');
  const setting = cfg.get<string>('language', 'auto');
  return resolveLanguage(setting, vscode.env.language);
}

function buildReport(): UsageReport {
  const sessions = loadSessions(undefined, currentDays);
  return summarize(sessions, currentDays);
}

function pushReport() {
  if (!panel) return;
  const report = buildReport();
  panel.webview.postMessage({ type: 'report', report });
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

  panel.webview.onDidReceiveMessage(msg => {
    switch (msg.type) {
      case 'setDays':
        currentDays = msg.days;
        pushReport();
        break;
      case 'refresh':
        pushReport();
        break;
      case 'export':
        void exportJson();
        break;
    }
  });

  panel.onDidDispose(() => { panel = undefined; });
  pushReport();
  return panel;
}

async function exportJson(): Promise<void> {
  const strings = getStrings(getLanguage());
  try {
    const report = buildReport();
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

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('copilotTokens');
  currentDays = cfg.get<number>('days', 7);

  context.subscriptions.push(
    vscode.commands.registerCommand('copilotTokens.show', () => {
      ensurePanel();
    }),
    vscode.commands.registerCommand('copilotTokens.refresh', () => {
      ensurePanel();
      pushReport();
    }),
    vscode.commands.registerCommand('copilotTokens.exportJson', () => {
      ensurePanel();
      void exportJson();
    }),
  );
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}
