#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
copilot_tokens.py — VS Code Copilot Chat token usage tracker
============================================================

Parses the built-in Copilot Chat debug logs (main.jsonl) and aggregates
token usage per session. Pure stdlib, zero dependencies. Run directly:

    python cli/copilot_tokens.py             # sessions from the last 7 days
    python cli/copilot_tokens.py --days 30   # last 30 days
    python cli/copilot_tokens.py --all       # all sessions
    python cli/copilot_tokens.py --session 6ec414c0   # per-request detail
    python cli/copilot_tokens.py --json      # JSON output
    python cli/copilot_tokens.py --top 5     # top 5 sessions by total tokens
    python cli/copilot_tokens.py --root DIR  # non-standard VS Code "User" dir

Data sources (auto-discovered, both layouts supported):
  1. %APPDATA%/Code/User/globalStorage/github.copilot-chat/debug-logs/<sid>/main.jsonl   (VS Code 1.13x+)
  2. %APPDATA%/Code/User/workspaceStorage/<hash>/GitHub.copilot-chat/debug-logs/<sid>/main.jsonl (legacy)

Prerequisite: enable github.copilot.chat.agentDebugLog.fileLogging.enabled = true in settings
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

# ── Terminal colors (ANSI on Windows 10+; degrades gracefully) ─────────────
def _supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.name != "nt":
        return sys.stdout.isatty()
    try:
        os.system("")  # enable VT processing on Win10+
        return sys.stdout.isatty()
    except Exception:
        return False


USE_COLOR = _supports_color()


