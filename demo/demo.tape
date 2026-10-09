Output demo/demo.gif

Require claude
Require wop

Set Shell bash
Set FontSize 18
Set Width 1400
Set Height 860
Set Padding 24
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 60ms
Set CursorBlink false

Hide
Type `for name in $(compgen -e | grep -E '^(CLAUDE|WOP_WORKTREES)'); do unset "$name"; done`
Enter
Type `claude() { command claude --setting-sources project --strict-mcp-config --permission-mode default --settings '{"tui":"fullscreen"}' --plugin-dir "$plugin" "$@"; }`
Enter
Type `plugin=$PWD && demo/setup.sh && cd /Users/Shared/acme-shop && clear`
Enter
Wait@300s
Show

Type "claude"
Sleep 400ms
Enter
Hide
Wait+Screen@60s /View all worktrees/
Sleep 500ms
Show
Sleep 2.5s

Type "/worktrees"
Sleep 500ms
Enter
Wait+Screen@20s /feature\/search/
Sleep 2.5s
Up
Sleep 900ms
Up
Sleep 1.8s
Enter
Wait+Screen@30s /login :5100/
Sleep 2.5s

Type "What port is the app on, and which database does it use?"
Sleep 500ms
Enter
Wait+Screen@120s /acme_shop_feature_login/
Sleep 4s

Type "/exit"
Sleep 500ms
Enter
Wait+Screen@30s /Tear down/
Sleep 3s
Down
Sleep 700ms
Down
Sleep 1.2s
Enter
Wait@300s
Sleep 3s

Hide
Type `"$plugin/demo/setup.sh" down`
Enter
Wait@300s
