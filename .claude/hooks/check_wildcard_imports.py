#!/usr/bin/env python3
"""PreToolUse hook: blocks a new Python wildcard import (`from X import *`)
in Edit/Write/MultiEdit calls unless the line already carries a `# noqa`
suppression. Scoped to .py files only — `import * as X` in JS/TS is a
different, non-smelly construct and is not touched.

The codebase has two deliberate, already-noqa'd wildcard imports
(app/main.py, tests/conftest.py, both `# noqa: F403`) that register every
domain's models on Base.metadata before Alembic/tests run — those keep
working because the noqa exemption is unconditional, not path-specific.
"""

import json
import re
import sys

WILDCARD_IMPORT = re.compile(r"^\s*from\s+[\w.]+\s+import\s+\*", re.MULTILINE)


def _edited_text(tool_input: dict) -> str:
    parts = []
    if isinstance(tool_input.get("content"), str):
        parts.append(tool_input["content"])
    if isinstance(tool_input.get("new_string"), str):
        parts.append(tool_input["new_string"])
    for edit in tool_input.get("edits") or []:
        if isinstance(edit, dict) and isinstance(edit.get("new_string"), str):
            parts.append(edit["new_string"])
    return "\n".join(parts)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    tool_input = data.get("tool_input") or {}
    file_path = tool_input.get("file_path") or ""
    if not file_path.endswith(".py"):
        return

    text = _edited_text(tool_input)
    offenders = []
    for match in WILDCARD_IMPORT.finditer(text):
        line_end = text.find("\n", match.end())
        line = text[match.start() : line_end if line_end != -1 else len(text)]
        if "noqa" not in line:
            offenders.append(line.strip())

    if offenders:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "Wildcard import without a `# noqa` suppression: "
                            + "; ".join(offenders)
                            + ". Import the specific names you need, or add "
                            "`# noqa: F403` if a wildcard import is genuinely "
                            "intended (e.g. registering ORM models on "
                            "Base.metadata, matching app/main.py)."
                        ),
                    }
                }
            )
        )


if __name__ == "__main__":
    main()
