#!/usr/bin/env bash
# Ask local Stardog Voicebox a question about the MBSE demo database.
#   ./ask-voicebox.sh "Which requirements are verified by an analysis that uses a simulation model?"
# Needs the local Stardog (localhost:5820, admin/admin) and Voicebox (localhost:8000) containers.
# Takes 10-60 seconds per question.
set -euo pipefail
Q="${1:?Put your question in quotes after the command}"
DB="${MBSE_DB:-vocab_mbse_demo}"
AUTH="${STARDOG_ADMIN_USER:-admin}:${STARDOG_ADMIN_PASSWORD:-admin}"
TOK=$(curl -s -u "$AUTH" http://localhost:5820/admin/token | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
CONV=$(python3 -c 'import uuid; print(uuid.uuid4())')
BODY=$(python3 -c 'import json,sys; print(json.dumps({"endpoint":"http://stardog:5820","database":sys.argv[1],"model":"default","question":sys.argv[2],"reasoning":True,"named_graphs":[]}))' "$DB" "$Q")
echo "Asking Voicebox about $DB ..."
printf '%s' "$BODY" | curl -s -m 180 -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  --data-binary @- "http://localhost:8000/voicebox/v4/$CONV/ask-sync" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(); print(d.get("answer") or d.get("error") or d)'
