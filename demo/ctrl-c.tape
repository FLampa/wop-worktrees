Output demo/ctrl-c.gif

Require claude
Require wop

Set Shell bash
Set FontSize 18
Set Width 1200
Set Height 680
Set Padding 20
Set Margin 36
Set MarginFill "#D97757"
Set BorderRadius 12
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 45ms
Set CursorBlink false

Hide
Type `source "$MOD_ROOT/scripts/claude-wrapper.sh" && cd /Users/Shared/acme-shop--feature-login_* && clear`
Enter
Show

Type "claude"
Sleep 300ms
Enter
Hide
Wait+Screen@60s /View all worktrees/
Sleep 1.5s
Show
Sleep 1.5s

Ctrl+C
Sleep 700ms
Ctrl+C
Wait+Screen@30s /Enter keeps it/
Sleep 2s
Type "t"
Sleep 400ms
Enter
Wait+Screen@120s /removed/
Sleep 3s
