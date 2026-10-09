#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
name=$(jq -r '.name' <<<"$input")
branch=${name//+//}
cwd=$(jq -r '.cwd' <<<"$input")
session_id=$(jq -r '.session_id' <<<"$input")
registry="${WOP_STATE_DIR:-$HOME/.config/devmanager}/registry.json"
markers="$HOME/.claude/wop-worktrees/claude-sessions"

main_checkout=$(dirname "$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir)")

registered_path() {
  [[ -f "$registry" ]] || return 0
  jq -r --arg project "$main_checkout" --arg branch "$branch" \
    '[.entries[] | select(.project_path == $project and .branch == $branch)][0].worktree_path // empty' "$registry"
}

default_base() {
  git -C "$main_checkout" rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo HEAD
}

plain_git_worktree() {
  local path="$main_checkout/.claude/worktrees/$name"
  if [[ ! -d "$path" ]]; then
    git -C "$main_checkout" worktree add -b "worktree-$name" "$path" "$(default_base)" >&2
  fi
  echo "$path"
}

if [[ ! -f "$main_checkout/.devmanager.yml" || "$branch" != */* ]]; then
  plain_git_worktree
  exit 0
fi

cd "$main_checkout"
path=$(registered_path)

if [[ -n "$path" ]]; then
  wop restart "$branch" >&2 || true
else
  if ! git show-ref --verify --quiet "refs/heads/$branch"; then
    if git fetch --quiet origin "$branch" 2>/dev/null; then
      git branch "$branch" "origin/$branch" >&2
    else
      git branch "$branch" "$(default_base)" >&2
    fi
  fi
  wop up "$branch" >&2
  path=$(registered_path)
fi

[[ -n "$path" ]] || { echo "wop-guard: wop registered no worktree for $branch" >&2; exit 1; }

mkdir -p "$markers"
echo "$path" > "$markers/$session_id"
echo "$path"
