_wop_worktrees_warnings() {
  local environment=$1 worktree others logs changes unpushed warnings=""
  worktree=$(jq -r '.worktree' <<<"$environment")
  others=$(jq -r '.otherChats' <<<"$environment")
  logs=$(jq -r '[.services[].name + ".log"] | join("\n")' <<<"$environment")

  if [ "$others" -eq 1 ]; then
    warnings="another chat is working in it"
  elif [ "$others" -gt 1 ]; then
    warnings="$others other chats are working in it"
  fi

  changes=$(git -C "$worktree" status --porcelain 2>/dev/null | cut -c4- | grep -vxF -f <(printf '%s\n' "$logs") | grep -c .)
  unpushed=$(git -C "$worktree" rev-list --count HEAD --not --remotes 2>/dev/null || echo 0)
  if [ "$changes" -gt 0 ]; then
    warnings="${warnings:+$warnings · }$changes uncommitted change$([ "$changes" -eq 1 ] || echo s)"
  fi
  if [ "$unpushed" -gt 0 ]; then
    warnings="${warnings:+$warnings · }$unpushed commit$([ "$unpushed" -eq 1 ] || echo s) not on the remote"
  fi
  printf '%s' "$warnings"
}

_wop_worktrees_ask() {
  local environment=$1 branch project worktree database ports warnings answer
  branch=$(jq -r '.branch' <<<"$environment")
  project=$(jq -r '.project' <<<"$environment")
  worktree=$(jq -r '.worktree' <<<"$environment")
  database=$(jq -r '.database // "(unknown)"' <<<"$environment")
  ports=$(jq -r '.services | sort_by(.name != "web") | map("\(.name) :\(.port)") | join(", ")' <<<"$environment")
  [ -d "$worktree" ] || return 0

  warnings=$(_wop_worktrees_warnings "$environment")
  printf '\n\033[35m⎇\033[0m \033[1m%s\033[0m is still up: %s, database %s\n' "$branch" "$ports" "$database"
  [ -n "$warnings" ] && printf '  \033[33m⚠ %s\033[0m\n' "$warnings"
  printf '  k keep running · s stop services · t tear down (Enter keeps it): '
  read -r answer </dev/tty

  case "$answer" in
    s | S) (cd "$project" && wop stop "$branch") ;;
    t | T) (cd "$project" && wop down "$branch") ;;
  esac
}

_wop_worktrees_after_exit() {
  local file=$1 environment
  [ -s "$file" ] || return 0
  jq -c '.[]' "$file" 2>/dev/null | while IFS= read -r environment; do
    _wop_worktrees_ask "$environment"
  done
}

claude() {
  local exit_file code
  exit_file=$(mktemp "${TMPDIR:-/tmp}/wop-worktrees-exit.XXXXXX") || {
    command claude "$@"
    return
  }
  WOP_WORKTREES_EXIT_FILE=$exit_file command claude "$@"
  code=$?
  if [ -t 0 ] && [ -t 1 ] && command -v jq >/dev/null; then
    _wop_worktrees_after_exit "$exit_file"
  fi
  rm -f "$exit_file"
  return "$code"
}
