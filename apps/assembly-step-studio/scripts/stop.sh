#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

LABEL="com.robogo.assembly-step-studio"
DOMAIN="gui/$(id -u)"

if ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    rm -f .nextdev.pid
    echo "[提示] 服务未运行" >&2
    exit 0
fi

echo "[停止] 正在终止 Assembly Studio..."
launchctl bootout "$DOMAIN/$LABEL"
rm -f .nextdev.pid
echo "  服务已终止"
