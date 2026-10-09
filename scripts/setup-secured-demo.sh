#!/usr/bin/env bash
# Set up the "secured" Communities demo, where Stardog itself enforces who may change what.
#
#   STARDOG_ADMIN_USER=admin STARDOG_ADMIN_PASSWORD=... scripts/setup-secured-demo.sh [database]
#
# Uses only Stardog's HTTP API (curl), so it needs no Stardog client. It is safe to re-run:
# the database is rebuilt from the sample, roles and users are created or updated, and every
# account gets a NEW random password, written to demo-accounts.local (gitignored, never commit it).
#
# What Stardog enforces (named-graph security on the database):
#   everyone signed in (and the app's shared account)  read everything, write only VOCAB:GOVERNANCE
#                                                      (so they can propose, comment and review)
#   alice (Physics owner)    also write urn:vocab:physics  and VOCAB:MAPPINGS
#   bob   (Business owner)   also write urn:vocab:business and VOCAB:MAPPINGS
#   carol (member)           nothing more: can propose, cannot change any vocabulary or mapping
# The app's shared account (vocab_app) is not an admin: it can read and write data in databases,
# but cannot create or drop databases or manage users.
set -euo pipefail

URL="${STARDOG_URL:-http://localhost:5820}"
ADMIN="${STARDOG_ADMIN_USER:?set STARDOG_ADMIN_USER}:${STARDOG_ADMIN_PASSWORD:?set STARDOG_ADMIN_PASSWORD}"
DB="${1:-vocab_communities_secured}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/demo-accounts.local"
JSON='Content-Type: application/json'

