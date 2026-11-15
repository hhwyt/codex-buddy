#!/usr/bin/env bash
# Starts CodexBuddy on this Mac in real-Codex sandbox mode (electron/platform/sandbox-real-mac.ts): every path lives in
# $CODEXBUDDY_SANDBOX (default ~/CodexBuddy-Test), Codex is a copy of /Applications/ChatGPT.app made inside it with its
# own CODEX_HOME and data dir, so it runs next to your own ChatGPT.app and never touches it or ~/.codex.
# Builds first when the compiled code is older than the source. Starts Electron detached; output goes to <sandbox>/run.log.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(uname)" = Darwin ] || { echo "Mac only" >&2; exit 1; }
SANDBOX="${CODEXBUDDY_SANDBOX:-$HOME/CodexBuddy-Test}"
case "$SANDBOX" in /*) ;; *) echo "CODEXBUDDY_SANDBOX must be an absolute path" >&2; exit 1 ;; esac
mkdir -p "$SANDBOX"
if [ ! -f dist/app.js ] || [ -n "$(find electron ui remote -newer dist/app.js -type f \( -name '*.ts' -o -name '*.json' \) -not -path 'ui/build/*' -print -quit)" ]; then
  echo "building…"
  npm run build >"$SANDBOX/build.log" 2>&1 || { echo "build failed, see $SANDBOX/build.log" >&2; exit 1; }
fi
# No fake servers (that would be test mode), no inherited Codex home
unset CODEXBUDDY_ENDPOINTS CODEX_HOME CODEXBUDDY_FAKE_CODEX
export CODEXBUDDY_SANDBOX="$SANDBOX" CODEXBUDDY_REAL_CODEX=1
echo "=== $(date '+%F %T') start" >>"$SANDBOX/run.log"
nohup npx --no-install electron . >>"$SANDBOX/run.log" 2>&1 &
disown
echo "CodexBuddy started (sandbox $SANDBOX, log $SANDBOX/run.log)"
