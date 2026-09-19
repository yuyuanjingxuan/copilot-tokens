# Change Log

All notable changes to the Copilot Tokens extension are documented here.

## 0.1.5

- **Fix**: sidebar (activity bar) view could open without data — report
  pushes are no longer gated on a readiness handshake that the sidebar
  webview did not reliably complete; the sidebar webview now also keeps
  its context when hidden so re-opening it does not blank the data

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
- Day window (1 / 7 / 30 / all), JSON export
- English / Chinese UI (auto-detected), 5 panel color themes
- Parses both new (`globalStorage`) and legacy (`workspaceStorage`)
  Copilot Chat debug log layouts
