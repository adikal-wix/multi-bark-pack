#!/bin/bash
# Wrapper that auto-restarts server on clean exit (code 0)
# SIGINT (ctrl+c) passes through to stop for real

trap 'kill $PID 2>/dev/null; exit 0' SIGINT SIGTERM

while true; do
    node server.js &
    PID=$!
    wait $PID
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo ""
        echo "Restarting in 3s..."
        sleep 3
    else
        echo ""
        echo "Server exited with code $EXIT_CODE. Stopping."
        exit $EXIT_CODE
    fi
done
