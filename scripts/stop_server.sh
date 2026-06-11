#!/usr/bin/env bash
# ============================================================================
# RoBoGo Learning Portal — 停止服务器
# 用法: bash scripts/stop_server.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

PID_FILE=".uvicorn.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "[提示] 未找到 PID 文件 (${PID_FILE})，服务器可能未运行" >&2
    exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"

if [ -z "$PID" ]; then
    echo "[提示] PID 文件为空，清理 ${PID_FILE}" >&2
    rm -f "$PID_FILE"
    exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
    echo "[提示] 进程 ${PID} 已不存在，清理 PID 文件" >&2
    rm -f "$PID_FILE"
    exit 0
fi

echo "[停止] 正在终止 uvicorn (pid=${PID})..."

# 优雅关闭
kill "$PID" 2>/dev/null || true

# 等待最多 5 秒
for i in $(seq 1 10); do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "  进程已终止"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 0.5
done

# 强制终止
echo "  进程未响应，强制终止..."
kill -9 "$PID" 2>/dev/null || true
sleep 0.5

if kill -0 "$PID" 2>/dev/null; then
    echo "[错误] 无法终止进程 ${PID}" >&2
    exit 1
fi

echo "  进程已强制终止"
rm -f "$PID_FILE"
