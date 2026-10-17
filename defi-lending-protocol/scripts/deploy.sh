#!/usr/bin/env bash
# Build and deploy the workspace programs with the Anchor CLI.
#
#   ./scripts/deploy.sh [localnet|devnet|mainnet]
#
# `anchor keys sync` rewrites declare_id!/Anchor.toml to match the program
# keypairs in target/deploy, so deployments always use your own program ids.
set -euo pipefail

CLUSTER="${1:-devnet}"
case "$CLUSTER" in
  localnet | devnet | mainnet) ;;
  *)
    echo "usage: $0 [localnet|devnet|mainnet]" >&2
    exit 1
    ;;
esac

cd "$(dirname "$0")/.."
command -v anchor >/dev/null || {
  echo "anchor CLI not found: https://www.anchor-lang.com/docs/installation" >&2
  exit 1
}

anchor keys sync --provider.cluster "$CLUSTER"
anchor build
anchor deploy --provider.cluster "$CLUSTER"
echo "Deployed to $CLUSTER. IDLs: target/idl/, TypeScript types: target/types/"
