import { Strings } from './i18n';

/**
 * Build the webview HTML. All styling uses VS Code CSS variables so the
 * panel follows the active theme (light/dark/high-contrast).
 */
export function webviewHtml(strings: Strings, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    padding: 16px 20px 40px;
  }
  .header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .header h1 { font-size: 16px; font-weight: 600; margin-right: auto; }
  .controls { display: flex; align-items: center; gap: 8px; }
  select, button {
    font-family: inherit;
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-button-foreground, inherit);
    background: var(--vscode-button-background, #0e639c);
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: var(--vscode-border-radius, 2px);
    padding: 4px 12px;
    cursor: pointer;
  }
  select {
    background: var(--vscode-dropdown-background, #3c3c3c);
    color: var(--vscode-dropdown-foreground, inherit);
    border: 1px solid var(--vscode-dropdown-border, transparent);
    padding: 3px 6px;
  }
  button.secondary {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, inherit);
  }
  button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .card {
    background: var(--vscode-editorWidget-background, rgba(128,128,128,0.1));
    border: 1px solid var(--vscode-widget-border, transparent);
    border-radius: 6px;
    padding: 10px 12px;
  }
  .card .label { font-size: 11px; opacity: 0.7; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px; }
  .card .value { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .card.accent .value { color: var(--vscode-textLink-foreground, #3794ff); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 10px; white-space: nowrap; }
  th {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;
    opacity: 0.7; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
    position: sticky; top: 0; background: var(--vscode-sideBar-background, inherit);
  }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.session-row { cursor: pointer; }
  tr.session-row:hover td { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1)); }
  tr.session-row.open td { background: var(--vscode-list-activeSelectionBackground, rgba(128,128,128,0.2)); }
  .sid { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; opacity: 0.6; }
  .title-cell { max-width: 340px; overflow: hidden; text-overflow: ellipsis; }
  .models { font-size: 11px; opacity: 0.8; }
  .chev { display: inline-block; width: 12px; opacity: 0.7; transition: transform 0.12s; }
  tr.open .chev { transform: rotate(90deg); }
  tr.detail-row td {
    background: var(--vscode-editor-background, rgba(0,0,0,0.15));
    padding: 8px 12px 12px 34px;
    white-space: normal;
  }
  .detail-table { width: auto; margin-top: 4px; }
  .detail-table th { position: static; background: transparent; }
  .detail-table td, .detail-table th { padding: 3px 14px 3px 0; }
  .empty { text-align: center; padding: 48px 16px; opacity: 0.75; }
  .empty .hint { margin-top: 8px; font-size: 12px; max-width: 520px; margin-left: auto; margin-right: auto; line-height: 1.5; }
  .footer { margin-top: 20px; font-size: 11px; opacity: 0.5; text-align: right; }
  .toast {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: var(--vscode-notificationInformationBackground, #04395e);
    color: var(--vscode-notificationInformationForeground, #fff);
    padding: 6px 16px; border-radius: 4px; font-size: 12px;
    opacity: 0; transition: opacity 0.2s; pointer-events: none;
  }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
  <div class="header">
    <h1>${strings.title}</h1>
    <div class="controls">
      <label for="days">${strings.days}</label>
      <select id="days">
        <option value="7">7</option>
        <option value="30">30</option>
        <option value="90">90</option>
        <option value="all">${strings.all}</option>
      </select>
      <button id="refresh" class="secondary" title="${strings.refresh}">&#x21bb; ${strings.refresh}</button>
      <button id="export" class="secondary">${strings.exportJson}</button>
    </div>
  </div>

  <div class="cards" id="cards"></div>
  <div id="content"></div>
  <div class="footer" id="footer"></div>
  <div class="toast" id="toast"></div>

<script>
  const vscode = acquireVsCodeApi();
  const S = ${JSON.stringify(strings)};

  const fmt = n => n.toLocaleString();
  const fmtTime = ts => {
    if (!ts) return '-';
    const d = new Date(ts);
    const p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let report = null;
  let openSid = null;

  function send(msg) { vscode.postMessage(msg); }

  function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  function renderCards(t) {
    const items = [
      [S.sessions, fmt(t.sessions)],
      [S.requests, fmt(t.requests)],
      [S.input, fmt(t.inputTokens)],
      [S.output, fmt(t.outputTokens)],
      [S.cached, fmt(t.cachedTokens)],
      [S.total, fmt(t.totalTokens), true],
    ];
    document.getElementById('cards').innerHTML = items.map(([label, value, accent]) =>
      '<div class="card' + (accent ? ' accent' : '') + '"><div class="label">' + esc(label) +
      '</div><div class="value">' + esc(value) + '</div></div>'
    ).join('');
  }

  function renderTable() {
    const el = document.getElementById('content');
    if (!report || report.sessions.length === 0) {
      el.innerHTML = '<div class="empty"><div>' + esc(S.noData) + '</div><div class="hint">' + esc(S.noDataHint) + '</div></div>';
      return;
    }
    let html = '<table><thead><tr>' +
      '<th></th><th>' + esc(S.titleCol) + '</th><th>' + esc(S.time) + '</th>' +
      '<th class="num">' + esc(S.reqs) + '</th><th class="num">' + esc(S.input) + '</th>' +
      '<th class="num">' + esc(S.output) + '</th><th class="num">' + esc(S.cached) + '</th>' +
      '<th class="num">' + esc(S.total) + '</th><th>' + esc(S.model) + '</th>' +
      '</tr></thead><tbody>';
    for (const s of report.sessions) {
      const open = s.sid === openSid;
      html += '<tr class="session-row' + (open ? ' open' : '') + '" data-sid="' + esc(s.sid) + '">' +
        '<td><span class="chev">&#9656;</span></td>' +
        '<td class="title-cell" title="' + esc(s.title) + '">' + (esc(s.title) || '-') + '<div class="sid">' + esc(s.sid) + '</div></td>' +
        '<td>' + fmtTime(s.lastTs) + '</td>' +
        '<td class="num">' + fmt(s.requestCount) + '</td>' +
        '<td class="num">' + fmt(s.inputTokens) + '</td>' +
        '<td class="num">' + fmt(s.outputTokens) + '</td>' +
        '<td class="num">' + fmt(s.cachedTokens) + '</td>' +
        '<td class="num"><b>' + fmt(s.totalTokens) + '</b></td>' +
        '<td class="models">' + esc(s.models.map(m => m.model + (m.count > 1 ? ' ×' + m.count : '')).join(', ')) + '</td>' +
        '</tr>';
      if (open) html += detailRow(s);
    }
    html += '</tbody></table>';
    el.innerHTML = html;
    el.querySelectorAll('tr.session-row').forEach(tr => {
      tr.addEventListener('click', () => {
        openSid = openSid === tr.dataset.sid ? null : tr.dataset.sid;
        renderTable();
      });
    });
  }

  function detailRow(s) {
    const rows = s.requests.map(r =>
      '<tr><td>' + fmtTime(r.ts) + '</td><td>' + esc(r.model || '?') + '</td>' +
      '<td class="num">' + fmt(r.inputTokens) + '</td><td class="num">' + fmt(r.outputTokens) + '</td>' +
      '<td class="num">' + fmt(r.cachedTokens) + '</td><td class="num">' + (r.durMs ? (r.durMs / 1000).toFixed(1) + ' s' : '-') + '</td></tr>'
    ).join('');
    return '<tr class="detail-row"><td colspan="9"><div style="font-size:11px;opacity:0.7;margin-bottom:4px">' +
      esc(S.detail) + ' · ' + esc(s.sid) +
      (s.vscodeVersion ? ' · VS Code ' + esc(s.vscodeVersion) : '') +
      (s.copilotVersion ? ' · Copilot ' + esc(s.copilotVersion) : '') + '</div>' +
      '<table class="detail-table"><thead><tr><th>' + esc(S.time) + '</th><th>' + esc(S.model) + '</th>' +
      '<th class="num">' + esc(S.input) + '</th><th class="num">' + esc(S.output) + '</th>' +
      '<th class="num">' + esc(S.cached) + '</th><th class="num">' + esc(S.latency) + '</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></td></tr>';
  }

  function render() {
    if (!report) return;
    renderCards(report.totals);
    renderTable();
    document.getElementById('footer').textContent =
      S.version + ' · ' + new Date(report.generatedAt).toLocaleString();
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'report') {
      report = msg.report;
      openSid = null;
      document.getElementById('days').value = String(msg.report.days ?? 'all');
      render();
    } else if (msg.type === 'toast') {
      toast(msg.text);
    }
  });

  document.getElementById('days').addEventListener('change', e => {
    const v = e.target.value;
    send({ type: 'setDays', days: v === 'all' ? null : parseInt(v, 10) });
  });
  document.getElementById('refresh').addEventListener('click', () => send({ type: 'refresh' }));
  document.getElementById('export').addEventListener('click', () => send({ type: 'export' }));
</script>
</body>
</html>`;
}
