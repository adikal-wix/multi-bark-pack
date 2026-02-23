#!/bin/bash
# Crontab-friendly script: ensures the server is always running.
# If the server is already up, exits silently.
# Usage: * * * * * /path/to/ensure-server.sh
#
# Logs to .bark-tmp/ensure-server.log (max 100KB, rotates 1 backup)

DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/.bark-tmp/ensure-server.log"
PORT=3333
MAX_LOG_BYTES=102400  # 100KB

# Already running? Exit silently.
if lsof -ti:$PORT >/dev/null 2>&1; then
    exit 0
fi

mkdir -p "$DIR/.bark-tmp"

# Rotate log if too large
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null)" -gt "$MAX_LOG_BYTES" ]; then
    mv "$LOG" "$LOG.old"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') Server not running — starting..." >> "$LOG"

cd "$DIR"
nohup bash start.sh >> "$LOG" 2>&1 &
echo "$(date '+%Y-%m-%d %H:%M:%S') Started (PID $!)" >> "$LOG"
