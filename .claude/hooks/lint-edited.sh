#!/bin/bash
# PostToolUse (Write|Edit): lint the one file just changed, so a mistake
# surfaces while the agent is still editing rather than at pre-push.
# Exit 2 feeds the eslint output back to the agent.
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
case "$f" in
  */src/*.ts | */src/*.tsx | */tests/*.ts | */tests/*.tsx) ;;
  *) exit 0 ;;
esac
case "$f" in */routeTree.gen.ts) exit 0 ;; esac
[ -f "$f" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
out=$(npx --no-install eslint --no-warn-ignored "$f" 2>&1) && exit 0
printf '%s\n' "$out" >&2
exit 2
