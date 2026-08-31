#!/bin/sh
set -eu

RUN_ID="${1:?Usage: run-v4-free-reaudit.sh RUN_ID}"
PID_FILE='/app/data/v4_1_corpus_reaudit.pid'
LOG_FILE='/app/data/v4_1_corpus_reaudit.log'

echo $$ > "$PID_FILE"
exec node "/app/Bible Millionaire Quiz/server/scripts/run-corpus-reaudit.mjs" \
    --process \
    --run="$RUN_ID" \
    --write \
    --limit=20000 \
    --delay-ms=200 \
    --wait-for-free-quota \
    > "$LOG_FILE" 2>&1
