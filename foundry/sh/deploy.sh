#!/usr/bin/env bash
# Deploys PoseidonT3, then SemaphoreVerifier + Semaphore (linked to PoseidonT3).
# Usage: ./sh/deploy.sh            (reads .env: HEDERA_RPC_URL, HEDERA_PRIVATE_KEY)
#        RPC=http://127.0.0.1:8545 PK=0x... ./sh/deploy.sh   (any EVM chain)
set -euo pipefail
# j FILE EXPR -> reads JSON with node (no jq needed)
j() { node -p "const d=require('./$1'); $2"; }
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
RPC="${RPC:-${HEDERA_RPC_URL:-https://testnet.hashio.io/api}}"
PK="${PK:-${HEDERA_PRIVATE_KEY:?set HEDERA_PRIVATE_KEY in .env}}"
LIB="node_modules/poseidon-solidity/PoseidonT3.sol:PoseidonT3"

echo "== 1/2 PoseidonT3 library"
POSEIDON_T3=$(forge create "$LIB" --rpc-url "$RPC" --private-key "$PK" --broadcast --json \
  | grep -o '"deployedTo"[^,}]*' | grep -o '0x[0-9a-fA-F]\{40\}')
echo "PoseidonT3 at $POSEIDON_T3"

echo "== 2/2 SemaphoreVerifier + Semaphore"
POSEIDON_T3="$POSEIDON_T3" forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" --private-key "$PK" --broadcast --slow \
  --libraries "$LIB:$POSEIDON_T3" ${FORGE_EXTRA:-}

CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
echo; cat "deployments/$CHAIN_ID.json"; echo
if [ "$CHAIN_ID" = "296" ]; then
  SEM=$(j "deployments/$CHAIN_ID.json" d.Semaphore)
  echo "HashScan: https://hashscan.io/testnet/contract/$SEM"
fi
