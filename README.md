# wop-worktrees

A Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/create) for
[wop](https://github.com/sofiandreoli/wop-releases), the CLI that gives each git branch its
own worktree, ports and database. It keeps the chat's wop environment visible while you
work, lets you switch between environments and git worktrees without leaving Claude Code,
and asks what to do with them when you exit.

## What it does

- **Footer.** In a repo with wop environments, the right end of the prompt footer shows the
  environment the chat is in and a button: `⎇ ● login :4001 · View all worktrees (2) ⌃Q`.
- **Worktree list.** The button, `/worktrees` or Ctrl+Q (below) opens a side pane with one
  card per wop environment (services, ports, database) and one line per plain git
  worktree. `↑↓` moves, `⏎` moves the chat there (restarting stopped services first),
  `Esc` closes.
- **Removing.** `x` asks before tearing a wop environment down (`wop down`) or removing a
  plain git worktree. The prompt warns about uncommitted changes, commits that are on no
  remote, and other Claude Code chats working in the same worktree.
- **Untracking.** `u` stops the chat from tracking an environment it only looked at, so
  `/exit` no longer asks about it.
- **`/exit` prompt.** For each environment the chat used, `/exit` asks *Keep running*,
  *Stop services* (`wop stop`) or *Tear down* (`wop down`), with the same warnings. `Esc`
  cancels the exit.

A chat uses an environment when its working directory is inside it, a tool call names it,
or Claude ran `wop up`/`wop restart` for its branch, even if the environment registers
minutes later.

## Requirements

- Claude Code 2.1.295 or newer (mods are early access and change between releases)
- `wop` 3.x on your `PATH`
- `jq` and `bash`, for the optional `claude -w` scripts

## Install

At the Claude Code prompt:

```
/plugin install wop-worktrees --marketplace FLampa/wop-worktrees
```

Answer `y` to add the marketplace and pick the user scope. A local-scope install only
loads in the checkout that holds it, not in its worktrees. The mod draws nothing outside
repos with wop environments.

To offer it to everyone working on a project, commit this to the project's
`.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "wop-worktrees": { "source": { "source": "github", "repo": "FLampa/wop-worktrees" } }
  },
  "enabledPlugins": { "wop-worktrees@wop-worktrees": true }
}
```

## Optional: Ctrl+Q

Mods can't read keys directly, but a mod button can name one of Claude Code's keybinding
actions and be pressed by your binding for it. The list buttons use `app:cycleDiffBase`,
which Claude Code only handles while `/diff`'s panel is open. Add this to
`~/.claude/keybindings.json` (an object with a `bindings` array; a bare array is
rejected):

```json
{
  "bindings": [
    { "context": "Global", "bindings": { "ctrl+q": "app:cycleDiffBase" } }
  ]
}
```

While `/diff`'s panel is open, Ctrl+Q cycles its diff base instead.

## Optional: `claude -w <type>/<name>` through wop

`scripts/worktree-create.sh` and `scripts/worktree-remove.sh` are `WorktreeCreate` and
`WorktreeRemove` hooks. With them, `claude -w feature/login` runs `wop up` and starts the
chat in the new environment. A branch that only exists on the remote is checked out from
it, and a new one starts from the remote's default branch. On exit, Claude Code's own
keep/remove prompt runs `wop down` on *Remove*, and the mod runs `wop stop` on *Keep*.
Names without a `/` (and subagent worktrees) get a plain git worktree under
`.claude/worktrees/`.

The hooks must live in a settings file, because hooks a plugin declares load too late for
`--worktree`. Clone this repo somewhere stable and add to your user or project settings:

```json
{
  "hooks": {
    "WorktreeCreate": [
      { "hooks": [{ "type": "command", "command": "\"/path/to/wop-worktrees/scripts/worktree-create.sh\"", "timeout": 1200 }] }
    ],
    "WorktreeRemove": [
      { "hooks": [{ "type": "command", "command": "\"/path/to/wop-worktrees/scripts/worktree-remove.sh\"", "timeout": 300 }] }
    ]
  }
}
```

## Limits

- **No prompt on Ctrl+C or Ctrl+D.** Mods can't ask anything once the interface is
  closing, so only `/exit` gets the prompt. `claude -w` chats get Claude Code's own
  keep/remove prompt instead.
- **No Down-arrow access** to the footer button. Use a click, `/worktrees` or Ctrl+Q.
- **Clicking needs fullscreen rendering** (`"tui": "fullscreen"`).
- **Other chats are seen only if they run this mod.** Each chat records its directory
  under `~/.claude/wop-worktrees/chats/`.
- **Tear down is `wop down`.** It deletes the worktree folder, uncommitted work included,
  and drops its databases. The git branch stays.

## Development

```bash
claude plugin validate .
claude plugin test .
```

`claude --plugin-dir .` loads your working copy for one session. Run `tsc -p .` for type
checks: Claude Code writes the API types to `.claude-plugin/types/` the first time it loads
the mod from a folder it watches.

## License

MIT
