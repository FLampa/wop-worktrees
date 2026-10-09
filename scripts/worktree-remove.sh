#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
path=$(jq -r '.worktree_path' <<<"$input")
registry="${WOP_STATE_DIR:-$HOME/.config/devmanager}/registry.json"

grep -lxF "$path" "$HOME/.claude/wop-worktrees/claude-sessions/"* 2>/dev/null | xargs rm -f || true

entry=$([[ -f "$registry" ]] && jq -c --arg path "$path" '[.entries[] | select(.worktree_path == $path)][0] // empty' "$registry" || true)

if [[ -n "$entry" ]]; then
  cd "$(jq -r '.project_path' <<<"$entry")"
  wop down "$(jq -r '.branch' <<<"$entry")" >&2
  exit 0
fi

[[ -d "$path" ]] || exit 0
branch=$(git -C "$path" branch --show-current 2>/dev/null || true)
main_checkout=$(dirname "$(git -C "$path" rev-parse --path-format=absolute --git-common-dir)")
git -C "$main_checkout" worktree remove --force "$path" >&2
[[ "$branch" == worktree-* ]] && git -C "$main_checkout" branch -D "$branch" >&2
exit 0
