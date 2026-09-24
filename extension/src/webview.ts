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
  :root {
    color-scheme: light dark;
    --ct-bg: var(--vscode-editor-background, transparent);
    --ct-fg: var(--vscode-foreground, inherit);
    --ct-card-bg: var(--vscode-editorWidget-background, rgba(128,128,128,0.1));
    --ct-border: var(--vscode-widget-border, rgba(128,128,128,0.3));
    --ct-btn-bg: var(--vscode-button-background, #0e639c);
    --ct-btn-fg: var(--vscode-button-foreground, #fff);
    --ct-btn-hover: var(--vscode-button-hoverBackground, #1177bb);
    --ct-btn2-bg: var(--vscode-button-secondaryBackground, #3a3d41);
    --ct-btn2-fg: var(--vscode-button-secondaryForeground, #fff);
    --ct-btn2-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
    --ct-dd-bg: var(--vscode-dropdown-background, #3c3c3c);
    --ct-dd-fg: var(--vscode-dropdown-foreground, inherit);
    --ct-hover: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
    --ct-active: var(--vscode-list-inactiveSelectionBackground, rgba(128,128,128,0.25));
    --ct-detail-bg: var(--vscode-editor-background, rgba(0,0,0,0.15));
    --ct-th-bg: var(--vscode-sideBar-background, inherit);
    --ct-accent: var(--vscode-textLink-foreground, #3794ff);
    --ct-toast-bg: var(--vscode-notificationInformationBackground, #04395e);
    --ct-toast-fg: var(--vscode-notificationInformationForeground, #fff);
  }
  body[data-theme="green"] {
    --ct-bg: #0d1512; --ct-fg: #d1e3d8;
    --ct-card-bg: #13201a; --ct-border: #23402f;
    --ct-btn-bg: #1f884d; --ct-btn-fg: #ffffff; --ct-btn-hover: #27a35d;
    --ct-btn2-bg: #1d2b23; --ct-btn2-fg: #d1e3d8; --ct-btn2-hover: #2a3d31;
    --ct-dd-bg: #182a20; --ct-dd-fg: #d1e3d8;
    --ct-hover: #1b3326; --ct-active: #244634;
    --ct-detail-bg: #0a120e; --ct-th-bg: #101c16;
    --ct-accent: #4ade80;
    --ct-toast-bg: #14532d; --ct-toast-fg: #dcfce7;
  }
  body[data-theme="purple"] {
    --ct-bg: #14101d; --ct-fg: #e0d8ee;
    --ct-card-bg: #1d1729; --ct-border: #372a52;
    --ct-btn-bg: #7c3aed; --ct-btn-fg: #ffffff; --ct-btn-hover: #8b5cf6;
    --ct-btn2-bg: #262033; --ct-btn2-fg: #e0d8ee; --ct-btn2-hover: #332a44;
    --ct-dd-bg: #221b30; --ct-dd-fg: #e0d8ee;
    --ct-hover: #2b2340; --ct-active: #3a2f55;
    --ct-detail-bg: #100c17; --ct-th-bg: #181224;
    --ct-accent: #a78bfa;
    --ct-toast-bg: #3b0764; --ct-toast-fg: #ede9fe;
  }
  body[data-theme="orange"] {
    --ct-bg: #1a140d; --ct-fg: #ead9c4;
    --ct-card-bg: #241c11; --ct-border: #4a3a1f;
    --ct-btn-bg: #b45309; --ct-btn-fg: #ffffff; --ct-btn-hover: #d97706;
    --ct-btn2-bg: #2b2317; --ct-btn2-fg: #ead9c4; --ct-btn2-hover: #3a2f1e;
    --ct-dd-bg: #271f12; --ct-dd-fg: #ead9c4;
    --ct-hover: #33291a; --ct-active: #4a3a1f;
    --ct-detail-bg: #140f09; --ct-th-bg: #1d1710;
    --ct-accent: #fbbf24;
    --ct-toast-bg: #78350f; --ct-toast-fg: #fef3c7;
  }
  body[data-theme="red"] {
    --ct-bg: #1a0f10; --ct-fg: #ecd8d8;
    --ct-card-bg: #241517; --ct-border: #4a2528;
    --ct-btn-bg: #b91c1c; --ct-btn-fg: #ffffff; --ct-btn-hover: #dc2626;
    --ct-btn2-bg: #2b1d1e; --ct-btn2-fg: #ecd8d8; --ct-btn2-hover: #3a2628;
    --ct-dd-bg: #27181a; --ct-dd-fg: #ecd8d8;
    --ct-hover: #332123; --ct-active: #4a2a2d;
    --ct-detail-bg: #140b0c; --ct-th-bg: #1d1213;
    --ct-accent: #f87171;
    --ct-toast-bg: #7f1d1d; --ct-toast-fg: #fee2e2;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--ct-fg);
    background: var(--ct-bg);
    padding: 16px 20px 40px;
  }
  .header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .header h1 { font-size: 16px; font-weight: 600; margin-right: auto; }
  .controls { display: flex; align-items: center; gap: 8px; }
  select, button {
    font-family: inherit;
    font-size: var(--vscode-font-size, 13px);
    color: var(--ct-btn-fg);
    background: var(--ct-btn-bg);
    border: 1px solid transparent;
    border-radius: var(--vscode-border-radius, 2px);
    padding: 4px 12px;
    cursor: pointer;
  }
  select {
    background: var(--ct-dd-bg);
    color: var(--ct-dd-fg);
    border: 1px solid var(--ct-border);
    padding: 3px 6px;
  }
  button.secondary {
    background: var(--ct-btn2-bg);
    color: var(--ct-btn2-fg);
  }
  button:hover { background: var(--ct-btn-hover); }
  button.secondary:hover { background: var(--ct-btn2-hover); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .card {
    background: var(--ct-card-bg);
    border: 1px solid var(--ct-border);
    border-radius: 6px;
    padding: 10px 12px;
  }
  .card .label { font-size: 11px; opacity: 0.7; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px; }
  .card .value { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .card.accent { border-left: 3px solid var(--ct-accent); }
  .card.accent .value { color: var(--ct-accent); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 10px; white-space: nowrap; }
  th {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;
    opacity: 0.7; border-bottom: 1px solid var(--ct-border);
    position: sticky; top: 0; background: var(--ct-th-bg);
  }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.session-row { cursor: pointer; }
  tr.session-row:hover td { background: var(--ct-hover); }
  tr.session-row.open td { background: var(--ct-active); }
  tr.session-row.deleted td { opacity: 0.55; }
  tr.group-row td {
    padding: 10px 10px 4px;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;
    opacity: 0.6; border-bottom: 1px solid var(--ct-border);
  }
  .badge {
    display: inline-block; margin-left: 6px; padding: 0 6px;
    font-size: 10px; border-radius: 8px; vertical-align: 1px;
    background: var(--ct-btn2-bg); color: var(--ct-btn2-fg);
    border: 1px solid var(--ct-border);
  }
  .sid { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; opacity: 0.6; }
  .title-cell { max-width: 340px; overflow: hidden; text-overflow: ellipsis; }
  .models { font-size: 11px; opacity: 0.8; }
  .chev { display: inline-block; width: 12px; opacity: 0.7; transition: transform 0.12s; }
  tr.open .chev { transform: rotate(90deg); }
  tr.detail-row td {
    background: var(--ct-detail-bg);
    padding: 8px 12px 12px 34px;
    white-space: normal;
  }
  .detail-table { width: auto; margin-top: 4px; }
  .detail-table th { position: static; background: transparent; }
  .detail-table td, .detail-table th { padding: 3px 14px 3px 0; }
  .chart-wrap { margin-bottom: 18px; }
  .chart-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  .chart-head .chart-title { font-size: 12px; font-weight: 600; opacity: 0.8; margin-right: auto; }
  .chart-log { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; opacity: 0.8; cursor: pointer; }
  .chart-log input { accent-color: var(--ct-accent); margin: 0; }
  .chart-legend { display: flex; align-items: center; font-size: 11px; opacity: 0.8; }
  .chart-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin: 0 4px 0 10px; }
  .chart-box {
    background: var(--ct-card-bg);
    border: 1px solid var(--ct-border);
    border-radius: 6px;
    padding: 10px 12px 6px;
    position: relative;
  }
  .chart-box svg { display: block; width: 100%; height: auto; }
  .chart-tip {
    position: absolute; pointer-events: none; z-index: 5;
    background: var(--ct-card-bg);
    border: 1px solid var(--ct-border);
    border-radius: 4px; padding: 6px 10px;
    font-size: 11px; line-height: 1.5; white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    opacity: 0; transition: opacity 0.1s;
  }
  .chart-tip.show { opacity: 1; }
  .chart-tip .tip-date { font-weight: 600; margin-bottom: 2px; }
  .chart-tip .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 0; }
  .chart-empty { text-align: center; padding: 24px 16px; opacity: 0.6; font-size: 12px; }
  .empty { text-align: center; padding: 48px 16px; opacity: 0.75; }
  .empty .hint { margin-top: 8px; font-size: 12px; max-width: 520px; margin-left: auto; margin-right: auto; line-height: 1.5; }
  .footer { margin-top: 20px; font-size: 11px; opacity: 0.5; text-align: right; }
  .toast {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: var(--ct-toast-bg);
    color: var(--ct-toast-fg);
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
      <label for="theme">${strings.theme}</label>
      <select id="theme">
        <option value="default">Default</option>
        <option value="green">Green</option>
        <option value="purple">Purple</option>
        <option value="orange">Orange</option>
        <option value="red">Red</option>
      </select>
      <button id="refresh" class="secondary" title="${strings.refresh}">&#x21bb; ${strings.refresh}</button>
      <button id="export" class="secondary">${strings.exportJson}</button>
    </div>
  </div>

  <div class="cards" id="cards"></div>

  <div class="chart-wrap">
    <div class="chart-head">
      <span class="chart-title">${strings.chart}</span>
      <label for="chartType">${strings.chartType}</label>
      <select id="chartType">
        <option value="bar">${strings.chartBar}</option>
        <option value="line">${strings.chartLine}</option>
        <option value="area">${strings.chartArea}</option>
      </select>
      <label for="chartMetric">${strings.chartMetric}</label>
      <select id="chartMetric">
        <option value="total">${strings.chartTotal}</option>
        <option value="stacked">${strings.chartStacked}</option>
        <option value="requests">${strings.chartRequests}</option>
      </select>
      <label class="chart-log" for="chartLogScale"><input type="checkbox" id="chartLogScale"> ${strings.chartLogScale}</label>
      <div class="chart-legend" id="chartLegend"></div>
    </div>
    <div class="chart-box" id="chartBox"></div>
  </div>

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
  let chartType = 'bar';
  let chartMetric = 'total';
  let chartLogScale = false;

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
    let prevDeleted = null;
    for (const s of report.sessions) {
      const del = !!s.deleted;
      if (prevDeleted !== null && del !== prevDeleted) {
        html += '<tr class="group-row"><td colspan="9">' + esc(S.deletedGroup) + '</td></tr>';
      }
      prevDeleted = del;
      const open = s.sid === openSid;
      html += '<tr class="session-row' + (open ? ' open' : '') + (del ? ' deleted' : '') + '" data-sid="' + esc(s.sid) + '">' +
        '<td><span class="chev">&#9656;</span></td>' +
        '<td class="title-cell" title="' + esc(s.title) + '">' + (esc(s.title) || '-') + (del ? '<span class="badge">' + esc(S.deleted) + '</span>' : '') + '<div class="sid">' + esc(s.sid) + '</div></td>' +
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
    const rows = (s.requests || []).map(r =>
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

  // ── Daily usage chart ─────────────────────────────────────────────────────
  const C_IN = '#3b82f6';   // input / requests
  const C_OUT = '#f59e0b';  // output
  const C_TOTAL = 'var(--ct-accent)';

  function dayKey(ts) {
    const d = new Date(ts);
    const p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function fmtShortDate(key) {
    // 'YYYY-MM-DD' -> 'MM-DD' (year shown in tooltip)
    return key.slice(5);
  }

  function fmtLongDate(key) {
    const d = new Date(key + 'T00:00:00');
    const p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /** Aggregate all requests into per-day buckets. */
  function buildDaily() {
    const map = new Map();
    for (const s of report.sessions) {
      for (const r of (s.requests || [])) {
        if (!r.ts) continue;
        const k = dayKey(r.ts);
        let b = map.get(k);
        if (!b) { b = { key: k, input: 0, output: 0, requests: 0 }; map.set(k, b); }
        b.input += r.inputTokens || 0;
        b.output += r.outputTokens || 0;
        b.requests += 1;
      }
    }
    const days = [...map.values()].sort((a, b) => a.key < b.key ? -1 : 1);
    // Fill gaps so the x-axis is continuous (missing days = zero).
    if (days.length >= 2) {
      const filled = [];
      const start = new Date(days[0].key + 'T00:00:00');
      const end = new Date(days[days.length - 1].key + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = dayKey(d.getTime());
        filled.push(map.get(k) || { key: k, input: 0, output: 0, requests: 0 });
      }
      return filled;
    }
    return days;
  }

  /** For very long windows (>180 days) aggregate into weeks. */
  function maybeWeekly(daily) {
    if (daily.length <= 180) return { buckets: daily, weekly: false };
    const byWeek = new Map();
    for (const b of daily) {
      const d = new Date(b.key + 'T00:00:00');
      const day = (d.getDay() + 6) % 7; // Monday = 0
      const monday = new Date(d); monday.setDate(d.getDate() - day);
      const k = dayKey(monday.getTime());
      let w = byWeek.get(k);
      if (!w) { w = { key: k, input: 0, output: 0, requests: 0 }; byWeek.set(k, w); }
      w.input += b.input; w.output += b.output; w.requests += b.requests;
    }
    return { buckets: [...byWeek.values()].sort((a, b) => a.key < b.key ? -1 : 1), weekly: true };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  function fmtAxis(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + 'k';
    return String(Math.round(v));
  }

  function renderChart() {
    const box = document.getElementById('chartBox');
    if (!report || report.sessions.length === 0) {
      box.innerHTML = '<div class="chart-empty">' + esc(S.noData) + '</div>';
      return;
    }
    const { buckets, weekly } = maybeWeekly(buildDaily());
    if (buckets.length === 0) {
      box.innerHTML = '<div class="chart-empty">' + esc(S.noData) + '</div>';
      return;
    }

    const W = 760, H = 200, padL = 46, padR = 10, padT = 12, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = buckets.length;
    const slot = plotW / n;
    const barW = Math.max(2, Math.min(slot * 0.7, 40));

    // Per-bucket values by metric.
    const vals = buckets.map(b => {
      if (chartMetric === 'requests') return { total: b.requests, input: b.requests, output: 0 };
      return { total: b.input + b.output, input: b.input, output: b.output };
    });
    const maxV = niceMax(Math.max(...vals.map(v => v.total)));
    const logScale = chartLogScale;
    const axisMax = logScale
      ? Math.pow(10, Math.max(1, Math.ceil(Math.log10(Math.max(maxV, 1)))))
      : maxV;
    const y = v => logScale
      ? padT + plotH - (Math.log10(Math.max(v, 1)) / Math.log10(axisMax)) * plotH
      : padT + plotH - (v / axisMax) * plotH;
    const x = i => padL + slot * i + slot / 2;

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';

    // Gridlines + y-axis labels (powers of 10 for log scale, 4 divisions otherwise).
    const gridVals = logScale
      ? Array.from({ length: Math.log10(axisMax) + 1 }, (_, p) => Math.pow(10, p))
      : [0, 1, 2, 3, 4].map(g => (axisMax / 4) * g);
    for (const gv of gridVals) {
      const gy = y(gv);
      svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="var(--ct-border)" stroke-width="1" opacity="0.5"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (gy + 3) + '" text-anchor="end" font-size="9" fill="var(--ct-fg)" opacity="0.6">' + fmtAxis(gv) + '</text>';
    }

    // X-axis labels: show at most ~8.
    const labelEvery = Math.max(1, Math.ceil(n / 8));
    for (let i = 0; i < n; i++) {
      if (i % labelEvery !== 0 && i !== n - 1) continue;
      svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="var(--ct-fg)" opacity="0.6">' + fmtShortDate(buckets[i].key) + '</text>';
    }

    // Series.
    if (chartType === 'bar') {
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        const bx = x(i) - barW / 2;
        if (chartMetric === 'stacked') {
          const hIn = (padT + plotH) - y(v.input);
          const hOut = y(v.input) - y(v.total);
          svg += '<rect x="' + bx + '" y="' + y(v.input) + '" width="' + barW + '" height="' + hIn + '" fill="' + C_IN + '" rx="1"/>';
          svg += '<rect x="' + bx + '" y="' + y(v.total) + '" width="' + barW + '" height="' + hOut + '" fill="' + C_OUT + '" rx="1"/>';
        } else {
          svg += '<rect x="' + bx + '" y="' + y(v.total) + '" width="' + barW + '" height="' + ((padT + plotH) - y(v.total)) + '" fill="' + (chartMetric === 'requests' ? C_IN : C_TOTAL) + '" rx="1"/>';
        }
      }
    } else {
      // line / area — the "Input + Output" metric draws both series
      const drawSeries = (key, color) => {
        const pts = vals.map((v, i) => x(i) + ',' + y(v[key])).join(' ');
        if (chartType === 'area') {
          svg += '<polygon points="' + padL + ',' + (padT + plotH) + ' ' + pts + ' ' + (W - padR) + ',' + (padT + plotH) + '" fill="' + color + '" opacity="0.2"/>';
        }
        svg += '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2"/>';
        for (let i = 0; i < n; i++) {
          svg += '<circle cx="' + x(i) + '" cy="' + y(vals[i][key]) + '" r="2.5" fill="' + color + '"/>';
        }
      };
      if (chartMetric === 'stacked') {
        drawSeries('input', C_IN);
        drawSeries('output', C_OUT);
      } else {
        drawSeries('total', C_TOTAL);
      }
    }

    // Hover hit-areas (one per bucket).
    for (let i = 0; i < n; i++) {
      svg += '<rect class="chart-hit" data-i="' + i + '" x="' + (padL + slot * i) + '" y="' + padT + '" width="' + slot + '" height="' + plotH + '" fill="transparent"/>';
    }
    svg += '</svg>';
    box.innerHTML = svg + '<div class="chart-tip" id="chartTip"></div>';

    document.getElementById('chartLegend').innerHTML =
      (chartMetric === 'stacked' && chartType !== 'bar')
        ? '<span class="dot" style="background:' + C_IN + '"></span>' + esc(S.input) +
          '<span class="dot" style="background:' + C_OUT + '"></span>' + esc(S.output)
        : '';

    const tip = document.getElementById('chartTip');
    box.querySelectorAll('.chart-hit').forEach(hit => {
      hit.addEventListener('mousemove', ev => {
        const i = parseInt(hit.dataset.i, 10);
        const b = buckets[i], v = vals[i];
        let rows = '';
        if (chartMetric === 'stacked') {
          rows = '<div><span class="dot" style="background:' + C_IN + '"></span>' + esc(S.input) + ': ' + fmt(v.input) + '</div>' +
                 '<div><span class="dot" style="background:' + C_OUT + '"></span>' + esc(S.output) + ': ' + fmt(v.output) + '</div>';
        } else if (chartMetric === 'requests') {
          rows = '<div>' + esc(S.requests) + ': ' + fmt(v.total) + '</div>';
        } else {
          rows = '<div>' + esc(S.total) + ': ' + fmt(v.total) + '</div>';
        }
        tip.innerHTML = '<div class="tip-date">' + fmtLongDate(b.key) + (weekly ? ' (week)' : '') + '</div>' + rows;
        const boxRect = box.getBoundingClientRect();
        let tx = ev.clientX - boxRect.left + 12;
        let ty = ev.clientY - boxRect.top - 10;
        if (tx + tip.offsetWidth > boxRect.width - 4) tx = ev.clientX - boxRect.left - tip.offsetWidth - 12;
        tip.style.left = tx + 'px';
        tip.style.top = ty + 'px';
        tip.classList.add('show');
      });
      hit.addEventListener('mouseleave', () => tip.classList.remove('show'));
    });
  }

  function render() {
    if (!report) return;
    renderCards(report.totals);
    renderChart();
    renderTable();
    document.getElementById('footer').textContent =
      S.version + ' · ' + new Date(report.generatedAt).toLocaleString();
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'report') {
      report = msg.report;
      openSid = null;
      chartType = msg.report.chartType || 'bar';
      chartMetric = msg.report.chartMetric || 'total';
      chartLogScale = !!msg.report.chartLogScale;
      document.getElementById('days').value = String(msg.report.days ?? 'all');
      document.getElementById('theme').value = msg.report.theme || 'default';
      document.getElementById('chartType').value = chartType;
      document.getElementById('chartMetric').value = chartMetric;
      document.getElementById('chartLogScale').checked = chartLogScale;
      document.body.dataset.theme = msg.report.theme || 'default';
      render();
    } else if (msg.type === 'toast') {
      toast(msg.text);
    }
  });

  document.getElementById('days').addEventListener('change', e => {
    const v = e.target.value;
    send({ type: 'setDays', days: v === 'all' ? null : parseInt(v, 10) });
  });
  document.getElementById('theme').addEventListener('change', e => {
    const v = e.target.value;
    document.body.dataset.theme = v;
    send({ type: 'setTheme', theme: v });
  });
  function sendChart() {
    send({ type: 'setChart', chartType: chartType, chartMetric: chartMetric });
  }
  document.getElementById('chartType').addEventListener('change', e => {
    chartType = e.target.value;
    sendChart();
    renderChart(); // re-render locally for an instant switch
  });
  document.getElementById('chartMetric').addEventListener('change', e => {
    chartMetric = e.target.value;
    sendChart();
    renderChart(); // re-render locally for an instant switch
  });
  document.getElementById('chartLogScale').addEventListener('change', e => {
    chartLogScale = e.target.checked;
    send({ type: 'setChartLog', log: chartLogScale });
    renderChart(); // re-render locally for an instant switch
  });
  document.getElementById('refresh').addEventListener('click', () => send({ type: 'refresh' }));
  document.getElementById('export').addEventListener('click', () => send({ type: 'export' }));

  // Tell the extension the page script is ready so it can push the first
  // report now that the 'message' listener above is registered.
  send({ type: 'ready' });
</script>
</body>
</html>`;
}