# api METHOD PATH [JSON]  → prints the HTTP status; the response body is kept in $BODY_FILE
BODY_FILE=$(mktemp); trap 'rm -f "$BODY_FILE"' EXIT
api() {
  if [ $# -ge 3 ]; then
    curl -s -o "$BODY_FILE" -w '%{http_code}' -u "$ADMIN" -X "$1" -H "$JSON" -d "$3" "$URL$2"
  else
    curl -s -o "$BODY_FILE" -w '%{http_code}' -u "$ADMIN" -X "$1" "$URL$2"
  fi
}
expect() { # expect "what" status allowed...  (an "already exists" answer also counts as success)
  local what=$1 status=$2; shift 2
  for ok in "$@"; do [ "$status" = "$ok" ] && return 0; done
  grep -q '"code":"SE0RE2"' "$BODY_FILE" 2>/dev/null && return 0
  echo "FAILED: $what (HTTP $status): $(head -c 300 "$BODY_FILE")" >&2; exit 1
}
password() { openssl rand -hex 12; } # 24 hex characters
chars() { printf '%s' "$1" | sed 's/./"&",/g; s/,$//'; } # "abc" → "a","b","c" (Stardog wants a char array)

echo "→ database $DB (rebuilt from the sample)"
api DELETE "/admin/databases/$DB" > /dev/null || true
status=$(curl -s -o /dev/null -w '%{http_code}' -u "$ADMIN" -X POST "$URL/admin/databases" \
  -F "root={\"dbname\":\"$DB\",\"options\":{\"security.named.graphs\":true,\"query.all.graphs\":true,\"voicebox.enabled\":true,\"search.enabled\":true,\"search.semantic.enabled\":true},\"files\":[]}")
expect "create database" "$status" 201
load() { # load FILE CONTENT-TYPE [graph]
  local tx; tx=$(curl -s -u "$ADMIN" -X POST "$URL/$DB/transaction/begin")
  expect "load $1" "$(curl -s -o /dev/null -w '%{http_code}' -u "$ADMIN" -X POST -H "Content-Type: $2" \
    --data-binary "@$1" "$URL/$DB/$tx/add${3:+?graph-uri=$3}")" 200
  expect "commit $1" "$(curl -s -o /dev/null -w '%{http_code}' -u "$ADMIN" -X POST "$URL/$DB/transaction/commit/$tx")" 200
}
load "$ROOT/samples/multi-community-vocabulary.trig" application/trig
load "$ROOT/samples/voicebox-schema.ttl" text/turtle tag:stardog:api:context:schema

# JSON bodies are built in variables first: macOS's bash 3.2 brace-expands "{a,b}" inside "$(...)".
role() { local body="{\"rolename\":\"$1\"}" s; s=$(api POST /admin/roles "$body"); expect "role $1" "$s" 201; }
grant() { # grant ROLE ACTION TYPE RESOURCE...
  local r=$1 a=$2 t=$3; shift 3
  local res; res=$(printf '"%s",' "$@"); res="[${res%,}]"
  local body="{\"action\":\"$a\",\"resource_type\":\"$t\",\"resource\":$res}" s
  s=$(api PUT "/admin/permissions/role/$r" "$body"); expect "grant $a $t $* to $r" "$s" 201
}

echo "→ roles"
role vocab_app_role                      # the app's shared (proxy) account
grant vocab_app_role READ db '*'
grant vocab_app_role WRITE db '*'
grant vocab_app_role READ named-graph "$DB" '*'
grant vocab_app_role WRITE named-graph "$DB" VOCAB:GOVERNANCE
role vocab_member_role                   # anyone taking part in governance of $DB
grant vocab_member_role READ db "$DB"
grant vocab_member_role WRITE db "$DB"
grant vocab_member_role READ named-graph "$DB" '*'
grant vocab_member_role WRITE named-graph "$DB" VOCAB:GOVERNANCE
role vocab_physics_owner_role
grant vocab_physics_owner_role WRITE named-graph "$DB" urn:vocab:physics
grant vocab_physics_owner_role WRITE named-graph "$DB" VOCAB:MAPPINGS
role vocab_business_owner_role
grant vocab_business_owner_role WRITE named-graph "$DB" urn:vocab:business
grant vocab_business_owner_role WRITE named-graph "$DB" VOCAB:MAPPINGS

echo "→ users (new passwords in $OUT)"
: > "$OUT"; chmod 600 "$OUT"
{ echo "# Demo accounts for $DB on $URL, generated $(date -u +%FT%TZ). Do not commit (gitignored)."; echo; } >> "$OUT"
user() { # user NAME DESCRIPTION ROLE...
  local name=$1 desc=$2; shift 2
  local pw; pw=$(password)
  # Recreate the account (changing a password over HTTP needs the old one)
  api DELETE "/admin/users/$name" > /dev/null || true
  local body="{\"username\":\"$name\",\"password\":[$(chars "$pw")],\"superuser\":false}" s
  s=$(api POST /admin/users "$body"); expect "create user $name" "$s" 201
  for r in "$@"; do
    body="{\"rolename\":\"$r\"}"; s=$(api POST "/admin/users/$name/roles" "$body"); expect "give $name $r" "$s" 201 204
  done
  printf '%-10s %-26s  # %s\n' "$name" "$pw" "$desc" >> "$OUT"
  if [ "$name" = vocab_app ]; then APP_PW=$pw; fi
}
user vocab_app "the app's shared account (proxy)" vocab_app_role
user alice "owner of Physics" vocab_member_role vocab_physics_owner_role
user bob   "owner of Business Administration" vocab_member_role vocab_business_owner_role
user carol "member, owns no group" vocab_member_role
{ echo; echo "# For the app's .env (dev proxy):"; echo "STARDOG_USERNAME=vocab_app"; echo "STARDOG_PASSWORD=$APP_PW"; } >> "$OUT"

echo
echo "Done. Accounts and passwords: $OUT"
echo "Next: put the STARDOG_USERNAME/STARDOG_PASSWORD lines from that file in .env, restart 'npm run dev',"
echo "then in the app assign Physics → account alice and Business Administration → account bob (Communities → Groups)."
