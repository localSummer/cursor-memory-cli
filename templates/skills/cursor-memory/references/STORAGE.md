# Storage & Schema

This reference defines the storage mechanism and data structure for Cursor Memory.

## JSON Schema

Memories are stored in JSON files with the following structure:

```json
{
  "session_id": "YYYY-MM-DD-HH-MM-SS-session-name",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "last_updated": "YYYY-MM-DDTHH:MM:SSZ",
  "extraction_count": 1,
  "memories": [
    {
      "type": "decision|insight|...",
      "category": "technical|workflow|...",
      "title": "Short summary (max 100 chars)",
      "content": "Full description of the memory",
      "source_chunk": "Original conversation snippet with **User:** and **Assistant:** markers",
      "reasoning": "Why this is important (optional)",
      "alternatives": [{"option": "X", "why_not": "Reason"}],
      "selected_option": "Selected option (for decisions)",
      "confidence_score": 50-100,
      "related_entities": [
        {
          "type": "person|project|...",
          "raw": "Text found in record",
          "slug": "normalized-slug-or-null",
          "resolved": false
        }
      ],
      "tools_mentioned": ["tool_name"],
      "urls_mentioned": ["https://..."],
      "target_agents": ["agent_name"]
    }
  ],
  "suggestions": []
}
```

## Storage Location

Memories are stored relative to the current working directory:

```
./memories/
├── YYYY-MM-DD/                  # Date directory
│   ├── HH-MM-SS-session-name.json  # Session file
│   └── ...
```

## Single Session Single File Mechanism

To ensure all memories from a single session are stored together:

1.  **Session ID Generation**:
    - Extract the session start time from the first message timestamp.
    - Format: `YYYY-MM-DD-HH-MM-SS`.
    - Combine with normalized session name: `YYYY-MM-DD-HH-MM-SS-session-name`.

2.  **File Path**:
    - `date = session_start_time[:10]`
    - `time = session_start_time[11:19]`
    - `path = ./memories/{date}/{time}-{session_name}.json`

3.  **Merge Logic (Deduplication)**:
    - When writing, check if the file exists.
    - If it exists, read existing memories.
    - **Deduplicate**:
        - Key: `(type, title)`
        - If Key matches AND Jaccard Similarity > 0.85:
            - Keep the version with higher `confidence_score`.
    - Update `last_updated` and increment `extraction_count`.
    - Write back the merged list.
