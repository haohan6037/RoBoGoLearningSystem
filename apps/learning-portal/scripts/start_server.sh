#!/usr/bin/env bash
# ============================================================================
# RoBoGo Learning Portal — 启动服务器
# 用法: bash apps/learning-portal/scripts/start_server.sh [--foreground]
# ============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
cd "$APP_DIR"

# 默认使用应用配置。需要临时 SQLite 时可在命令前设置:
# ROBOGO_DATABASE_PROVIDER=sqlite bash apps/learning-portal/scripts/start_server.sh

# 配置
HOST="${ROBOGO_HOST:-127.0.0.1}"
PORT="${ROBOGO_PORT:-3001}"
PID_FILE=".uvicorn.pid"
LOG_DIR="logs"
LOG_FILE="${LOG_DIR}/uvicorn.log"

# 检查 Python 虚拟环境
PYTHON_BIN="${ROBOGO_PYTHON_BIN:-$REPO_ROOT/.venv-notebook-run/bin/python}"
if [ ! -x "$PYTHON_BIN" ] && [ -x "$REPO_ROOT/.venv311/bin/python" ]; then
    PYTHON_BIN="$REPO_ROOT/.venv311/bin/python"
fi
if [ ! -x "$PYTHON_BIN" ]; then
    echo "[错误] 未找到 Python 虚拟环境: ${PYTHON_BIN}" >&2
    echo "       请先创建 .venv-notebook-run 或通过 ROBOGO_PYTHON_BIN 指定 Python。" >&2
    exit 1
fi

if [ "${1:-}" = "--foreground" ]; then
    mkdir -p "$LOG_DIR"
    echo "[启动] 前台启动 uvicorn (host=${HOST}, port=${PORT})..."
    exec env PYTHONUNBUFFERED=1 "$PYTHON_BIN" -u -m uvicorn backend.app.main:app \
        --host "$HOST" \
        --port "$PORT" \
        --log-level info
fi

# 检查是否已在运行
if [ -f "$PID_FILE" ]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "[提示] 服务器已在运行 (pid=${OLD_PID})" >&2
        exit 0
    fi
fi

# 检查端口占用
if lsof -i "tcp:${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[错误] 端口 ${PORT} 已被占用" >&2
    lsof -i "tcp:${PORT}" -sTCP:LISTEN >&2
    exit 1
fi

# 创建日志目录
mkdir -p "$LOG_DIR"

# 后台启动 uvicorn
echo "[启动] 后台启动 uvicorn (host=${HOST}, port=${PORT})..."
PYTHONUNBUFFERED=1 nohup "$PYTHON_BIN" -u -m uvicorn backend.app.main:app \
    --host "$HOST" \
    --port "$PORT" \
    --log-level info \
    > "$LOG_FILE" 2>&1 &

UVICORN_PID=$!
echo "$UVICORN_PID" > "$PID_FILE"
echo "  PID: ${UVICORN_PID}"
echo "  日志: ${LOG_FILE}"
echo "  停止: bash apps/learning-portal/scripts/stop_server.sh"
