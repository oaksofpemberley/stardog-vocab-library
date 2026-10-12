#!/usr/bin/env bash
# Builds (or rebuilds, wiping all governance work) the local MBSE demo database.
# Run it before every demo to start clean:   ./setup-mbse-demo.sh
#
# - creates vocab_mbse_demo with the Voicebox options
# - loads mbse-vocabulary.trig and the app's Voicebox schema
# - lets the app's shared account (vocab_app) write to it, so the demo works without signing in
#
# Uses the local admin account (admin/admin by default; override with STARDOG_ADMIN_USER/PASSWORD).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/../.."
URL="${STARDOG_URL:-http://localhost:5820}"
DB="${MBSE_DB:-vocab_mbse_demo}"
AUTH="${STARDOG_ADMIN_USER:-admin}:${STARDOG_ADMIN_PASSWORD:-admin}"

c() { curl -s -u "$AUTH" "$@"; }
check() { [ "$2" = "$3" ] || { echo "FAILED: $1 (HTTP $2)" >&2; exit 1; }; }

echo "→ rebuilding $DB"
c -o /dev/null -X DELETE "$URL/admin/databases/$DB" || true
s=$(c -o /dev/null -w '%{http_code}' -X POST "$URL/admin/databases" \
  -F 'root={"dbname":"'"$DB"'","options":{"query.all.graphs":true,"voicebox.enabled":true,"search.enabled":true,"search.semantic.enabled":true},"files":[]}')
check "create database" "$s" 201

load() { # load FILE CONTENT-TYPE [graph]
  local tx; tx=$(c -X POST "$URL/$DB/transaction/begin")
  check "load $1" "$(c -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: $2" --data-binary "@$1" "$URL/$DB/$tx/add${3:+?graph-uri=$3}")" 200
  check "commit $1" "$(c -o /dev/null -w '%{http_code}' -X POST "$URL/$DB/transaction/commit/$tx")" 200
}
load "$HERE/mbse-vocabulary.trig" application/trig
load "$APP/samples/voicebox-schema.ttl" text/turtle tag:stardog:api:context:schema
load "$HERE/mbse-voicebox-schema.ttl" text/turtle tag:stardog:api:context:schema

# Dropping a database also drops its grants, so grant the shared app account again every time.
if c "$URL/admin/roles" | grep -q "\"vocab_app_role\""; then
  s=$(c -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    -d '{"action":"WRITE","resource_type":"db","resource":["'"$DB"'"]}' "$URL/admin/permissions/role/vocab_app_role")
  check "grant vocab_app write" "$s" 201
  echo "→ vocab_app may write $DB"
else
  echo "→ no vocab_app_role found; the app's shared account is used as configured in .env"
fi

n=$(c -H 'Accept: application/sparql-results+json' --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } }' "$URL/$DB/query" | sed 's/.*"value":"\([0-9]*\)".*/\1/')
echo "✓ $DB ready ($n triples). Open http://localhost:5180 and pick $DB."
