#!/usr/bin/env bash
# End-to-end smoke test against a running server (default http://127.0.0.1:3000) backed by a
# migrated + seeded database. Used by CI; handy locally after `npm run build && npm start`.
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const v=JSON.parse(d);console.log($1)})"; }

echo "health"
curl -sf "$BASE_URL/api/health" | grep -q '"database":"up"' || fail "database not reachable"

echo "anonymous access is rejected"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/posts/feed")" = "401" ] || fail "feed should require auth"

echo "register"
SUFFIX="$(date +%s)$RANDOM"
curl -sf -c "$JAR" -H 'content-type: application/json' \
  -d "{\"email\":\"smoke$SUFFIX@example.com\",\"username\":\"smoke$SUFFIX\",\"password\":\"Sm0kePassw0rd\"}" \
  "$BASE_URL/api/auth/register" > /dev/null || fail "register"

echo "follow alice and read the feed"
curl -sf -b "$JAR" -c "$JAR" -X POST "$BASE_URL/api/users/alice/follow" | grep -q '"following":true' || fail "follow"
FEED="$(curl -sf -b "$JAR" "$BASE_URL/api/posts/feed")"
[ "$(echo "$FEED" | json 'v.posts.length')" -gt 0 ] || fail "feed is empty"

echo "create, like and comment on a post"
POST_ID="$(curl -sf -b "$JAR" -H 'content-type: application/json' -d '{"content":"Hello from the smoke test"}' "$BASE_URL/api/posts" | json 'v.id')"
curl -sf -b "$JAR" -X POST "$BASE_URL/api/posts/$POST_ID/like" | grep -q '"liked":true' || fail "like"
curl -sf -b "$JAR" -H 'content-type: application/json' -d '{"content":"first!"}' "$BASE_URL/api/posts/$POST_ID/comments" > /dev/null || fail "comment"

echo "moderation flags spam"
curl -sf -b "$JAR" -H 'content-type: application/json' -d '{"content":"Buy followers now"}' "$BASE_URL/api/posts" | grep -q '"moderation":"FLAGGED"' || fail "moderation"

echo "direct message"
CONVO="$(curl -sf -b "$JAR" -H 'content-type: application/json' -d '{"username":"alice"}' "$BASE_URL/api/conversations" | json 'v.id')"
curl -sf -b "$JAR" -H 'content-type: application/json' -d '{"content":"hi alice"}' "$BASE_URL/api/conversations/$CONVO/messages" > /dev/null || fail "send message"

echo "server-side rendered home page"
curl -sf -b "$JAR" "$BASE_URL/" | grep -q 'Hello from the smoke test' || fail "SSR feed"

echo "logout revokes the session"
curl -sf -b "$JAR" -c "$JAR" -X POST "$BASE_URL/api/auth/logout" > /dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE_URL/api/auth/me")" = "401" ] || fail "logout"

echo "smoke test passed"
