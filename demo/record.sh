#!/usr/bin/env bash
set -euo pipefail

demo=$(cd "$(dirname "$0")" && pwd)
cd "$demo/.."

tapes=("$@")
[[ ${#tapes[@]} -gt 0 ]] || tapes=(hero switch exit ctrl-c worktree-flag)

for tape in "${tapes[@]}"; do
  "$demo/setup.sh"
  env -i HOME="$HOME" USER="$USER" SHELL=/bin/bash TERM=xterm-256color LANG=en_US.UTF-8 \
    TMPDIR="${TMPDIR:-/tmp}" PATH="$demo/bin:$PATH" MOD_ROOT="$PWD" \
    vhs "demo/$tape.tape"
  "$demo/setup.sh" down
done
