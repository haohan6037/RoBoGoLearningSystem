#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

PORT="${ASSEMBLY_PORT:-3000}"
PID_FILE=".nextdev.pid"
LOG_FILE="logs/nextdev.log"

if [ -f "$PID_FILE" ]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "[提示] 已在运行 (pid=${OLD_PID})" >&2
        exit 0
    fi
fi

if lsof -i "tcp:${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[错误] 端口 ${PORT} 已被占用" >&2
    exit 1
fi

mkdir -p logs

echo "[启动] 后台启动 Next.js (port=${PORT})..."
nohup npx next dev --port "$PORT" > "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
echo "  PID: ${PID}"
echo "  日志: ${LOG_FILE}"
echo "  停止: bash scripts/stop.sh"
