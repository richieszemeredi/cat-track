#!/bin/bash
# PreToolUse (Bash): .husky/pre-push is the one local gate (CLAUDE.md), so an
# agent must not skip it. Exit 2 blocks the call and returns stderr to the agent.
cmd=$(jq -r '.tool_input.command // empty')
if printf '%s' "$cmd" | grep -Eq -e '--no-verify' -e 'core\.hooksPath' -e 'HUSKY=0' -e 'HUSKY_SKIP' -e 'git[^|;&]*push[^|;&]* -[a-zA-Z]*n[a-zA-Z]*( |$)'; then
  echo "Blocked: don't bypass the git hooks (--no-verify, core.hooksPath, HUSKY=0). .husky/pre-push is the project's gate; fix what it reports, or ask the user." >&2
  exit 2
fi
exit 0
