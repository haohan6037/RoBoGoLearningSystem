#!/usr/bin/env bash
# ============================================================================
# RoBoGo Learning Portal — Verification Script
# 后台启动 uvicorn → 健康检查 → curl 测试登录 → 输出日志 → 清理
# 所有命令都有 timeout，不使用 watch mode / tail -f / 前台 uvicorn
# ============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
cd "$APP_DIR"

HOST="127.0.0.1"
PORT="9931"                         # 使用非标准端口避免冲突
BASE_URL="http://${HOST}:${PORT}"
HEALTH_URL="${BASE_URL}/api/health"
LOGIN_URL="${BASE_URL}/api/auth/login"
LOG_DIR="/tmp/robogo-verify"
PID_FILE="${LOG_DIR}/uvicorn.pid"
LOG_FILE="${LOG_DIR}/uvicorn.log"
PASS=0
FAIL=0
TOTAL=0

# 强制 SQLite —— 避免本地 PostgreSQL 未运行的依赖
export ROBOGO_DATABASE_PROVIDER="sqlite"
export ROBOGO_DB_NAME="data/robogo-learning-portal.sqlite3"

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
cleanup() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid="$(cat "$PID_FILE" 2>/dev/null || true)"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "[cleanup] 终止 uvicorn (pid=${pid})..."
            kill "$pid" 2>/dev/null || true
            # 给 3 秒优雅退出，超时强制 kill
            sleep 0.5
            if kill -0 "$pid" 2>/dev/null; then
                sleep 2.5
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
    fi
    echo "[cleanup] 日志保留在 ${LOG_DIR}"
}
trap cleanup EXIT

run_test() {
    local name="$1"; shift
    TOTAL=$((TOTAL + 1))
    echo ""

    # 用 timeout 包装，确保不会卡死
    local output
    if output=$(run_with_optional_timeout "$@" 2>&1); then
        echo "  PASS  [${TOTAL}] ${name}"
        PASS=$((PASS + 1))
    else
        local rc=$?
        echo "  FAIL  [${TOTAL}] ${name} (exit=${rc})"
        echo "        ${output}"
        FAIL=$((FAIL + 1))
    fi
}

run_with_optional_timeout() {
    if command -v timeout >/dev/null 2>&1; then
        timeout 10 "$@"
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout 10 "$@"
    else
        "$@"
    fi
}

# ---------------------------------------------------------------------------
# 启动
# ---------------------------------------------------------------------------
mkdir -p "$LOG_DIR"

# 检查是否已有占用端口的进程
if lsof -i "tcp:${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[错误] 端口 ${PORT} 已被占用"
    lsof -i "tcp:${PORT}" -sTCP:LISTEN
    exit 1
fi

# 检查 Python 虚拟环境
PYTHON_BIN="$REPO_ROOT/.venv311/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
    echo "[错误] 未找到 Python 虚拟环境: ${PYTHON_BIN}"
    echo "       请先运行: python3.11 -m venv .venv311 && .venv311/bin/pip install -r apps/learning-portal/backend/requirements.txt"
    exit 1
fi

echo "============================================"
echo "  RoBoGo 验证脚本"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  端口: ${PORT}"
echo "  数据库: ${ROBOGO_DATABASE_PROVIDER}"
echo "============================================"

# 后台启动 uvicorn（显式关闭 reload，不做 watch）
echo ""
echo "[启动] 后台启动 uvicorn..."
nohup "$PYTHON_BIN" -m uvicorn backend.app.main:app \
    --host "$HOST" \
    --port "$PORT" \
    --log-level info \
    > "$LOG_FILE" 2>&1 &

UVICORN_PID=$!
echo "$UVICORN_PID" > "$PID_FILE"
echo "  uvicorn PID = ${UVICORN_PID}"

# ---------------------------------------------------------------------------
# 等待健康检查（最多 30 秒，每秒检查一次）
# ---------------------------------------------------------------------------
echo ""
echo "[等待] 等待服务就绪 (最长 30s)..."
READY=false
for i in $(seq 1 30); do
    if curl -s --max-time 2 -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null | grep -q '^2'; then
        READY=true
        echo "  服务在第 ${i} 秒就绪 ✓"
        break
    fi
    printf "."
    sleep 1
