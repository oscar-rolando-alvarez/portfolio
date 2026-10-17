#!/usr/bin/env bash
# Build the arm64 Lambda deployment package (one zip, four handlers).
# Cross-installs manylinux aarch64 wheels so it works from macOS/x86 CI too.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=dist
rm -rf "$OUT/lambda" "$OUT/lambda.zip"
mkdir -p "$OUT/lambda"

# Runtime dependencies only (no dev / local groups).
uv export --frozen --no-default-groups --no-emit-project --no-hashes --format requirements-txt -o "$OUT/requirements.txt" >/dev/null
uv pip install --quiet \
  --target "$OUT/lambda" \
  --python-platform aarch64-manylinux2014 \
  --python-version 3.13 \
  --only-binary :all: \
  -r "$OUT/requirements.txt"
cp -R src/fleetintel "$OUT/lambda/"

# Strip what Lambda never needs.
find "$OUT/lambda" -type d -name "__pycache__" -prune -exec rm -rf {} +
find "$OUT/lambda" -type d \( -name "tests" -o -name "*.dist-info" \) -prune -exec rm -rf {} +

(cd "$OUT/lambda" && zip -qr9 ../lambda.zip .)
unzipped=$(du -sk "$OUT/lambda" | cut -f1)
zipped=$(du -k "$OUT/lambda.zip" | cut -f1)
echo "lambda.zip: ${zipped} KiB zipped, ${unzipped} KiB unzipped"
# AWS limits: 50 MB zipped (direct upload), 250 MB unzipped.
test "$zipped" -lt 51200
test "$unzipped" -lt 256000
# Handlers referenced by Terraform must be present, and native wheels must target arm64.
for h in stream workers api; do test -f "$OUT/lambda/fleetintel/handlers/$h.py"; done
ls "$OUT"/lambda/pydantic_core/_pydantic_core*aarch64*.so >/dev/null
