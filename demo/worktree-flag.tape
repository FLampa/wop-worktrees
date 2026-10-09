Output demo/worktree-flag.gif

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
Type "cd /Users/Shared/acme-shop && clear"
Enter
Show

Type "claude -w feature/checkout"
Sleep 400ms
Enter
Sleep 1s
Hide
Wait+Screen@120s /checkout :510\d/
Sleep 1.5s
Show
Sleep 4s
