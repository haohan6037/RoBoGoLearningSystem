#!/usr/bin/env bash
# 安装并管理 macOS launchd 用户服务。
set -euo pipefail

LABEL="com.robogo.learning-portal"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
START_SCRIPT="$APP_DIR/scripts/start_server.sh"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$APP_DIR/logs"
DOMAIN="gui/$(id -u)"
ACTION="${1:-status}"

write_plist() {
    mkdir -p "$(dirname "$PLIST")" "$LOG_DIR"
    /usr/bin/python3 - "$PLIST" "$LABEL" "$APP_DIR" "$START_SCRIPT" "$LOG_DIR" <<'PY'
import plistlib
import sys

path, label, app_dir, start_script, log_dir = sys.argv[1:]
payload = {
    "Label": label,
    "ProgramArguments": ["/bin/bash", start_script, "--foreground"],
    "WorkingDirectory": app_dir,
    "EnvironmentVariables": {
        "ROBOGO_DATABASE_PROVIDER": "sqlite",
        "ROBOGO_SQLITE_PATH": "data/engineering-notebook-preview.sqlite3",
        "ROBOGO_MATERIALS_STORAGE_ROOT": "storage/engineering-notebook-preview",
        "ROBOGO_HOST": "0.0.0.0",
        "ROBOGO_PORT": "3002",
    },
    "RunAtLoad": True,
    "KeepAlive": {"SuccessfulExit": False},
    "ThrottleInterval": 5,
    "StandardOutPath": f"{log_dir}/launchd.out.log",
    "StandardErrorPath": f"{log_dir}/launchd.err.log",
    "ProcessType": "Interactive",
}
with open(path, "wb") as handle:
    plistlib.dump(payload, handle, sort_keys=False)
PY
    chmod 600 "$PLIST"
    plutil -lint "$PLIST"
}

case "$ACTION" in
    install)
        write_plist
        launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
        launchctl bootstrap "$DOMAIN" "$PLIST"
        launchctl enable "$DOMAIN/$LABEL"
        launchctl kickstart -k "$DOMAIN/$LABEL"
        echo "[完成] 已安装并启动 $LABEL"
        ;;
    restart)
        launchctl kickstart -k "$DOMAIN/$LABEL"
        echo "[完成] 已重启 $LABEL"
        ;;
    status)
        launchctl print "$DOMAIN/$LABEL"
        ;;
    logs)
        tail -n 80 "$LOG_DIR/launchd.out.log" "$LOG_DIR/launchd.err.log"
        ;;
    uninstall)
        launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
        if [ -f "$PLIST" ]; then
            mv "$PLIST" "$PLIST.disabled"
        fi
        echo "[完成] 已停止服务；配置保留为 ${PLIST}.disabled，可恢复。"
        ;;
    *)
        echo "用法: $0 {install|restart|status|logs|uninstall}" >&2
        exit 2
        ;;
esac
