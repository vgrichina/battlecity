#!/usr/bin/env bash
# Interactive RE loop: run Claude sessions (interactive, not headless) until tasks done.
# Each session starts with a prompt; you watch/interact, then exit to trigger the next.
# Usage: ./re_loop.sh [--max N] [--tasks N] [--dry-run]
set -euo pipefail

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
mkdir -p re_loop_sessions
RUN_TS=$(date '+%Y%m%d_%H%M%S')

for (( i=1; i<=MAX; i++ )); do
  [[ $(remaining) -eq 0 ]] && echo "All tasks done!" && break
  echo ""
  echo "=== Session $i ($(remaining) tasks left) ==="
  [[ "$DRY" == true ]] && echo "[dry-run]" && break

  LOG="re_loop_sessions/${RUN_TS}_session_$(printf '%03d' $i).txt"

  PROMPT="Continue the Battle City NES reverse-engineering and web port project.

Before picking a task, read the 2-3 most recent session logs in re_loop_sessions/ (format: YYYYMMDD_HHMMSS_session_NNN.txt, sorted by name — pick the last few). Skim them to understand what was just investigated and what dead ends were hit, so you don't repeat the same work.

Then read REVERSE.md Next Tasks. Pick the top $TASKS unchecked items (\`- [ ]\`).

Tasks fall into two categories:

**RE investigation tasks** (dis.py / xref.py / search_bytes.py / decode_tables.py):
1. Run 2-3 investigation tool calls.
2. Immediately write findings to REVERSE.md and new addresses to labels.csv.
3. Repeat: a few more tool calls, then write again.
Do not batch all investigation before writing — write after every few tool calls.

**Web port fix tasks** (editing web/game.js or creating web/ files):
1. Read the relevant section of web/game.js first.
2. Apply the fix described in REVERSE.md (ROM addresses and correct values are documented).
3. Update REVERSE.md to mark the task done and note what was changed.
No need to re-investigate ROM — all values are already documented in REVERSE.md.

Mark task done (\`- [x]\`) once fully documented/implemented.
End your final message with: SESSION_SUMMARY: <one line>

RE tools:
  python dis.py <bank>:<addr> [lines]
  python xref.py <addr>
  python search_bytes.py <hex> [--context N] [--disasm]
  python decode_tables.py <bank> <addr> <count> <fmt>
  python extract_tiles.py
  python analyze_tiles.py   (write this script to project dir if needed, then run it)

IMPORTANT tool rules — violations will be blocked:
- Use the Read tool (NOT cat/head/tail via Bash) to read files
- Use the Grep tool (NOT grep/rg via Bash) to search file contents
- Use the Glob tool (NOT ls/find via Bash) to list files
- Do NOT run python3 inline scripts (python3 - <<'EOF') — write a .py file first, then run it
- Do NOT use xxd or other system tools; use python search_bytes.py instead

Do not re-document already-covered addresses. Stop after $TASKS tasks."

  echo "$PROMPT" | claude -p \
    --output-format stream-json \
    --max-turns 50 \
    --allowedTools "Bash(python dis.py*),Bash(python xref.py*),Bash(python search_bytes.py*),Bash(python decode_tables.py*),Bash(python extract_tiles.py*),Bash(python render_screen.py*),Bash(python render_sprites.py*),Bash(python extract_level_maps.py*),Bash(python render_level.py*),Bash(python render_frame.py*),Bash(python compare_frames.py*),Bash(python dump_tiles.py*),Bash(python analyze_*),Bash(python3 analyze_*),Bash(python audit_*),Bash(python3 audit_*),Bash(python check_*),Bash(python3 check_*),Bash(python gen_*),Bash(python3 gen_*),Bash(python3 -m http.server*),Read,Edit,Write,Glob,Grep" \
    | jq --unbuffered -r '
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
      ' | tee "$LOG" &
  wait $!

  SUMMARY=$(git diff REVERSE.md | grep '^+- \[x\]' | head -1 | sed 's/^+- \[x\] //' || true)
  [[ -z "$SUMMARY" ]] && SUMMARY="session $i progress"

  git add REVERSE.md labels.csv comments.csv web/ *.py
  if git diff --cached --quiet; then
    echo "No changes — retrying same task..."
    continue
  fi

  git commit -m "RE loop session $i: $SUMMARY"
  echo "Committed: $SUMMARY"
  sleep 1
done

echo ""
echo "Done. Remaining tasks: $(remaining)"
