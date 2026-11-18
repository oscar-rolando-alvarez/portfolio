#!/bin/sh
# fmt + validate + `terraform test` (mocked providers) for every module and environment.
# No cloud credentials needed. Run directly or via `docker compose run --rm terraform`.
set -eu
cd "$(dirname "$0")"
terraform fmt -check -recursive .
for dir in modules/data_lake modules/mwaa modules/snowflake modules/databricks modules/observability envs/prod; do
  echo "== $dir"
  terraform -chdir="$dir" init -backend=false -input=false -no-color >/dev/null
  terraform -chdir="$dir" validate -no-color
  terraform -chdir="$dir" test -no-color
done
