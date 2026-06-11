#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

PID_FILE=".nextdev.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "[提示] 未找到 PID 文件，可能未运行" >&2
    exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"

if [ -z "$PID" ]; then
    rm -f "$PID_FILE"
    exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
    echo "[提示] 进程 ${PID} 已不存在" >&2
    rm -f "$PID_FILE"
    exit 0
fi

echo "[停止] 正在终止 Next.js (pid=${PID})..."
kill "$PID" 2>/dev/null || true

for i in $(seq 1 10); do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "  进程已终止"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 0.5
done

echo "  强制终止..."
kill -9 "$PID" 2>/dev/null || true
rm -f "$PID_FILE"
echo "  已强制终止"
