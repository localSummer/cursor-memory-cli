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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 MEMORY CAPTURE EVALUATION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: After completing this request, you MUST evaluate whether
it produced valuable memories worth preserving using the cursor-memory skill.

EVALUATION PROTOCOL (NON-NEGOTIABLE):

1. COMPLETE the user's request first
2. EVALUATE: Ask yourself:
   - Did this require non-obvious investigation or debugging?
   - Was the solution something that would help in future similar situations?
   - Did I discover something not immediately obvious from documentation?
   - Did the user correct my approach or provide important feedback?
   - Were there important decisions made with clear reasoning?

3. IF YES to any question above:
   ACTIVATE: Use Skill(cursor-memory) NOW to extract memories
   The skill will call /catch-memories to capture structured observations

4. IF NO to all questions:
   SKIP: No memory extraction needed

This is NOT optional. Failing to evaluate means valuable knowledge is lost.
The cursor-memory skill will apply quality criteria (confidence ≥ 50) to
filter what gets preserved.

MEMORY TYPES TO CAPTURE:
- decision: Choices made between alternatives with reasoning
- insight: Cross-session relevant discoveries
- pattern_seed: Emerging patterns worth formalizing
- correction: User corrections to agent behavior
- learning: Technical or system learnings
- gap: Missing information or capabilities discovered

OUTPUT LOCATION: ./memories/YYYY-MM-DD/HH-MM-SS-session-name.json
⚠️  NOTE: Multiple extractions from the same session will be automatically merged into the same file (single-session-single-file mechanism).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

# Return success for Cursor to continue
echo '{"continue": true}'
exit 0
