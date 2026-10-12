#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for cli/copilot_tokens.py.

These tests import the module directly (rather than via subprocess) so they
can exercise every branch: color handling, log discovery across both layouts,
parse edge cases (bad JSON, unreadable files, non-numeric fields), the
deleted-session marking via session-store.db, formatting helpers, and the
CLI argument paths (--top, --days, --out, --session miss).

Run with coverage:
    python -m coverage run -m unittest discover -s tests -p "test_cli_unit.py"
    python -m coverage report -m
"""
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "cli"))

import copilot_tokens as ct  # noqa: E402

FIXTURE_USER = ROOT / "tests" / "fixtures" / "user"


class ColorTest(unittest.TestCase):
    def test_c_no_color(self):
        self.assertEqual(ct.c("x", "1"), "x")

    def test_c_with_color(self):
        old = ct.USE_COLOR
        ct.USE_COLOR = True
        try:
            self.assertEqual(ct.c("x", "1"), "\033[1mx\033[0m")
        finally:
            ct.USE_COLOR = old

    def test_supports_color_no_color_env(self):
        old = os.environ.get("NO_COLOR")
        os.environ["NO_COLOR"] = "1"
        try:
            self.assertFalse(ct._supports_color())
        finally:
            if old is None:
                os.environ.pop("NO_COLOR", None)
            else:
                os.environ["NO_COLOR"] = old

    def test_supports_color_non_windows_tty(self):
        old_name, old_stdout = os.name, sys.stdout
        os.name = "posix"
        try:
            class Fake:
                def isatty(self):
                    return True
            sys.stdout = Fake()
            self.assertTrue(ct._supports_color())
        finally:
            os.name, sys.stdout = old_name, old_stdout

    def test_supports_color_windows_exception(self):
        old_name, old_stdout, old_system = os.name, sys.stdout, os.system
        os.name = "nt"
        try:
            class Fake:
                def isatty(self):
                    return True
            sys.stdout = Fake()

            def boom(_):
                raise OSError("no console")
            os.system = boom
            # os.system raising means color support is disabled
            self.assertFalse(ct._supports_color())
        finally:
            os.name, sys.stdout, os.system = old_name, old_stdout, old_system


class DiscoveryTest(unittest.TestCase):
    def test_find_both_layouts(self):
        files = ct.find_main_jsonl_files(FIXTURE_USER)
        names = sorted(f.name for f in files)
        self.assertEqual(names, ["main.jsonl", "main.jsonl"])

    def test_find_missing_root(self):
        self.assertEqual(ct.find_main_jsonl_files(ROOT / "does-not-exist"), [])

    def test_legacy_skips_non_dir_entries(self):
        with tempfile.TemporaryDirectory() as td:
            user = Path(td)
            ws = user / "workspaceStorage"
            ws.mkdir(parents=True)
            # A file entry inside workspaceStorage must be skipped
            (ws / "not-a-dir").write_text("x", encoding="utf-8")
            self.assertEqual(ct.find_main_jsonl_files(user), [])

    def test_vscode_user_dir_windows(self):
        old_name, old_appdata = os.name, os.environ.get("APPDATA")
        os.name = "nt"
        os.environ["APPDATA"] = "C:\\Users\\test\\AppData\\Roaming"
        try:
            self.assertEqual(
                ct.vscode_user_dir(),
                Path("C:\\Users\\test\\AppData\\Roaming") / "Code" / "User",
            )
        finally:
            os.name = old_name
            if old_appdata is None:
                os.environ.pop("APPDATA", None)
            else:
                os.environ["APPDATA"] = old_appdata

    def test_vscode_user_dir_darwin(self):
        from pathlib import PurePosixPath
        from unittest import mock

        class FakePosixPath(PurePosixPath):
            @classmethod
            def home(cls):
                return PurePosixPath("/Users/test")

        old_name, old_platform = os.name, sys.platform
        os.name = "posix"
        sys.platform = "darwin"
        try:
            with mock.patch.object(ct, "Path", FakePosixPath):
                result = ct.vscode_user_dir()
                self.assertEqual(str(result), "/Users/test/Library/Application Support/Code/User")
        finally:
            os.name, sys.platform = old_name, old_platform

    def test_vscode_user_dir_linux(self):
        from pathlib import PurePosixPath
        from unittest import mock

        class FakePosixPath(PurePosixPath):
            @classmethod
            def home(cls):
                return PurePosixPath("/home/test")

        old_name, old_platform, old_xdg = (
            os.name, sys.platform, os.environ.get("XDG_CONFIG_HOME"),
        )
        os.name = "posix"
        sys.platform = "linux"
        os.environ["XDG_CONFIG_HOME"] = "/custom/config"
        try:
            with mock.patch.object(ct, "Path", FakePosixPath):
                result = ct.vscode_user_dir()
                self.assertEqual(str(result), "/custom/config/Code/User")
        finally:
            os.name, sys.platform = old_name, old_platform
            if old_xdg is None:
                os.environ.pop("XDG_CONFIG_HOME", None)
            else:
                os.environ["XDG_CONFIG_HOME"] = old_xdg

    def test_vscode_user_dir_linux_default_xdg(self):
        from pathlib import PurePosixPath
        from unittest import mock

        class FakePosixPath(PurePosixPath):
            @classmethod
            def home(cls):
                return PurePosixPath("/home/test")

        old_name, old_platform, old_xdg = (
            os.name, sys.platform, os.environ.get("XDG_CONFIG_HOME"),
        )
        os.name = "posix"
        sys.platform = "linux"
        os.environ.pop("XDG_CONFIG_HOME", None)
        try:
            with mock.patch.object(ct, "Path", FakePosixPath):
                result = ct.vscode_user_dir()
                self.assertEqual(str(result), "/home/test/.config/Code/User")
        finally:
            os.name, sys.platform = old_name, old_platform
            if old_xdg is not None:
                os.environ["XDG_CONFIG_HOME"] = old_xdg


class ParseTest(unittest.TestCase):
    def test_as_int_bad(self):
        self.assertEqual(ct._as_int("abc"), 0)
        self.assertEqual(ct._as_int(None), 0)

    def test_parse_bad_json_line_skipped(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "sid-x"
            d.mkdir()
            f = d / "main.jsonl"
            f.write_text(
                '{"type":"session_start","ts":1,"attrs":{}}\n'
                '\n'  # blank line -> skipped
                'this is not json\n'
                '{"type":"llm_request","ts":2,"attrs":{"model":"m","inputTokens":5,"outputTokens":3}}\n',
                encoding="utf-8",
            )
            s = ct.parse_session(f)
            self.assertIsNotNone(s)
            self.assertEqual(len(s.requests), 1)
            self.assertEqual(s.input_tokens, 5)

    def test_parse_unreadable_returns_none(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "sid-y"
            d.mkdir()
            f = d / "main.jsonl"
            f.write_text("{}", encoding="utf-8")
            if os.name != "nt":
                os.chmod(f, 0)
                self.assertIsNone(ct.parse_session(f))
            else:
                # On Windows chmod is unreliable; simulate via a directory path
                self.assertIsNone(ct.parse_session(d))

    def test_parse_no_requests_returns_none(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "sid-z"
            d.mkdir()
            f = d / "main.jsonl"
            f.write_text('{"type":"session_start","ts":1,"attrs":{}}\n', encoding="utf-8")
            self.assertIsNone(ct.parse_session(f))

    def test_parse_title_wrapper_and_truncation(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "sid-t"
            d.mkdir()
            f = d / "main.jsonl"
            long = "x" * 100
            f.write_text(
                '{"type":"user_message","ts":1,"attrs":{"content":"<userRequest>%s</userRequest>"}}\n'
                '{"type":"llm_request","ts":2,"attrs":{"model":"m","inputTokens":1,"outputTokens":1}}\n'
                % long,
                encoding="utf-8",
            )
            s = ct.parse_session(f)
            self.assertEqual(len(s.title), 61)  # 60 chars + ellipsis
            self.assertTrue(s.title.endswith("…"))

    def test_parse_cached_tokens(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "sid-c"
            d.mkdir()
            f = d / "main.jsonl"
            f.write_text(
                '{"type":"llm_request","ts":2,"attrs":{"model":"m","inputTokens":10,"outputTokens":2,"cachedTokens":7}}\n',
                encoding="utf-8",
            )
            s = ct.parse_session(f)
            self.assertEqual(s.cached_tokens, 7)


class DeletedMarkingTest(unittest.TestCase):
    def _make_user(self, sids, live_ids):
        td = tempfile.TemporaryDirectory()
        user = Path(td.name)
        for sid in sids:
            d = user / "globalStorage" / "github.copilot-chat" / "debug-logs" / sid
            d.mkdir(parents=True)
            (d / "main.jsonl").write_text(
                '{"type":"llm_request","ts":%d,"attrs":{"model":"m","inputTokens":1,"outputTokens":1}}\n'
                % (1000 + int(sid[-1])),
                encoding="utf-8",
            )
        # session-store.db listing only live_ids
        db = user / "globalStorage" / "github.copilot-chat" / "session-store.db"
        db.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(str(db))
        con.execute("CREATE TABLE sessions (id TEXT)")
        for lid in live_ids:
            con.execute("INSERT INTO sessions VALUES (?)", (lid,))
        con.commit()
        con.close()
        return td, user

    def test_deleted_marking(self):
        td, user = self._make_user(["sid-1", "sid-2"], ["sid-1"])
        try:
            sessions = ct.load_sessions(user)
            by_sid = {s.sid: s for s in sessions}
            self.assertFalse(by_sid["sid-1"].deleted)
            self.assertTrue(by_sid["sid-2"].deleted)
            # Deleted sessions sort after live ones
            self.assertEqual([s.sid for s in sessions], ["sid-1", "sid-2"])
        finally:
            td.cleanup()

    def test_no_db_skips_marking(self):
        td, user = self._make_user(["sid-1"], ["sid-1"])
        try:
            (user / "globalStorage" / "github.copilot-chat" / "session-store.db").unlink()
            sessions = ct.load_sessions(user)
            self.assertFalse(sessions[0].deleted)
        finally:
            td.cleanup()

    def test_corrupt_db_returns_none(self):
        td, user = self._make_user(["sid-1"], ["sid-1"])
        try:
            db = user / "globalStorage" / "github.copilot-chat" / "session-store.db"
            db.write_bytes(b"this is not a sqlite database")
            self.assertIsNone(ct.load_live_session_ids(user))
        finally:
            td.cleanup()


class FormatTest(unittest.TestCase):
    def test_fmt_num_millions(self):
        self.assertEqual(ct.fmt_num(1_500_000), "1.5M")

    def test_fmt_num_thousands(self):
        self.assertEqual(ct.fmt_num(12_345), "12k")

    def test_fmt_num_plain(self):
        self.assertEqual(ct.fmt_num(999), "999")

    def test_fmt_ts_zero(self):
        self.assertEqual(ct.fmt_ts(0), "-")

    def test_model_summary_truncation(self):
        models = {f"model-{i}": 1 for i in range(20)}
        s = ct.model_summary(models)
        self.assertLessEqual(len(s), 41)
        self.assertTrue(s.endswith("…"))

    def test_model_summary_counts(self):
        self.assertEqual(ct.model_summary({"a": 2, "b": 1}), "a×2, b")

    def test_print_table_empty(self):
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            ct.print_table([])
        finally:
            sys.stdout = old
        self.assertIn("No sessions", buf.getvalue())

    def test_print_table_deleted_separator(self):
        s1 = ct.Session(sid="live-1", path=Path("x"), deleted=False, last_ts=2000)
        s1.requests.append(ct.LlmRequest(ts=2000, model="m", input_tokens=1, output_tokens=1))
        s2 = ct.Session(sid="dead-1", path=Path("y"), deleted=True, last_ts=1000)
        s2.requests.append(ct.LlmRequest(ts=1000, model="m", input_tokens=1, output_tokens=1))
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            ct.print_table([s1, s2])
        finally:
            sys.stdout = old
        out = buf.getvalue()
        self.assertIn("Deleted sessions", out)
        self.assertIn("[Deleted]", out)

    def test_print_detail_versions(self):
        s = ct.Session(sid="sid-v", path=Path("x"), vscode_version="1.138.0",
                       copilot_version="0.66.0", first_ts=1000, last_ts=2000)
        s.requests.append(ct.LlmRequest(ts=1500, dur_ms=500, model="m",
                                        input_tokens=10, output_tokens=2))
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            ct.print_detail(s)
        finally:
            sys.stdout = old
        out = buf.getvalue()
        self.assertIn("Versions: VS Code 1.138.0 / Copilot 0.66.0", out)
        self.assertIn("Total", out)

    def test_print_detail_deleted(self):
        s = ct.Session(sid="sid-d", path=Path("x"), deleted=True,
                       first_ts=1000, last_ts=2000)
        s.requests.append(ct.LlmRequest(ts=1500, model="m",
                                        input_tokens=1, output_tokens=1))
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            ct.print_detail(s)
        finally:
            sys.stdout = old
        self.assertIn("Status: Deleted", buf.getvalue())

    def test_to_json_details(self):
        s = ct.Session(sid="sid-j", path=Path("x"), title="t", deleted=True,
                       first_ts=1, last_ts=2, vscode_version="v", copilot_version="c")
        s.requests.append(ct.LlmRequest(ts=1, dur_ms=10, model="m",
                                        input_tokens=3, output_tokens=4,
                                        cached_tokens=1, response_id="r1"))
        data = json.loads(ct.to_json([s]))
        self.assertEqual(data[0]["details"][0]["responseId"], "r1")
        self.assertEqual(data[0]["cachedTokens"], 1)
        self.assertTrue(data[0]["deleted"])


class MainCliTest(unittest.TestCase):
    def _run_main(self, argv):
        old_argv = sys.argv
        sys.argv = ["copilot_tokens.py"] + argv
        try:
            return ct.main()
        finally:
            sys.argv = old_argv

    def test_session_miss_returns_1(self):
        self.assertEqual(self._run_main(["--root", str(FIXTURE_USER), "--session", "nope"]), 1)

    def test_top_flag(self):
        self.assertEqual(self._run_main(["--root", str(FIXTURE_USER), "--all", "--top", "1"]), 0)

    def test_days_filter(self):
        self.assertEqual(self._run_main(["--root", str(FIXTURE_USER), "--days", "1"]), 0)

    def test_out_file(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "out.json"
            self.assertEqual(
                self._run_main(["--root", str(FIXTURE_USER), "--all", "--json", "--out", str(out)]),
                0,
            )
            self.assertTrue(out.exists())
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(len(data), 2)

    def test_session_json_out(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "s.json"
            self.assertEqual(
                self._run_main(["--root", str(FIXTURE_USER), "--session", "test-sid-0001", "--json", "--out", str(out)]),
                0,
            )
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data[0]["sessionId"], "test-sid-0001")

    def test_session_detail_stdout(self):
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            rc = self._run_main(["--root", str(FIXTURE_USER), "--session", "test-sid-0001"])
        finally:
            sys.stdout = old
        self.assertEqual(rc, 0)
        self.assertIn("Session test-sid-0001", buf.getvalue())

    def test_main_interactive_tty_branch(self):
        # Force the "interactive terminal" branch (isatty() == True)
        old_stdout, old_stderr = sys.stdout, sys.stderr
        try:
            class Tty(io.StringIO):
                def isatty(self):
                    return True

                def reconfigure(self, **kw):
                    raise ValueError("cannot reconfigure")
            sys.stdout = Tty()
            sys.stderr = Tty()
            self.assertEqual(self._run_main(["--root", str(FIXTURE_USER), "--all"]), 0)
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr


class MiscTest(unittest.TestCase):
    def test_parse_session_oserror(self):
        # Force open() to raise OSError -> parse_session returns None
        from unittest import mock
        with mock.patch("builtins.open", side_effect=OSError("cannot open")):
            self.assertIsNone(ct.parse_session(Path("whatever/main.jsonl")))

    def test_load_live_session_ids_unlink_oserror(self):
        # Make tmp.unlink() raise OSError; should be swallowed
        old_unlink = Path.unlink
        try:
            def boom(self, *a, **k):
                raise OSError("cannot unlink")
            Path.unlink = boom
            # db exists in fixture? No — build a temp one
            with tempfile.TemporaryDirectory() as td:
                user = Path(td)
                db = user / "globalStorage" / "github.copilot-chat" / "session-store.db"
                db.parent.mkdir(parents=True)
                con = sqlite3.connect(str(db))
                con.execute("CREATE TABLE sessions (id TEXT)")
                con.execute("INSERT INTO sessions VALUES ('sid-1')")
                con.commit()
                con.close()
                ids = ct.load_live_session_ids(user)
                self.assertEqual(ids, {"sid-1"})
        finally:
            Path.unlink = old_unlink

    def test_main_module_entry(self):
        # Exercise the `if __name__ == "__main__"` guard via runpy
        import runpy
        old_argv = sys.argv
        sys.argv = ["copilot_tokens.py", "--root", str(FIXTURE_USER), "--all"]
        try:
            with self.assertRaises(SystemExit) as cm:
                runpy.run_path(str(ROOT / "cli" / "copilot_tokens.py"), run_name="__main__")
            self.assertEqual(cm.exception.code, 0)
        finally:
            sys.argv = old_argv


if __name__ == "__main__":
    unittest.main()
