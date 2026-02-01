#!/bin/bash

# Cursor Memory Archive Hook
# Runs on session end to archive or merge expired memories.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR"
CURSOR_DIR="$(dirname "$HOOKS_DIR")"

if [ "$CURSOR_DIR" = "$HOME/.cursor" ]; then
  PROJECT_ROOT="$HOME/.cursor"
  CURSOR_CONFIG_DIR="$HOME/.cursor"
else
  PROJECT_ROOT="$(dirname "$CURSOR_DIR")"
  CURSOR_CONFIG_DIR="$CURSOR_DIR"
fi

node "$HOOKS_DIR/cursor-memory-archive.mjs" --project-root "$PROJECT_ROOT" --cursor-dir "$CURSOR_CONFIG_DIR" >/dev/null 2>&1 || \
  echo "[cursor-memory-archive] failed" >&2

echo '{"continue": true}'
exit 0
