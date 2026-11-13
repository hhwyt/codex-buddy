#!/bin/zsh
# Read-only check that the real ChatGPT.app and ~/.codex were not touched.
# Same checks as codex-buddy-team/builder/m3-baseline.txt. Never reads file contents of ~/.codex, only hashes.
setopt NULL_GLOB
date
codesign --verify --deep --strict /Applications/ChatGPT.app 2>/dev/null && echo "codesign ok" || echo "codesign FAILED"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/ChatGPT.app/Contents/Info.plist
stat -f '%m %N' /Applications/ChatGPT.app/Contents/Info.plist
ls /Applications | wc -l
shasum -a 256 ~/.codex/config.toml | cut -c1-16
shasum -a 256 ~/.codex/auth.json | cut -c1-16
pgrep -x ChatGPT | wc -l
pgrep -fl 'MacOS/ChatGPT$'
extra=(/Applications/*汉化* /Applications/Test-* /Applications/DeepSeek*.app /Applications/Kimi*.app /Applications/Qwen*.app /Applications/MiniMax*.app /Applications/混元*.app /Applications/智谱*.app)
echo "extra apps: ${#extra}"
for x in $extra; do echo "  $x"; done
