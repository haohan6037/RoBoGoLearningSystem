#!/usr/bin/env bash
# ============================================================================
# RoBoGo Learning Portal — 启动服务器（后台运行）
# 用法: bash scripts/start_server.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

# 强制使用 SQLite（避免本地 PostgreSQL 依赖）
export ROBOGO_DATABASE_PROVIDER="${ROBOGO_DATABASE_PROVIDER:-sqlite}"
export ROBOGO_DB_NAME="data/robogo-learning-portal.sqlite3"

# 配置
HOST="${ROBOGO_HOST:-127.0.0.1}"
PORT="${ROBOGO_PORT:-3001}"
PID_FILE=".uvicorn.pid"
LOG_DIR="logs"
LOG_FILE="${LOG_DIR}/uvicorn.log"

# 检查 Python 虚拟环境
PYTHON_BIN=".venv311/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
    echo "[错误] 未找到 Python 虚拟环境: ${PYTHON_BIN}" >&2
    echo "       请先运行: python3.11 -m venv .venv311 && .venv311/bin/pip install -r backend/requirements.txt" >&2
    exit 1
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
echo "  停止: bash scripts/stop_server.sh"
