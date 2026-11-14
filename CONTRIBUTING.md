# Contributing to zt

Thanks for looking at a change. The short path is: fork the repo, install, run the checks, and open a pull request.

## Setup

Node.js 18 or newer, and npm. The version used in CI is in `.nvmrc` (currently 22).

```bash
git clone https://github.com/maikama8/dev-cli-toolkit.git
cd dev-cli-toolkit
npm ci
```

## Checks

Run these before you open a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
node dist/bin.js --version
```

`make lint`, `make typecheck`, `make test`, and `make build` call the same scripts. CI does not use `make`, because the Windows runner does not have it. The workflow runs the npm scripts on Linux, macOS, and Windows.

Tests live in `test/` and use Vitest. Prefer a direct call to the function under test. Use `runCli()` from `test/helpers.ts` when the behavior depends on argv, a temp directory, or a stand-in for `execFile`. Do not point `zt port kill` at a process the test itself is running.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add a go-api template
fix: reject a blank --config path
docs: describe doctor.minVersions
```

`zt git commit` writes the same shape.

## Screenshots

The pictures in `docs/images/` are stdout from a real `zt` run, drawn into a window so the colors survive on GitHub. After a change that alters that output:

```bash
npm run build
python3 scripts/termshot.py
```

The script needs Pillow and DejaVu Sans Mono. Update the README caption when a number in the picture changes.

## Pull requests

Describe what changed and how you checked it. Keep the diff focused on one thing. A bug fix should add a test that failed before the fix.

Please read the [code of conduct](CODE_OF_CONDUCT.md).
