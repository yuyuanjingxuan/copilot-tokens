#!/usr/bin/env python3
"""Smoke test: run copilot_tokens.py against the bundled fixture logs.

Verifies:
  - both log layouts (new globalStorage + legacy workspaceStorage) are found
  - llm_request token fields are parsed and aggregated correctly
  - session title extraction works
  - JSON output is valid and contains the expected numbers
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURE_USER = ROOT / "tests" / "fixtures" / "user"
SCRIPT = ROOT / "copilot_tokens.py"


def run(*extra: str) -> str:
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--root", str(FIXTURE_USER), "--all", *extra],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert proc.returncode == 0, f"exit {proc.returncode}: {proc.stderr}"
    return proc.stdout


def main() -> None:
    # 1. Table view: both sessions present, totals correct
    out = run()
    assert "test-sid-0001"[:8] in out, "new-layout session missing from table"
    assert "test-sid-0002"[:8] in out, "legacy-layout session missing from table"
    assert "example-model" in out, "model name missing from table"
    assert "example question" in out, "session title missing from table"

    # 2. JSON view: exact numbers
    data = json.loads(run("--json"))
    by_sid = {s["sessionId"]: s for s in data}
    assert len(by_sid) == 2, f"expected 2 sessions, got {len(by_sid)}"

    s1 = by_sid["test-sid-0001"]
    assert s1["requests"] == 2
    assert s1["inputTokens"] == 64053 + 9360
    assert s1["outputTokens"] == 306 + 157
    assert s1["models"] == {"example-model": 2}
    assert s1["title"] == "example question"
    assert s1["vscodeVersion"] == "1.138.0"
    assert s1["copilotVersion"] == "0.66.0"

    s2 = by_sid["test-sid-0002"]
    assert s2["requests"] == 1
    assert s2["inputTokens"] == 1000
    assert s2["outputTokens"] == 50

    # 3. Detail view for one session
    detail = run("--session", "test-sid-0001")
    assert "File:" in detail and "Total" in detail

    print("OK: all smoke tests passed")


if __name__ == "__main__":
    main()
