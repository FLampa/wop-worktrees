Output demo/switch.gif

Require claude
Require wop

Set Shell bash
Set FontSize 18
Set Width 1560
Set Height 800
Set Padding 20
Set Margin 36
Set MarginFill "#D97757"
Set BorderRadius 12
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 65ms
Set CursorBlink false

Hide
Type "cd /Users/Shared/acme-shop && wop stop feature/search >/dev/null && clear"
Enter
Wait@60s
Show

Type "claude"
Sleep 400ms
Enter
Hide
Wait+Screen@60s /View all worktrees/
Sleep 1.5s
Show
Sleep 1.4s

Type "/worktrees"
Enter
Wait+Screen@20s /feature\/search/
Sleep 2.7s
Up
Sleep 1.6s
Enter
Wait+Screen@60s /search :5101/
Sleep 2s

Ctrl+Q
Wait+Screen@20s /feature\/login/
Sleep 4.1s
Escape
Sleep 1.4s
