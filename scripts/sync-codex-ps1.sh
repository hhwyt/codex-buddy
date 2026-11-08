#!/usr/bin/env bash
# Copy codex.ps1 from codex-install-made-easy (the source of truth) into scripts/vendor/, where the app embeds it.
# Usage: scripts/sync-codex-ps1.sh [path-to-codex-install-made-easy]   (default: GitHub main)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ $# -ge 1 ]; then cp "$1/codex.ps1" scripts/vendor/codex.ps1
else curl -fsSL https://raw.githubusercontent.com/hhwyt/codex-install-made-easy/main/codex.ps1 -o scripts/vendor/codex.ps1; fi
echo "synced: $(shasum -a 256 scripts/vendor/codex.ps1)"