done

if [ "$READY" = false ]; then
    echo ""
    echo "[错误] 服务在 30 秒内未就绪。最近日志："
    tail -30 "$LOG_FILE"
    exit 1
fi

# ---------------------------------------------------------------------------
# 测试
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo "  测试开始"
echo "============================================"

# 1. 健康检查
run_test "GET /api/health → 200" \
    sh -c "curl -sS --max-time 5 '${HEALTH_URL}' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d.get('app')=='RoBoGo Learning Portal', f'unexpected: {d}'; print('OK: ' + d['app'])\""

# 2. 正确登录 (teacher)
run_test "POST /api/auth/login (teacher) → 200 + token" \
    sh -c "curl -sS --max-time 5 -X POST '${LOGIN_URL}' \
        -H 'Content-Type: application/json' \
        -d '{\"email\":\"teacher@robogo.local\",\"password\":\"Teacher123!\"}' \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert 'token' in d, 'missing token'; assert d.get('user',{}).get('role')=='Teacher', 'wrong role'; print('OK: token=' + d['token'][:8] + '..., role=' + d['user']['role'])\""

# 3. 正确登录 (student)
run_test "POST /api/auth/login (student) → 200 + token" \
    sh -c "curl -sS --max-time 5 -X POST '${LOGIN_URL}' \
        -H 'Content-Type: application/json' \
        -d '{\"email\":\"student@robogo.local\",\"password\":\"Student123!\"}' \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert 'token' in d, 'missing token'; assert d.get('user',{}).get('role')=='Student', 'wrong role'; print('OK: token=' + d['token'][:8] + '..., role=' + d['user']['role'])\""

# 4. 错误密码
run_test "POST /api/auth/login (wrong password) → 401" \
    sh -c "curl -sS --max-time 5 -X POST '${LOGIN_URL}' \
        -H 'Content-Type: application/json' \
        -d '{\"email\":\"teacher@robogo.local\",\"password\":\"wrong\"}' \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d.get('detail')!=None, 'expected error'; print('OK: ' + d['detail'])\""

# 5. 不存在的用户
run_test "POST /api/auth/login (unknown email) → 401" \
    sh -c "curl -sS --max-time 5 -X POST '${LOGIN_URL}' \
        -H 'Content-Type: application/json' \
        -d '{\"email\":\"nobody@nowhere.com\",\"password\":\"x\"}' \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d.get('detail')!=None, 'expected error'; print('OK: ' + d['detail'])\""

# 6. 登录后使用 token 访问 /api/me
run_test "GET /api/me → 200 (with token)" \
    sh -c "TOKEN=\$(curl -sS --max-time 5 -X POST '${LOGIN_URL}' \
        -H 'Content-Type: application/json' \
        -d '{\"email\":\"teacher@robogo.local\",\"password\":\"Teacher123!\"}' \
        | python3 -c \"import sys,json; print(json.load(sys.stdin)['token'])\") && \
        curl -sS --max-time 5 '${BASE_URL}/api/me' \
        -H \"Authorization: Bearer \$TOKEN\" \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert 'user' in d, 'missing user'; print('OK: user=' + d['user']['name'])\""

# 7. 无 token 访问 /api/me → 401
run_test "GET /api/me (no token) → 401" \
    sh -c "curl -sS --max-time 5 '${BASE_URL}/api/me' \
        | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d.get('detail')!=None, 'expected 401'; print('OK: ' + d['detail'])\""

# ---------------------------------------------------------------------------
# 结果汇总
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo "  结果汇总"
echo "============================================"
echo "  通过: ${PASS} / ${TOTAL}"
echo "  失败: ${FAIL} / ${TOTAL}"

# 打印最近日志（不 tail -f）
echo ""
echo "============================================"
echo "  服务日志 (最近 20 行)"
echo "============================================"
tail -20 "$LOG_FILE"

echo ""
echo "============================================"
echo "  验证完成 @ $(date '+%Y-%m-%d %H:%M:%S')"
echo "  完整日志: ${LOG_FILE}"
echo "============================================"

# cleanup 在 EXIT trap 中执行
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
