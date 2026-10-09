# wop-worktrees

A Claude Code mod (plugin hooks module) for wop, the CLI that gives each git branch its own
worktree, ports and database. It reads wop's registry to show the chat's environment, switch
between environments and git worktrees, tell Claude the ports and database, and clean up on exit.
Needs Claude Code 2.1.295+. Mods are early access and their API changes between releases.

## Layout

- `hooks/register.tsx`: every hook and every use of `$`, plus the state atoms
- `hooks/text.ts`: pure helpers (parsing, wording), no `$`
- `types/index.d.ts`: shared types and the `PluginState` contract for the atoms
- `scripts/`: optional `WorktreeCreate`/`WorktreeRemove` hooks and the `claude` shell wrapper
- `tests/`: `claude-code/testing` tests; `tests/fake.ts` fakes the registry, git, wop and the UI

## Commands

- `claude plugin validate .` and `claude plugin test .`: run both before every PR (CI runs them)
- `claude --plugin-dir .`: load the working copy in a real session
- `tsc -p .`: type check; works after a `--plugin-dir` session has written `.claude-plugin/types/`
- `bash -n scripts/*.sh && shellcheck --shell=bash scripts/*.sh`

## Writing mod code

- Load the `plugin-authoring` skill before changing hooks or UI. Check the mod API there instead
  of guessing it.
- The validator rejects passing `$` to a function imported from another file, and state atoms
  declared outside `register.tsx`. Keep `$` code and atoms there; move pure logic to `text.ts`.
- A new atom also needs its type in `PluginState` in `types/index.d.ts`.
- Op-event fakes in tests return `{ value }`. Extend `tests/fake.ts` rather than faking per test.
- Compare filesystem paths only after resolving them: wop's registry can record a path through a
  symlink (macOS `/tmp`) while git reports the resolved one.
- `scripts/claude-wrapper.sh` is sourced by both zsh and bash, so keep it portable.

## Platform limits (don't retry these)

- Mods get no key events, and Claude Code reserves Ctrl+C and Ctrl+D.
- `session.end` can't prompt or cancel and has a short time budget.
- `prompt.context` can fire before `session.start` finishes; don't assume start-up state is ready.
- A `/cd` run inside `session.start` doesn't stick; defer it with `$.clock.after`.
- `/reload-plugins` fires `session.start` again; a resumed chat keeps its session id.

## Repository rules

- `main` only accepts pull requests: work on a branch and open a PR.
- Commit messages are one sentence-case, imperative line with no body.
- No code comments.
- Don't add `version` to `.claude-plugin/plugin.json`: without it every merge ships as an update.
