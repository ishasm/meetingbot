#!/bin/bash

# Script to monitor bot deployment and check if speaker tracking is working
# Usage: ./test-speaker-tracking.sh <bot-id>

BOT_ID=${1:-"latest"}

echo "=========================================="
echo "Speaker Tracking Test Monitor"
echo "=========================================="
echo ""

if [ "$BOT_ID" = "latest" ]; then
    echo "Monitoring logs for the most recent bot..."
    echo "Press Ctrl+C to stop"
    echo ""
    docker compose logs server -f | grep -E "Bot [0-9]+|participant|speaker|People|timeframe" --color=always
else
    echo "Monitoring logs for Bot $BOT_ID..."
    echo "Press Ctrl+C to stop"
    echo ""
    docker compose logs server -f | grep -E "Bot $BOT_ID" --color=always | grep -E "participant|speaker|People|timeframe" --color=always
fi
