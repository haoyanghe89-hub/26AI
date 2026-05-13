#!/usr/bin/env bash
# Twentys1x AI Studio - 数据恢复脚本
# 用法:
#   ./scripts/restore.sh <备份文件路径>
#   例: ./scripts/restore.sh backups/twentys1x-backup-20260513_120000-daily.tar.gz
#   例: ./scripts/restore.sh backups/twentys1x-backup-20260513_120000-sqlite.db  # 仅恢复 SQLite
#
# 恢复流程:
#   1. 自动停止容器（如运行中）
#   2. 备份现有数据到临时目录（安全回滚）
#   3. 根据备份类型恢复数据
#   4. 提示用户确认后清理临时备份

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${DATA_DIR:-$PROJECT_DIR/data}"
ROLLBACK_DIR="$PROJECT_DIR/data_restore_rollback_$(date +%Y%m%d_%H%M%S)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
  echo "用法: $0 <备份文件路径>"
  echo ""
  echo "支持的备份格式:"
  echo "  .tar.gz  - 完整数据目录备份"
  echo "  .db      - 仅 SQLite 数据库备份"
  echo ""
  echo "环境变量:"
  echo "  DATA_DIR  数据目录路径（默认: ./data）"
  echo ""
  echo "示例:"
  echo "  $0 backups/daily/twentys1x-backup-20260513_120000-daily.tar.gz"
  echo "  $0 backups/twentys1x-backup-20260513_120000-sqlite.db"
  exit 1
}

# ─── 1. 检查备份文件 ───
BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  usage
fi

if [ ! -f "$BACKUP_FILE" ]; then
  log_error "备份文件不存在: $BACKUP_FILE"
  exit 1
fi

# ─── 2. 创建现有数据的备份（回滚用）───
backup_current_data() {
  log_info "创建当前数据的回滚备份..."
  mkdir -p "$ROLLBACK_DIR"

  if [ -d "$DATA_DIR" ]; then
    cp -r "$DATA_DIR" "$ROLLBACK_DIR/data"
    log_info "当前数据已备份到: $ROLLBACK_DIR/data"
  else
    log_warn "当前无数据目录，跳过回滚备份"
  fi
}

# ─── 3. 停止 Docker 容器 ───
stop_containers() {
  if command -v docker &>/dev/null && [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    log_info "停止 Docker 容器..."
    cd "$PROJECT_DIR"
    docker compose stop twentys1x 2>/dev/null || log_warn "Docker compose stop 失败（可能未运行）"
    cd - >/dev/null
  fi
}

# ─── 4. 启动 Docker 容器 ───
start_containers() {
  if command -v docker &>/dev/null && [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    log_info "启动 Docker 容器..."
    cd "$PROJECT_DIR"
    docker compose up -d twentys1x 2>/dev/null || log_warn "Docker compose up 失败"
    cd - >/dev/null
  fi
}

# ─── 5. 恢复完整 .tar.gz 备份 ───
restore_full() {
  log_info "恢复完整数据备份: $BACKUP_FILE"

  # 备份现有 SQLite（如果有）
  local db_path="$DATA_DIR/app.sqlite"
  if [ -f "$db_path" ]; then
    cp "$db_path" "$ROLLBACK_DIR/app.sqlite"
    log_info "当前 SQLite 数据库已备份"
  fi

  # 清空目标数据目录
  if [ -d "$DATA_DIR" ]; then
    rm -rf "${DATA_DIR:?}"/*
  fi
  mkdir -p "$DATA_DIR"

  # 解压备份到数据目录
  tar -xzf "$BACKUP_FILE" -C "$DATA_DIR" --strip-components=1 2>/dev/null || {
    # 如果 --strip-components=1 失败，尝试不 stripping
    log_warn "自动路径检测失败，尝试直接解压..."
    tar -xzf "$BACKUP_FILE" -C "$DATA_DIR"
  }

  log_info "完整数据恢复完成"
}

# ─── 6. 恢复 SQLite 备份 ───
restore_sqlite() {
  log_info "恢复 SQLite 数据库备份: $BACKUP_FILE"

  mkdir -p "$DATA_DIR"
  local db_path="$DATA_DIR/app.sqlite"

  # 备份现有数据库
  if [ -f "$db_path" ]; then
    cp "$db_path" "$ROLLBACK_DIR/app.sqlite"
    log_info "当前 SQLite 数据库已备份"
  fi

  # 验证是有效的 SQLite 数据库
  if command -v sqlite3 &>/dev/null; then
    if ! sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
      log_error "备份文件不是有效的 SQLite 数据库或数据库已损坏"
      log_info "可以使用回滚备份恢复: $ROLLBACK_DIR"
      exit 1
    fi
    log_info "SQLite 完整性检查通过"
  fi

  cp "$BACKUP_FILE" "$db_path"
  log_info "SQLite 数据库恢复完成: $db_path"
}

# ─── 7. 回滚提示 ───
rollback_hint() {
  echo ""
  log_warn "如需要回滚到恢复前的状态:"
  echo "  rm -rf $DATA_DIR"
  echo "  mv $ROLLBACK_DIR/data $DATA_DIR"
  echo "  或恢复 SQLite: mv $ROLLBACK_DIR/app.sqlite $DATA_DIR/app.sqlite"
  echo ""
  log_info "回滚备份位置: $ROLLBACK_DIR"
}

# ─── 主流程 ───
main() {
  echo ""
  log_info "======== Twentys1x 数据恢复 ========"
  log_info "备份文件: $BACKUP_FILE"
  log_info "目标目录: $DATA_DIR"
  echo ""

  # 确认操作
  read -r -p "⚠️  此操作将覆盖当前数据！确认恢复？(y/N): " confirm
  if [ "${confirm,,}" != "y" ] && [ "$confirm" != "Y" ]; then
    log_info "已取消恢复操作"
    exit 0
  fi

  backup_current_data
  stop_containers

  # 根据文件扩展名选择恢复方式
  case "$BACKUP_FILE" in
    *.tar.gz|*.tgz)
      restore_full
      ;;
    *.db|*.sqlite|*.sqlite3)
      restore_sqlite
      ;;
    *)
      log_error "不支持的备份格式: $BACKUP_FILE"
      log_info "支持的格式: .tar.gz, .db, .sqlite, .sqlite3"
      exit 1
      ;;
  esac

  start_containers
  rollback_hint

  log_info "======== 恢复完成 ========"
}

main