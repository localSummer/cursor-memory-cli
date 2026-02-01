#!/bin/bash

# Cursor Memory Archive Hook
# Runs on session end to archive or merge expired memories.
# # 这些变量的值取决于**脚本文件本身的位置**,而不是执行脚本时的当前工作目录。`${BASH_SOURCE[0]}` 始终指向脚本文件的实际路径,所以无论你在哪个目录执行这个脚本,这三个变量的值都是固定的。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR"
CURSOR_DIR="$(dirname "$HOOKS_DIR")"

find_project_root() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/.cursor" ]; then
      echo "$dir"
      return
    fi
    dir="$(dirname "$dir")"
  done
  echo "$PWD"
}

if [ "$CURSOR_DIR" = "$HOME/.cursor" ]; then
  PROJECT_ROOT="$(find_project_root)"
  CURSOR_CONFIG_DIR="$HOME/.cursor"
else
  PROJECT_ROOT="$(dirname "$CURSOR_DIR")"
  CURSOR_CONFIG_DIR="$CURSOR_DIR"
fi

node "$HOOKS_DIR/cursor-memory-archive.mjs" --project-root "$PROJECT_ROOT" --cursor-dir "$CURSOR_CONFIG_DIR" >/dev/null 2>&1 || \
  echo "[cursor-memory-archive] failed" >&2

echo '{"continue": true}'
exit 0
