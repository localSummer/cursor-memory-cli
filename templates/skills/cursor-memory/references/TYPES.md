# Memory Types & Entities

This reference defines the standard types used for structured memory extraction.

> **Note**: The examples below are in English for definition clarity. When generating actual memory values, use Chinese as specified in SKILL.md.

## 10 Memory Types

When extracting memories, classify them into one of these types:

1. **decision**
   - Choice made between alternatives with reasoning
   - _Example_: "Selected Vercel over Netlify for deployment due to Next.js integration"

2. **insight**
   - Discovery relevant across sessions (people, projects, systems)
   - _Example_: "The legacy authentication service requires a specific header format"

3. **confidence**
   - Assessment of completeness or certainty
   - _Example_: "High confidence that the database migration is safe to run"

4. **pattern_seed**
   - Early observation that might evolve into a pattern
   - _Example_: "User frequently requests tests to be written in Jest before implementation"

5. **commitment**
   - Promise or expectation set for future work
   - _Example_: "Promised to update the documentation after the API change"

6. **learning**
   - Technical or system knowledge acquired
   - _Example_: "Discovered that the API rate limit is 100 req/min, not 1000"

7. **correction**
   - User correction of agent behavior or assumptions
   - _Example_: "User corrected the assumption that we use Redux; we use Zustand"

8. **cross_agent**
   - Information specifically for other agents
   - _Example_: "Note for future agents: The test database must be seeded before running integration tests"

9. **workflow_note**
   - Deviation from default workflow with reasoning
   - _Example_: "Skipped unit tests for this hotfix due to time constraints"

10. **gap**
    - Identified missing information or capability
    - _Example_: "Missing access credentials for the staging environment"

## 12 Entity Types

Entities help link memories to specific contexts. Use these types in the `related_entities` array:

1. **person** - Individuals involved (e.g., "Alice", "Project Manager")
2. **project** - Project names or codes (e.g., "frontend-rewrite")
3. **file** - Specific files or directories (e.g., "src/auth.ts")
4. **business** - Business logic or domain concepts
5. **event** - Meetings, deadlines, or incidents
6. **task** - Specific work items or tickets
7. **reminder** - Time-based or condition-based triggers
8. **workstream** - Ongoing areas of effort
9. **space** - Conceptual or physical workspaces
10. **orbit** - Social or organizational circles
11. **command** - CLI commands or tools
12. **agent** - AI agents or bots

## Confidence Scoring Guide

Assign a confidence score (0-100) to each memory:

- **90-100**: Explicit statement in the record (Fact)
- **70-89**: Strongly implied by context (Strong Inference)
- **50-69**: Reasonable inference with some uncertainty (Weak Inference)
- **< 50**: Do not extract (Too uncertain)
