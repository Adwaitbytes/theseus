# Terminal capture: replay of the recorded TodoMVC voyage in the live view.
# Run from the repo root: vhs docs/tapes/readme-demo.tape
Output docs/images/theseus-demo.gif

Set Shell "bash"
Set FontFamily "IBM Plex Mono"
Set FontSize 17
Set Width 1400
Set Height 860
Set Padding 28
Set Framerate 12
Set TypingSpeed 45ms
Set CursorBlink false
Set Theme { "name": "theseus-ink", "black": "#0b0c0e", "red": "#e5484d", "green": "#3fb950", "yellow": "#d4a72c", "blue": "#5b7cff", "magenta": "#a78bfa", "cyan": "#7cc4d8", "white": "#d9d9d4", "brightBlack": "#6b6e76", "brightRed": "#ff6b6f", "brightGreen": "#56d364", "brightYellow": "#e3b341", "brightBlue": "#8099ff", "brightMagenta": "#c4b5fd", "brightCyan": "#a5d8e6", "brightWhite": "#f6f6f3", "background": "#0b0c0e", "foreground": "#e9e9e4", "selection": "#2a2d35", "cursor": "#5b7cff" }

Hide
Type "export PS1='$ ' && alias theseus='node packages/cli/dist/index.js' && clear"
Enter
Sleep 500ms
Show

Sleep 600ms
Type "theseus demo runs/todomvc-jquery --speed 120"
Sleep 400ms
Enter
Sleep 26s
