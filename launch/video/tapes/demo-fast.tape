# Terminal capture: replay of the recorded TodoMVC voyage in the live view.
# Run from the repo root: vhs launch/video/tapes/demo.tape
Output launch/video/footage/term-demo-fast.mp4

Set Shell "bash"
Set FontFamily "IBM Plex Mono"
Set FontSize 26
Set Width 1920
Set Height 1080
Set Padding 48
Set Framerate 30
Set TypingSpeed 45ms
Set CursorBlink false
Set Theme { "name": "theseus-ink", "black": "#0b0c0e", "red": "#e5484d", "green": "#3fb950", "yellow": "#d4a72c", "blue": "#5b7cff", "magenta": "#a78bfa", "cyan": "#7cc4d8", "white": "#d9d9d4", "brightBlack": "#6b6e76", "brightRed": "#ff6b6f", "brightGreen": "#56d364", "brightYellow": "#e3b341", "brightBlue": "#8099ff", "brightMagenta": "#c4b5fd", "brightCyan": "#a5d8e6", "brightWhite": "#f6f6f3", "background": "#0b0c0e", "foreground": "#e9e9e4", "selection": "#2a2d35", "cursor": "#5b7cff" }

Hide
Type "export PS1='$ ' && alias theseus='node packages/cli/dist/index.js' && clear"
Enter
Sleep 500ms
Show

Sleep 600ms
Type "theseus demo runs/todomvc-jquery --speed 40"
Sleep 400ms
Enter
Sleep 170s
