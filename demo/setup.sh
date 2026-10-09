#!/usr/bin/env bash
set -euo pipefail

repo="/Users/Shared/acme-shop"
remote="${TMPDIR:-/tmp}/acme-shop.git"
registry="$HOME/.config/devmanager/registry.json"
branches=(feature/login feature/search)

down() {
  if [[ -d "$repo" && -f "$registry" ]]; then
    jq -r --arg repo "$repo" '[.entries[] | select(.project_path == $repo) | .branch] | unique[]' "$registry" |
      while IFS= read -r branch; do
        (cd "$repo" && wop down "$branch" >/dev/null 2>&1) || true
      done
  fi
  for chat in "$HOME"/.claude/wop-worktrees/chats/*.json; do
    [[ -f "$chat" ]] && jq -e --arg repo "$repo" '.cwd | startswith($repo)' "$chat" >/dev/null && rm -f "$chat"
  done
  rm -rf "$repo" "$remote"
}

down
[[ "${1:-}" == "down" ]] && exit 0

mkdir -p "$repo"
cd "$repo"
git init -q -b main
cat >.devmanager.yml <<'EOF'
app:
  name: acme-shop

services:
  env_source: .env
  env:
    WEB_PORT: "{web_port}"
    CSS_PORT: "{css_port}"
    DATABASE_URL: "{database_url_primary}"

  web:
    cmd: exec python3 -m http.server $WEB_PORT
    port_range: [5100, 5199]

  css:
    cmd: exec python3 -m http.server $CSS_PORT
    port_range: [5200, 5299]

databases:
  primary:
    adapter: postgresql
    name_pattern: "acme_shop_{branch_slug}"
EOF
printf '# Acme Shop\n' >README.md
printf '<h1>Acme Shop</h1>\n' >index.html
printf '.env\n*.log\n' >.gitignore
git add .devmanager.yml README.md index.html .gitignore
git -c user.name=demo -c user.email=demo@example.com commit -qm "Start the shop"
git init -q --bare -b main "$remote"
git remote add origin "$remote"
git push -q -u origin main
git remote set-head origin main

for branch in "${branches[@]}"; do
  wop up "$branch" >/dev/null
done
