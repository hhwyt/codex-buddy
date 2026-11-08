#!/usr/bin/env bash
# Browser preview of the Codex 搭子 UI with a mock backend (no Windows, no Tauri needed).
# Serves ui/ on http://127.0.0.1:5180 only (never on other network interfaces).
#   http://127.0.0.1:5180/                      first-run flow (welcome → scan → progress → done)
#   http://127.0.0.1:5180/?state=installed      straight to the manage page
#   http://127.0.0.1:5180/?scenario=fix         install hits a known problem and fixes it
#   http://127.0.0.1:5180/?scenario=fail        install fails and offers "copy log"
set -euo pipefail
cd "$(dirname "$0")/../ui"
PORT="${PORT:-5180}"
echo "Codex 搭子 预览：http://127.0.0.1:$PORT/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
