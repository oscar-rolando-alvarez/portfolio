#!/usr/bin/env bash
# Mints a short-lived HS256 access token for local/demo use with the docker-compose stack.
# Usage: JWT_SIGNING_KEY_BASE64=... ./scripts/dev-token.sh <user> <tenant-guid> [roles,comma,separated]
# Production deployments should use a real identity provider (Entra ID, Auth0, Keycloak) instead.
set -euo pipefail

user="${1:?user id required}"
tenant="${2:?tenant id (GUID) required}"
roles="${3:-editor}"
key_b64="${JWT_SIGNING_KEY_BASE64:?set JWT_SIGNING_KEY_BASE64 (same value as in .env)}"
issuer="${JWT_ISSUER:-document-management-dev}"
audience="${JWT_AUDIENCE:-document-management-api}"

b64url() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }

roles_json="[$(printf '%s' "$roles" | awk -F, '{for (i = 1; i <= NF; i++) printf "%s\"%s\"", (i > 1 ? "," : ""), $i}')]"
now=$(date +%s)
header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
payload=$(printf '{"sub":"%s","tenant_id":"%s","role":%s,"iss":"%s","aud":"%s","iat":%d,"nbf":%d,"exp":%d}' \
  "$user" "$tenant" "$roles_json" "$issuer" "$audience" "$now" "$now" "$((now + 3600))" | b64url)
key_hex=$(printf '%s' "$key_b64" | openssl base64 -d -A | od -An -tx1 | tr -d ' \n')
signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$key_hex" -binary | b64url)

printf '%s.%s.%s\n' "$header" "$payload" "$signature"
