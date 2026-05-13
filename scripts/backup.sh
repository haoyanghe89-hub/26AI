#!/usr/bin/env bash
# Twentys1x AI Studio - 数据备份脚本
# 用法:
#   ./scripts/backup.sh                        # 手动备份
#   BACKUP_DIR=/path/to/backups ./scripts/backup.sh  # 指定备份目录
#   添加到 crontab 实现自动备份，见 README.md
#
# 备份策略:
#   - 每天首次运行 → daily 备份（保留最近 7 个）
#   - 每周一首次运行 → weekly 备份（保留最近 4 个）
#   - 每月 1 号首次运行 → monthly 备份（保留最近 3 个）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="${DATA_DIR:-$PROJECT_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
DB_PATH="${DB_PATH:-$DATA_DIR/app.sqlite}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DATE_LABEL="$(date +%Y-%m-%d)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# 创建备份目录
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

# ─── 1. SQLite 安全备份（使用 .backup 命令，支持热备份不锁库）───
backup_sqlite() {
  local backup_file="$1"
  if command -v sqlite3 &>/dev/null && [ -f "$DB_PATH" ]; then
    log_info "备份 SQLite 数据库: $DB_PATH → $backup_file"
    if sqlite3 "$DB_PATH" ".backup '$backup_file'" 2>/dev/null; then
      log_info "SQLite 备份完成 ($(du -h "$backup_file" | cut -f1))"
    else
      log_warn "sqlite3 .backup 失败，改用文件复制方式备份"
      cp "$DB_PATH" "$backup_file"
    fi
  elif [ -f "$DB_PATH" ]; then
    log_info "sqlite3 命令不可用，使用文件复制方式备份 SQLite"
    cp "$DB_PATH" "$backup_file"
  else
    log_warn "SQLite 数据库 $DB_PATH 不存在，跳过 SQLite 备份"
  fi
}

# ─── 2. 完整数据目录打包 ───
backup_full() {
  local archive="$1"

  # 构建临时的备份文件列表
  local tmp_list
  tmp_list="$(mktemp)"
  trap 'rm -f "$tmp_list"' RETURN

  # 收集要备份的文件（排除临时文件和 macOS 元数据）
  if [ -d "$DATA_DIR" ]; then
    find "$DATA_DIR" -type f \
      ! -name '.DS_Store' \
      ! -name '*.tmp' \
      ! -name '*.swp' \
      ! -path '*/.Trash/*' \
      > "$tmp_list" 2>/dev/null || true
  fi

  if [ -s "$tmp_list" ]; then
    log_info "打包完整数据目录: $DATA_DIR → $archive"
    tar -czf "$archive" -T "$tmp_list" 2>/dev/null
    log_info "完整数据备份完成 ($(du -h "$archive" | cut -f1))"
  else
    log_warn "数据目录为空，创建一个空备份标记"
    tar -czf "$archive" --files-from /dev/null
  fi
}

# ─── 3. 备份轮转 ───
rotate_backups() {
  local dir="$1"
  local keep="$2"
  local label="$3"

  local count
  count=$(find "$dir" -maxdepth 1 -name "twentys1x-*${label}*" -type f 2>/dev/null | wc -l | tr -d ' ')

  if [ "$count" -gt "$keep" ]; then
    local to_delete=$((count - keep))
    log_info "轮转 ${label} 备份: 保留 ${keep}，删除 ${to_delete} 个旧备份"
    find "$dir" -maxdepth 1 -name "twentys1x-*${label}*" -type f \
      | sort \
      | head -n "$to_delete" \
      | while read -r old_file; do
          log_info "  删除旧备份: $(basename "$old_file")"
          rm -f "$old_file"
        done
  fi
}

# ─── 4. 主流程 ───
main() {
  log_info "======== Twentys1x 数据备份开始 ========"
  log_info "数据目录: $DATA_DIR"
  log_info "备份目录: $BACKUP_DIR"

  local base_name="twentys1x-backup-${TIMESTAMP}"

  # 获取今天是星期几 (1=Mon..7=Sun) 和日期
  local dow day
  dow=$(date +%u)
  day=$(date +%d)

  # Daily 备份（总是执行）
  log_info "--- Daily 备份 ---"
  local daily_file="$BACKUP_DIR/daily/${base_name}-daily.tar.gz"
  backup_full "$daily_file"
  rotate_backups "$BACKUP_DIR/daily" 7 "daily"

  # Weekly 备份（周一执行）
  if [ "$dow" -eq 1 ]; then
    log_info "--- Weekly 备份（周一）---"
    local weekly_file="$BACKUP_DIR/weekly/${base_name}-weekly.tar.gz"
    backup_full "$weekly_file"
    rotate_backups "$BACKUP_DIR/weekly" 4 "weekly"
  fi

  # Monthly 备份（每月 1 号执行）
  if [ "$day" -eq 1 ]; then
    log_info "--- Monthly 备份（月初）---"
    local monthly_file="$BACKUP_DIR/monthly/${base_name}-monthly.tar.gz"
    backup_full "$monthly_file"
    rotate_backups "$BACKUP_DIR/monthly" 3 "monthly"
  fi

  # 额外：单独的 SQLite 备份（便于快速恢复数据库）
  if [ -f "$DB_PATH" ]; then
    local sqlite_backup="$BACKUP_DIR/${base_name}-sqlite.db"
    backup_sqlite "$sqlite_backup"
    # SQLite 备份保留最近 14 个
    find "$BACKUP_DIR" -maxdepth 1 -name "twentys1x-backup-*-sqlite.db" -type f \
      | sort \
      | head -n -14 \
      | while read -r old_db; do
          rm -f "$old_db"
        done
  fi

  log_info "======== 备份完成 ========"
  echo ""
  log_info "最新备份文件:"
  find "$BACKUP_DIR" -name "${base_name}*" -type f -exec ls -lh {} \; 2>/dev/null || true
}

main