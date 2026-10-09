Output demo/exit.gif

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
Set TypingSpeed 65ms
Set CursorBlink false

Hide
Type "cd /Users/Shared/acme-shop--feature-login_* && printf 'a {}\n' > login.css && git add login.css && git -c user.name=demo -c user.email=demo@example.com commit -qm 'Style the login' && printf 'Log in\n' > login.html && clear"
Enter
Wait@30s
Show

Type "claude"
Sleep 400ms
Enter
Hide
Wait+Screen@60s /View all worktrees/
Sleep 1.5s
Show
Sleep 2s

Type "/exit"
Enter
Wait+Screen@30s /Tear down/
Sleep 4.7s
Down
Sleep 500ms
Down
Sleep 1.2s
Enter
Wait@120s
Sleep 3.4s