def c(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if USE_COLOR else text


def bold(s): return c(s, "1")
def dim(s): return c(s, "2")
def cyan(s): return c(s, "36")
def green(s): return c(s, "32")
def yellow(s): return c(s, "33")
def red(s): return c(s, "31")
def magenta(s): return c(s, "35")


# ── Data model ──────────────────────────────────────────────────────────────
@dataclass
class LlmRequest:
    ts: int = 0            # epoch ms
    dur_ms: int = 0
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    response_id: str = ""


@dataclass
class Session:
    sid: str
    path: Path
    title: str = ""
    first_ts: int = 0
    last_ts: int = 0
    vscode_version: str = ""
    copilot_version: str = ""
    requests: list[LlmRequest] = field(default_factory=list)

    @property
    def input_tokens(self) -> int:
        return sum(r.input_tokens for r in self.requests)

    @property
    def output_tokens(self) -> int:
        return sum(r.output_tokens for r in self.requests)

    @property
    def cached_tokens(self) -> int:
        return sum(r.cached_tokens for r in self.requests)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    @property
    def models(self) -> dict[str, int]:
        m: dict[str, int] = {}
        for r in self.requests:
            m[r.model or "?"] = m.get(r.model or "?", 0) + 1
        return m


# ── Log discovery ───────────────────────────────────────────────────────────
def vscode_user_dir() -> Path:
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", "")) / "Code" / "User"
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "Code" / "User"
    return Path(os.environ.get("XDG_CONFIG_HOME", home / ".config")) / "Code" / "User"


def find_main_jsonl_files(root: Path | None = None) -> list[Path]:
    """Find all main.jsonl files across both (new and legacy) layouts.

    If *root* is given, it is used as the "User" directory directly
    (useful for tests and non-standard install locations).
    """
    user = root if root is not None else vscode_user_dir()
    files: list[Path] = []
    if not user.exists():
        return files

    # New layout: globalStorage/github.copilot-chat/debug-logs/<sid>/main.jsonl
    new_root = user / "globalStorage" / "github.copilot-chat" / "debug-logs"
    if new_root.is_dir():
        files.extend(new_root.glob("*/main.jsonl"))

    # Legacy layout: workspaceStorage/<hash>/GitHub.copilot-chat/debug-logs/<sid>/main.jsonl
    ws_root = user / "workspaceStorage"
    if ws_root.is_dir():
        for entry in ws_root.iterdir():
            if not entry.is_dir():
                continue
            old_root = entry / "GitHub.copilot-chat" / "debug-logs"
            if old_root.is_dir():
                files.extend(old_root.glob("*/main.jsonl"))

    return files


# ── Log parsing ─────────────────────────────────────────────────────────────
def _as_int(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def parse_session(path: Path) -> Session | None:
    """Parse one main.jsonl into a Session; return None if no usable data."""
    sid = path.parent.name
    sess = Session(sid=sid, path=path)
    title_taken = False

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue

                etype = ev.get("type")
                ts = _as_int(ev.get("ts"))
                attrs = ev.get("attrs") or {}

                if ts:
                    sess.first_ts = min(sess.first_ts, ts) if sess.first_ts else ts
                    sess.last_ts = max(sess.last_ts, ts)

                if etype == "session_start":
                    sess.vscode_version = str(attrs.get("vscodeVersion", ""))
                    sess.copilot_version = str(attrs.get("copilotVersion", ""))

                elif etype == "user_message" and not title_taken:
                    content = str(attrs.get("content", "")).strip()
                    if content:
                        # Strip wrappers like <context>; keep the meaningful part
                        content = re.sub(r"\s+", " ", content)
                        m = re.search(r"<userRequest>\s*(.+?)\s*</userRequest>", content)
                        if m:
                            content = m.group(1)
                        sess.title = content[:60] + ("…" if len(content) > 60 else "")
                        title_taken = True

                elif etype == "llm_request":
                    sess.requests.append(LlmRequest(
                        ts=ts,
                        dur_ms=_as_int(ev.get("dur")),
                        model=str(attrs.get("model", "")),
                        input_tokens=_as_int(attrs.get("inputTokens")),
                        output_tokens=_as_int(attrs.get("outputTokens")),
                        cached_tokens=_as_int(attrs.get("cachedTokens")),
                        response_id=str(attrs.get("responseId", "")),
                    ))
    except OSError as e:
        print(dim(f"  ! Cannot read {path}: {e}"), file=sys.stderr)
        return None

    if not sess.requests:
        return None
    sess.requests.sort(key=lambda r: r.ts)
    return sess


def load_sessions(root: Path | None = None) -> list[Session]:
    seen: dict[str, Session] = {}
    for f in find_main_jsonl_files(root):
        s = parse_session(f)
        if s and s.sid not in seen:
            seen[s.sid] = s
    return sorted(seen.values(), key=lambda s: s.last_ts, reverse=True)


# ── Formatting ──────────────────────────────────────────────────────────────
def fmt_ts(ms: int) -> str:
    if not ms:
        return "-"
    return datetime.fromtimestamp(ms / 1000).strftime("%m-%d %H:%M")


def fmt_num(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 10_000:
        return f"{n / 1000:.0f}k"
    return f"{n:,}"


def model_summary(models: dict[str, int]) -> str:
    parts = [f"{m}×{n}" if n > 1 else m for m, n in
             sorted(models.items(), key=lambda x: -x[1])]
    s = ", ".join(parts)
    return s[:40] + "…" if len(s) > 40 else s


def print_table(sessions: list[Session]) -> None:
    if not sessions:
        print(yellow("No sessions with token data found."))
        print(dim("  Make sure this setting is enabled: github.copilot.chat.agentDebugLog.fileLogging.enabled = true"))
        return

    header = f"{'Session':<10} {'Time':<13} {'Reqs':>4} {'Input':>9} {'Output':>8} {'Cached':>8} {'Total':>9}  Model / Title"
    print(bold(header))
    print(dim("─" * 110))

    tot_in = tot_out = tot_cached = tot_req = 0
    for s in sessions:
        tot_in += s.input_tokens
        tot_out += s.output_tokens
        tot_cached += s.cached_tokens
        tot_req += len(s.requests)
        title = s.title or dim("(untitled)")
        print(
            f"{cyan(s.sid[:8]):<10} {fmt_ts(s.last_ts):<13} "
            f"{len(s.requests):>4} "
            f"{fmt_num(s.input_tokens):>9} {fmt_num(s.output_tokens):>8} "
            f"{fmt_num(s.cached_tokens):>8} {fmt_num(s.total_tokens):>9}  "
            f"{magenta(model_summary(s.models))}  {title}"
        )

    print(dim("─" * 110))
    print(
        f"{'Total':<10} {'':<13} {tot_req:>4} "
        f"{fmt_num(tot_in):>9} {fmt_num(tot_out):>8} "
        f"{fmt_num(tot_cached):>8} {fmt_num(tot_in + tot_out):>9}  "
        f"{dim(f'{len(sessions)} session(s)')}"
    )


def print_detail(s: Session) -> None:
    print(bold(f"\nSession {s.sid}"))
    print(f"  File:   {s.path}")
    if s.vscode_version or s.copilot_version:
        print(f"  Versions: VS Code {s.vscode_version} / Copilot {s.copilot_version}")
    print(f"  Time:   {fmt_ts(s.first_ts)} → {fmt_ts(s.last_ts)}")
    print(f"  Title:  {s.title or '(none)'}")
    print()

    header = f"{'#':>3} {'Time':<12} {'Dur':>7} {'Input':>9} {'Output':>7} {'Cached':>8}  Model"
    print(bold(header))
    print(dim("─" * 70))
    for i, r in enumerate(s.requests, 1):
        print(
            f"{i:>3} {fmt_ts(r.ts):<12} {r.dur_ms / 1000:>6.1f}s "
            f"{fmt_num(r.input_tokens):>9} {fmt_num(r.output_tokens):>7} "
            f"{fmt_num(r.cached_tokens):>8}  {r.model or '?'}"
        )
    print(dim("─" * 70))
    print(
        f"{'':>3} {'':<12} {'':>7} "
        f"{fmt_num(s.input_tokens):>9} {fmt_num(s.output_tokens):>7} "
        f"{fmt_num(s.cached_tokens):>8}  {dim('Total')}")


def to_json(sessions: list[Session]) -> str:
    out = []
    for s in sessions:
        out.append({
            "sessionId": s.sid,
            "title": s.title,
            "firstTs": s.first_ts,
            "lastTs": s.last_ts,
            "vscodeVersion": s.vscode_version,
            "copilotVersion": s.copilot_version,
            "requests": len(s.requests),
            "inputTokens": s.input_tokens,
            "outputTokens": s.output_tokens,
            "cachedTokens": s.cached_tokens,
            "totalTokens": s.total_tokens,
            "models": s.models,
            "details": [
                {
                    "ts": r.ts, "durMs": r.dur_ms, "model": r.model,
                    "inputTokens": r.input_tokens, "outputTokens": r.output_tokens,
                    "cachedTokens": r.cached_tokens, "responseId": r.response_id,
                } for r in s.requests
            ],
        })
    return json.dumps(out, ensure_ascii=False, indent=2)


# ── Entry point ─────────────────────────────────────────────────────────────
def main() -> int:
    # Encoding strategy:
    #  - Interactive terminal: keep the console's native encoding
    #  - Piped / redirected output: force UTF-8 (avoids cp1252 encode crashes)
    #  - For file output use --out: Python writes UTF-8 directly, bypassing
    #    PowerShell pipeline decoding issues
    if not sys.stdout.isatty():
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
    else:
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.reconfigure(errors="replace")
            except Exception:
                pass

    ap = argparse.ArgumentParser(
        description="VS Code Copilot Chat token usage tracker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n"
               "  python cli/copilot_tokens.py --days 30\n"
               "  python cli/copilot_tokens.py --session 6ec414c0\n"
               "  python cli/copilot_tokens.py --json > usage.json\n",
    )
    ap.add_argument("--days", type=float, default=7, help="only show sessions from the last N days (default 7)")
    ap.add_argument("--all", action="store_true", help="show all sessions (ignore --days)")
    ap.add_argument("--top", type=int, default=0, help="show only the top N sessions by total tokens")
    ap.add_argument("--session", metavar="SID", help="per-request detail for a session (prefix match)")
    ap.add_argument("--json", action="store_true", help="output as JSON")
    ap.add_argument("--out", metavar="FILE", help="write results to a file (UTF-8), avoids terminal pipeline encoding issues")
    ap.add_argument("--root", metavar="DIR", help="use DIR as the VS Code 'User' directory (default: auto-detect)")
    args = ap.parse_args()

    root = Path(args.root) if args.root else None
    sessions = load_sessions(root)

    if args.session:
        matches = [s for s in sessions if s.sid.startswith(args.session)]
        if not matches:
            print(red(f"No session matching '{args.session}'"))
            return 1
        if args.json:
            result = to_json(matches)
        else:
            import io
            buf = io.StringIO()
            old_stdout = sys.stdout
            sys.stdout = buf
            try:
                for s in matches:
                    print_detail(s)
            finally:
                sys.stdout = old_stdout
            result = buf.getvalue().rstrip("\n")
        if args.out:
            Path(args.out).write_text(result + "\n", encoding="utf-8")
            print(f"Written to {args.out} (UTF-8)")
        else:
            print(result)
        return 0

    if not args.all:
        cutoff = (datetime.now() - timedelta(days=args.days)).timestamp() * 1000
        sessions = [s for s in sessions if s.last_ts >= cutoff]

    if args.top > 0:
        sessions = sorted(sessions, key=lambda s: -s.total_tokens)[:args.top]

    if args.json:
        result = to_json(sessions)
    else:
        import io
        buf = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = buf
        try:
            print_table(sessions)
        finally:
            sys.stdout = old_stdout
        result = buf.getvalue().rstrip("\n")

    if args.out:
        Path(args.out).write_text(result + "\n", encoding="utf-8")
        print(f"Written to {args.out} (UTF-8)")
    else:
        print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
