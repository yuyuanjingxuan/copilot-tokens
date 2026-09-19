<p align="center">
  <img src="docs/logo.png" alt="copilot-tokens" width="560">
</p>

> [Chinese (Simplified) README](README.zh-CN.md)

[![CI](https://github.com/yuyuanjingxuan/copilot-tokens/actions/workflows/ci.yml/badge.svg)](https://github.com/yuyuanjingxuan/copilot-tokens/actions/workflows/ci.yml)
[![Coverage](https://coveralls.io/repos/github/yuyuanjingxuan/copilot-tokens/badge.svg)](https://coveralls.io/github/yuyuanjingxuan/copilot-tokens)
[![VS Code](https://img.shields.io/badge/VS_Code-%E2%89%A51.85-blue.svg)](https://code.visualstudio.com/)
[![Python](https://img.shields.io/badge/Python-3.9--3.13-blue.svg)](https://www.python.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Token usage tracker for VS Code Copilot Chat (Windows / macOS / Linux).

Parses the built-in Copilot Chat debug logs (`main.jsonl`) and aggregates
input / output tokens, model, and latency per LLM request and per session.
Available as a **native VS Code extension** (themed webview panel) and a
**zero-install Python CLI** — both share identical parsing.

## Why this exists

- Since VS Code 1.13x, empty-window chat sessions write their debug logs to
  `globalStorage/github.copilot-chat/debug-logs/`, while several third-party
  tracker extensions only scan the older `workspaceStorage` path — so they
  show "no sessions found"
- BYOK (bring-your-own-key) users don't see usage on the GitHub billing page;
  local log analysis is the only option
- This tool parses `llm_request` events directly from the logs and relies on
  no VS Code internal APIs

## Prerequisites

Enable debug log file writing in VS Code settings:

```json
"github.copilot.chat.agentDebugLog.fileLogging.enabled": true
```

> With this setting on, full request logs for every session are written to
> local disk. Turn it off if you don't want logs persisted (this tool will
> then have no data to read).

## VS Code extension

A native VS Code extension wraps the parser in a themed webview panel —
summary cards, a per-session table, and expandable per-request detail. It
follows your light/dark theme, supports English / Chinese (auto-detected),
and offers five full-page color themes (default / green / purple / orange /
red, persisted in settings).

![Extension preview](docs/extension-preview.png)

![Extension color themes](docs/extension-themes.png)

```
extension/
├── src/
│   ├── extension.ts   # command + webview panel
│   ├── parser.ts      # log discovery & parsing (same logic as the CLI)
│   ├── i18n.ts        # en / zh-CN strings
│   └── webview.ts     # panel HTML/CSS/JS
├── package.json
└── tsconfig.json
```

### Install (.vsix)

1. Download `copilot-tokens-x.y.z.vsix` from the
   [latest release](https://github.com/yuyuanjingxuan/copilot-tokens/releases)
2. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> → **Extensions: Install from VSIX…** → pick the file
3. Run the command **Copilot Tokens: Show Usage**

### Try it (F5)

1. Open the `extension/` folder in VS Code
2. Run `npm install`
3. Press <kbd>F5</kbd> (Run Extension) — a second VS Code window opens
4. In that window, run the command **Copilot Tokens: Show Usage**

### Commands

| Command | Action |
|---|---|
| `Copilot Tokens: Show Usage` | Open the usage panel |
| `Copilot Tokens: Refresh` | Re-scan the logs |
| `Copilot Tokens: Export JSON` | Save the current report as a JSON file |

### Settings

| Setting | Default | Description |
|---|---|---|
| `copilotTokens.days` | `7` | Default day window when opening the panel |
| `copilotTokens.language` | `auto` | UI language: `auto` / `en` / `zh-CN` |
| `copilotTokens.theme` | `default` | Panel color theme: `default` / `green` / `purple` / `orange` / `red` |

> The extension is distributed as a `.vsix` via GitHub Releases (not yet
> published to the Marketplace).

## Python CLI (zero-install)

Prefer the terminal? A single-file, pure-stdlib Python script (no
dependencies, Python 3.9+) does the same job.

### Install

Nothing to install — just run it:

```bash
# Windows: double-click cli/copilot_tokens.bat, or run in a terminal
python cli/copilot_tokens.py

# Optional: make it available globally
# Windows
copy cli\copilot_tokens.py %USERPROFILE%\scripts\
# macOS / Linux
cp cli/copilot_tokens.py ~/.local/bin/ && chmod +x ~/.local/bin/copilot_tokens
```

### Usage

```
python cli/copilot_tokens.py             # sessions from the last 7 days
python cli/copilot_tokens.py --days 30   # last 30 days
python cli/copilot_tokens.py --all       # all sessions
python cli/copilot_tokens.py --top 5     # top 5 sessions by total tokens
python cli/copilot_tokens.py --session 6ec414c0   # per-request detail (prefix match)
python cli/copilot_tokens.py --json      # JSON output
python cli/copilot_tokens.py --json --out usage.json   # export UTF-8 JSON file
python cli/copilot_tokens.py --root /path/to/User      # non-standard VS Code "User" dir
```

### Sample output

```
Session    Time            Reqs       Input     Output    Cached     Total  Model / Title
──────────────────────────────────────────────────────────────────────────────────────────
6ec414c0 09-18 19:07     37      2.9M      60k        0      3.0M  qwen3.8-27b×37  Help me write a script…
a8ba8abd 09-18 18:34      1     9,360      157        0     9,517  qwen3.8-27b  Who are you
──────────────────────────────────────────────────────────────────────────────────────────
Total                      38      2.9M      60k        0      3.0M  2 sessions
```

Detail view (`--session <id>`):

```
Session a8ba8abd-…
  Versions: VS Code 1.138.0 / Copilot 0.66.0
  Time:     09-18 17:49 → 09-18 18:34
  Title:    Who are you

  #  Time             Dur        Input    Output   Cached  Model
──────────────────────────────────────────────────────────────
  1  09-18 18:13     5.6s     9,360     157        0  qwen3.8-27b
──────────────────────────────────────────────────────────────
                              9,360     157        0  Total
```

## Data sources

Both the extension and the CLI auto-discover logs in both layouts (new and
legacy):

| Layout | Path |
|---|---|
| New (VS Code 1.13x+, includes empty-window sessions) | `%APPDATA%/Code/User/globalStorage/github.copilot-chat/debug-logs/<sid>/main.jsonl` (Windows)<br>`~/Library/Application Support/Code/User/globalStorage/…` (macOS)<br>`~/.config/Code/User/globalStorage/…` (Linux) |
| Legacy (per workspace) | `%APPDATA%/Code/User/workspaceStorage/<hash>/GitHub.copilot-chat/debug-logs/<sid>/main.jsonl` |

Event types parsed (`main.jsonl` is JSONL, one event per line):

| Event | Used for |
|---|---|
| `llm_request` | `attrs.inputTokens` / `attrs.outputTokens` / `attrs.model` / `attrs.ttft`; top-level `ts` (epoch ms) / `dur` (ms) |
| `user_message` | first message becomes the session title |
| `session_start` | VS Code / Copilot version info |

### Known limitations

- **Cached tokens are not recorded**: VS Code currently does not write cache
  read/write tokens to the log (see
  [microsoft/vscode#329657](https://github.com/microsoft/vscode/issues/329657)).
  The parser reserves a `cachedTokens` field; it will light up automatically
  once the format supports it
- Input tokens are the **full context of each request** (system prompt,
  history, tool results), so multi-turn sessions show a large "input" total —
  this is normal context accumulation, not double counting
- The log format is an internal VS Code implementation with no stability
  guarantee. If data goes missing after a VS Code upgrade, please open an
  issue with one `llm_request` event from your `main.jsonl` (**redacted**)

## Privacy

- The tool is **read-only** over local log files. It never phones home or
  uploads anything
- Session titles come from your first user message — review exported JSON
  for sensitive content before sharing
- Never commit raw `main.jsonl` logs to any repository

## License

[MIT](LICENSE)
