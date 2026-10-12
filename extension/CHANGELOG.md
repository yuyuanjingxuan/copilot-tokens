# Change Log

All notable changes to the Copilot Tokens extension are documented here.

## 0.2.1

- **Feature**: `Copilot Tokens: Disable` / `Copilot Tokens: Enable`
  commands — Disable stops the auto-refresh timer, hides the status bar
  item, and closes the panel so the extension does no background work;
  Enable restores everything. (To fully unload the extension, disable it
  from the Extensions view.)
- **Performance**: much faster initial load — log files are parsed
  lazily (only when the panel/sidebar is opened), unchanged files are
  reused from a persistent on-disk cache keyed by file mtime+size, files
  older than the selected window are skipped, and changed files are read
  in parallel asynchronously.
- **Fix**: fixed an extension-host crash (out-of-memory abort) when the
  log directory is very large — the selected window is now passed through
  so unchanged files are skipped, and changed files are read with bounded
  concurrency instead of all at once.
- **UX**: a progress bar and loading hint now show while the logs are
  being parsed, so the first load (and switching to a longer window) no
  longer looks like a hang.
- **Fix**: stacked bar chart now draws the output segment below the
  input segment.
- **Fix**: the selected window (7 / 14 / 30 days / All) is now applied to
  request timestamps, not session activity — only requests inside the
  window are counted and drawn, so the chart and totals never include data
  outside the selected range.
- **Fix**: switching the log-scale toggle no longer resets the selected
  time window — changing chart settings no longer clobbers the current
  window.
- **Fix**: the selected day window (7 / 14 / 30 days / All) is now
  persisted to the configuration, so the choice survives a restart instead
  of resetting to the default.
- **Fix**: `Copilot Tokens: Show Usage` now opens the panel even while the
  extension is disabled (matching the sidebar view), instead of erroring.
  Disabling still stops background work (auto-refresh, status bar).

## 0.2.0

- **Feature**: daily usage chart — a per-day chart of token usage over the
  selected window, with a type switch (bar / line / area) and a metric
  switch (total tokens, input + output stacked, request count); hover a
  bar or point for the exact date, tokens, and request count. The
  "Input + Output" metric draws input and output as two separate series
  in line/area mode. Windows longer than 180 days aggregate by week.
  Choices persist via the new `copilotTokens.chartType`,
  `copilotTokens.chartMetric`, and `copilotTokens.chartLogScale`
  (optional logarithmic y-axis) settings

## 0.1.6

- **Fix**: sidebar (activity bar) view showed no data rows — the
  module-level `view` reference was not assigned in
  `resolveWebviewView` (lost during a code cleanup in 0.1.5), so
  `pushReport` could not reach the sidebar webview and only the static
  HTML rendered; the reference is assigned again (see
  [issue #1](https://github.com/yuyuanjingxuan/copilot-tokens/issues/1))

## 0.1.5

- **Fix**: sidebar (activity bar) view could open without data — the
  sidebar webview's scripts never ran because `enableScripts` defaults to
  `false` for webview views; scripts are now enabled before the HTML is
  assigned, so the dashboard renders in the sidebar as well
- **Fix**: activity bar icon rendered as a solid circle — VS Code masks
  activity bar icons with the theme color, so a separate outline icon is
  now used for the activity bar while the full-color logo remains the
  Marketplace / gallery icon
- **Python CLI**: now also marks and groups deleted sessions at the
  bottom (reads `session-store.db` via the stdlib `sqlite3`), matching
  the extension; totals still include them

## 0.1.4

- **Fix**: sidebar view could open without data — the first report was
  pushed before the webview's script finished loading and was lost; the
  webview now signals readiness and the report is pushed in response
- **Fix**: `Export JSON` wrote an empty object — the report builder became
  async in 0.1.3 but the export path was not awaited

## 0.1.3

- **Activity bar icon** — the dashboard now lives in a sidebar view
  (click the icon on the left activity bar); the full-width tab panel is
  still available via `Copilot Tokens: Show Usage`
- **Status bar item** — total tokens for the selected day window shown on
  the right side of the status bar; click it to open the panel
- **Auto-refresh** — the report re-scans the logs automatically every
  60 seconds (configurable via `copilotTokens.autoRefresh`, `0` disables)
- **Deleted sessions** — sessions removed from the VS Code chat list are
  still counted (the tokens were really used) but are grouped at the bottom
  of the table with a "Deleted" badge, so the data stays self-consistent

## 0.1.2

- Published to the VS Code Marketplace
- Full marketplace listing: screenshots, features, commands, settings,
  data sources, privacy notes, and develop-from-source instructions

## 0.1.1

- New flat icon
- Coverage reporting (Coveralls) in CI

## 0.1.0

- Initial release: themed webview panel with summary cards, per-session
  table, expandable per-request detail
- Day window (7 / 30 / 90 / all), JSON export
- English / Chinese UI (auto-detected), 5 panel color themes
- Parses both new (`globalStorage`) and legacy (`workspaceStorage`)
  Copilot Chat debug log layouts
