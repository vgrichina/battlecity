#!/usr/bin/env bash
# Interactive RE loop: run Claude sessions (interactive, not headless) until tasks done.
# Each session starts with a prompt; you watch/interact, then exit to trigger the next.
# Usage: ./re_loop.sh [--max N] [--tasks N] [--dry-run]
set -euo pipefail
set -x

cleanup() {
  echo ""; echo "Interrupted — killing session..."
  kill %1 2>/dev/null || true
  exit 130
}
trap cleanup INT TERM

MAX=50; TASKS=1; DRY=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --max)   MAX="$2";   shift 2 ;;
    --tasks) TASKS="$2"; shift 2 ;;
    --dry-run) DRY=true; shift ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

cd "$(dirname "$0")"
remaining() { grep -c '^- \[ \]' REVERSE.md 2>/dev/null || true; }


for (( i=1; i<=MAX; i++ )); do
  [[ $(remaining) -eq 0 ]] && echo "All tasks done!" && break
  echo ""
  echo "=== Session $i ($(remaining) tasks left) ==="
  [[ "$DRY" == true ]] && echo "[dry-run]" && break

  PROMPT="Continue the Battle City NES reverse-engineering project.

Read REVERSE.md Next Tasks. Pick the top $TASKS unchecked items (\`- [ ]\`).
For each task:
1. Run 2-3 investigation tool calls.
2. Immediately write findings to REVERSE.md and new addresses to labels.csv.
3. Repeat: a few more tool calls, then write again.
Do not batch all investigation before writing — write after every few tool calls.
Mark task done (\`- [x]\`) once fully documented.
End your final message with: SESSION_SUMMARY: <one line>

Tools:
  python dis.py <bank>:<addr> [lines]
  python xref.py <addr>
  python search_bytes.py <hex> [--context N] [--disasm]
  python decode_tables.py <bank> <addr> <count> <fmt>

Do not re-document already-covered addresses. Stop after $TASKS tasks."

  echo "$PROMPT" | claude -p \
    --output-format stream-json \
    --max-turns 50 \
    --allowedTools "Bash(python dis.py*),Bash(python xref.py*),Bash(python search_bytes.py*),Bash(python decode_tables.py*),Bash(python extract_tiles.py*),Bash(python render_screen.py*),Bash(python extract_level_maps.py*),Read,Edit,Write,Glob,Grep" \
    | jq -r '
        if .type == "assistant" then
          .message.content[] |
          if .type == "text" then .text
          elif .type == "tool_use" then
            if .name == "Bash" then
              "  \u25b6 \(.input.command | split("\n")[0] | .[0:100])"
            elif .name == "Read" then
              "  \u25b6 Read \(.input.file_path | split("/")[-1])\(if .input.offset then " +\(.input.offset)" else "" end)"
            elif .name == "Write" then
              "  \u25b6 Write \(.input.file_path | split("/")[-1])\n\(.input.content)"
            elif .name == "Edit" then
              "  \u25b6 Edit \(.input.file_path | split("/")[-1])\n--- old\n\(.input.old_string)\n+++ new\n\(.input.new_string)"
            elif .name == "Grep" then
              "  \u25b6 Grep \"\(.input.pattern)\" \(.input.path // "")"
            elif .name == "Glob" then
              "  \u25b6 Glob \(.input.pattern)"
            else
              "  \u25b6 \(.name) \(.input | keys | join(" "))"
            end
          else empty
          end
        else empty
        end
      ' &
  wait $!

  SUMMARY=$(git diff REVERSE.md | grep '^+- \[x\]' | head -1 | sed 's/^+- \[x\] //' || true)
  [[ -z "$SUMMARY" ]] && SUMMARY="session $i progress"

  git add REVERSE.md labels.csv comments.csv
  if git diff --cached --quiet; then
    echo "No changes — stopping loop."
    break
  fi

  git commit -m "RE loop session $i: $SUMMARY"
  echo "Committed: $SUMMARY"
  sleep 1
done

echo ""
echo "Done. Remaining tasks: $(remaining)"
