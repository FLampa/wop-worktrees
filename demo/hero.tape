Output demo/hero.gif

Require claude
Require wop

Set Shell bash
Set FontSize 18
Set Width 1560
Set Height 860
Set Padding 20
Set Margin 36
Set MarginFill "#D97757"
Set BorderRadius 12
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 65ms
Set CursorBlink false

Hide
Type "cd /Users/Shared/acme-shop && clear"
Enter
Show

Type "claude"
Sleep 400ms
Enter
Hide
Wait+Screen@60s /View all worktrees/
Sleep 1.5s
Show
Sleep 2s

Type "/worktrees"
Enter
Wait+Screen@20s /feature\/search/
Sleep 2s
Up
Sleep 700ms
Up
Sleep 1.4s
Enter
Wait+Screen@30s /login :5100/
Sleep 2s

Type "Check the app responds, with curl."
Enter
Wait+Screen@120s /for \d+s · done/
Sleep 4.7s

Type "/exit"
Enter
Wait+Screen@30s /Tear down/
Sleep 2.7s
Down
Sleep 500ms
Down
Sleep 1.2s
Enter
Wait@120s
Sleep 3.4s
