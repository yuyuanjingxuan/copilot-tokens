# Contributing

Thanks for taking a look. This project has two deliverables that ship from one
repository:

| Deliverable | Source | Published to |
| --- | --- | --- |
| VS Code extension | `extension/` | [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yuyuanjingxuan.copilot-tokens) |
| Python CLI | `cli/copilot_tokens.py` | [PyPI](https://pypi.org/project/copilot-tokens/) |

Both read the same local Copilot Chat debug logs, so a change to the log parsing
logic usually needs to land in both places.

## Project layout

```
cli/copilot_tokens.py        Zero-dependency Python CLI (single file, stdlib only)
cli/README.md                Long description rendered on the PyPI page
extension/src/               TypeScript extension source
extension/package.json       Extension manifest (also holds the version)
tests/test_cli_unit.py       Unit tests for the CLI (stdlib unittest)
tests/test_smoke.py          End-to-end smoke test against tests/fixtures/
tests/fixtures/              Fake debug logs covering both storage layouts
pyproject.toml               PyPI packaging config
.github/workflows/ci.yml     Tests, extension build, package build
.github/workflows/release.yml       Tag push -> GitHub Release + .vsix
.github/workflows/publish-pypi.yml  Tag push -> PyPI (Trusted Publishing)
```

## Prerequisites

- **Python 3.9+** — the CLI targets 3.9 as its floor and is tested up to 3.13.
- **Node.js 20+** — for the extension.
- No runtime dependencies. The CLI is pure standard library on purpose; please
  keep it that way.

## Python CLI

Run it straight from the source tree — no install needed:

```bash
python cli/copilot_tokens.py --help
python cli/copilot_tokens.py --days 7
python cli/copilot_tokens.py --json
```

### Tests

```bash
# Unit tests (42 cases, no network, no real logs)
python -m unittest discover -s tests -p "test_cli_unit.py"

# Smoke test against the bundled fixture logs
python tests/test_smoke.py
```

Both run in CI on every push and pull request, across Python 3.9 through 3.13.

With coverage, matching what CI runs:

```bash
python -m pip install coverage
python -m coverage run --source=cli -m unittest discover -s tests -p "test_cli_unit.py"
python -m coverage report -m
```

If you change how logs are parsed, add a fixture under `tests/fixtures/` and
assert the exact token numbers in `test_smoke.py`. Exact numbers, not "greater
than zero" — the whole point is catching silent double-counting.

### Build the distribution locally

```bash
python -m pip install --upgrade build twine
python -m build
python -m twine check dist/*
```

`dist/` is gitignored.

## VS Code extension

```bash
cd extension
npm install
npm run compile     # tsc -p ./
npm run watch       # incremental rebuild while developing
```

Press <kbd>F5</kbd> in VS Code with the repo open to launch an Extension
Development Host.

To produce an installable `.vsix`:

```bash
cd extension
npm run package     # vsce package
```

`*.vsix` files are gitignored — do not commit build output.

## Releasing

Versions are driven by git tags. Pushing a `v*` tag triggers both
`release.yml` and `publish-pypi.yml`.

### 1. Bump the version in four places

| File | What to change |
| --- | --- |
| `cli/copilot_tokens.py` | `__version__ = "X.Y.Z"` |
| `extension/package.json` | `"version": "X.Y.Z"` |
| `extension/package-lock.json` | `"version"` at the root **and** inside `packages[""]` |
| `extension/CHANGELOG.md` | New `## X.Y.Z` section at the top |

The `## X.Y.Z` heading in `CHANGELOG.md` is not cosmetic: `release.yml` extracts
that exact section with `awk` to build the GitHub Release body. A missing or
mistyped heading produces a placeholder body instead of real notes.

### 2. Verify before tagging

```bash
python -m unittest discover -s tests -p "test_cli_unit.py"
python tests/test_smoke.py
python -m build && python -m twine check dist/*
```

### 3. Commit, push, tag

```bash
git add -A
git commit -m "Bump version to X.Y.Z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 4. What the tag triggers

- **`release.yml`** — packages the `.vsix`, builds release notes from
  `CHANGELOG.md`, creates the GitHub Release with the `.vsix` attached.
- **`publish-pypi.yml`** — first validates that the tag matches `__version__`
  in `cli/copilot_tokens.py` and fails loudly on a mismatch, then builds,
  `twine check`s, smoke-tests the wheel in a clean venv, and publishes via
  OIDC Trusted Publishing.

### 5. Confirm

- CI is green on `main`.
- The GitHub Release exists and has `copilot-tokens-X.Y.Z.vsix` attached.
- `https://pypi.org/project/copilot-tokens/` shows the new version.
- `pip install copilot-tokens==X.Y.Z` works in a fresh venv.

### Things that will bite you

- **PyPI versions are immutable.** A version number can never be reused or
  overwritten, even after deletion. If a release is broken, bump the patch
  version — do not try to re-push the same tag.
- **Tags are immutable too, in practice.** Re-pointing an existing tag means
  deleting it locally and remotely, and the PyPI upload will still be rejected
  because that version already exists.
- **`cli/README.md` is the PyPI long description.** PyPI does not resolve
  relative image paths, so every image URL in that file must be absolute
  (`https://raw.githubusercontent.com/...`).
- **Trusted Publishing needs no secrets.** The `publish` job uses
  `id-token: write` and the `pypi` environment. There is no API token in the
  repository, and there should never be one.

## Editing GitHub Actions workflows

A misplaced edit anchor can silently move steps from one job into another —
which is exactly how a `working-directory: extension` step once ended up in a
job that had no such default, breaking the build. After editing any file in
`.github/workflows/`, verify the resulting job/step structure before pushing:

```bash
python -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); [print(k, '->', [s.get('name', s.get('uses')) for s in v['steps']]) for k,v in d['jobs'].items()]"
```

## Commit messages

- Imperative mood, sentence case: `Add per-model token breakdown`, not
  `Added` or `adds`.
- One logical change per commit.
- Reference the affected area when it helps: `cli: handle missing log dir`.

## Code style

- **Python:** standard library only, type hints on public functions, no
  third-party imports. Keep the CLI a single file so it stays trivially
  copy-pasteable.
- **TypeScript:** `strict` mode is on; do not weaken `tsconfig.json` to make an
  error go away.
- Match the surrounding style. There is no formatter config to fight with.

## Reporting issues

Include your OS, VS Code version, Copilot Chat extension version, and the
output of `copilot-tokens --version`. If a number looks wrong, attach the
relevant `--json` output with session titles redacted — the logs contain your
prompts, so scrub before pasting.
