#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

PORT="${ASSEMBLY_PORT:-3000}"
LABEL="com.robogo.assembly-step-studio"
DOMAIN="gui/$(id -u)"
LOG_FILE="logs/nextdev.log"
NODE_BIN="$(command -v node)"
NEXT_CLI="$SCRIPT_DIR/node_modules/next/dist/bin/next"

if [ ! -x "$NODE_BIN" ] || [ ! -f "$NEXT_CLI" ]; then
    echo "[错误] 未找到 Node.js 或 Next.js，请先安装项目依赖" >&2
    exit 1
fi

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    if lsof -i "tcp:${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "[提示] 已在运行 (port=${PORT})" >&2
        exit 0
    fi
    launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
fi

if lsof -i "tcp:${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[错误] 端口 ${PORT} 已被占用" >&2
    exit 1
fi

mkdir -p logs

echo "[构建] 创建 Assembly Studio 生产构建..."
"$NODE_BIN" "$NEXT_CLI" build
: > "$LOG_FILE"

echo "[启动] 通过 launchctl 启动 Next.js (port=${PORT})..."
launchctl submit -l "$LABEL" -- /bin/bash -c \
    'cd "$1" && export PATH="$(dirname "$2"):/usr/bin:/bin:/usr/sbin:/sbin" && exec "$2" "$3" start --port "$4" >>"$5" 2>&1' \
    _ "$SCRIPT_DIR" "$NODE_BIN" "$NEXT_CLI" "$PORT" "$SCRIPT_DIR/$LOG_FILE"
rm -f .nextdev.pid
echo "  日志: ${LOG_FILE}"
echo "  停止: bash apps/assembly-step-studio/scripts/stop.sh"
