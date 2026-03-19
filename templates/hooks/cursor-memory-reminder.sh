#!/bin/bash

# Cursor Memory Reminder Hook
# This hook ensures cursor-memory skill evaluates every interaction
# for extractable memories worth preserving.
#
# Installation:
#   1. Copy to ~/.cursor/hooks/ or .cursor/hooks/
#   2. Make executable: chmod +x cursor-memory-reminder.sh
#   3. Add to hooks.json (see integration guide)

# Determine rules directory based on hook script location
# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR"
CURSOR_DIR="$(dirname "$HOOKS_DIR")"

# Check if we're in global mode (~/.cursor/hooks/) or project mode (.cursor/hooks/)
if [ "$CURSOR_DIR" = "$HOME/.cursor" ]; then
    # Global mode: use ~/.cursor/rules
    RULES_DIR="$HOME/.cursor/rules"
else
    # Project mode: use .cursor/rules (relative to project root)
    # Find project root by looking for .cursor directory
    PROJECT_ROOT="$(dirname "$CURSOR_DIR")"
    RULES_DIR="$PROJECT_ROOT/.cursor/rules"
fi

# Create rules directory if it doesn't exist
mkdir -p "$RULES_DIR"

# Write reminder to rules file
cat > "$RULES_DIR/cursor-memory-reminder.mdc" << 'EOF'
---
alwaysApply: true
description: "Cursor Memory - Automated memory capture reminder"
---

## MEMORY CAPTURE PROTOCOL

After each response, evaluate whether you just completed a **substantive task**.
A substantive task is one that involved: multi-step implementation, non-obvious debugging,
architectural decisions, user corrections, or discovery of non-documented behavior.

### When you COMPLETE a substantive task:

1. Read and follow the cursor-memory skill at `skills/cursor-memory/SKILL.md`
2. Execute the skill to extract and save memories from the full session so far
3. End your response with: `Memory: captured N items to ./memories/...`

### When you have NOT completed a substantive task:

Do nothing — no memory tag, no skip marker. Just respond normally.

RULES:
- Only invoke the skill when a substantive task reaches completion, not on every response
- A multi-turn task triggers memory capture once at completion, not at each intermediate step
- When in doubt whether a task qualifies, capture — the skill's confidence filter (>=50) handles noise

EOF

# Return success for Cursor to continue
echo '{"continue": true}'
exit 0
