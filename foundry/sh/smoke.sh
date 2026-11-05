#!/usr/bin/env bash
# On-chain check: group + 3 members via forge script, then the proof is verified
# with eth_call so the pairing check runs on the target chain's EVM.
set -euo pipefail
# j FILE EXPR -> reads JSON with node (no jq needed)
j() { node -p "const d=require('./$1'); $2"; }
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
RPC="${RPC:-${HEDERA_RPC_URL:-https://testnet.hashio.io/api}}"
PK="${PK:-${HEDERA_PRIVATE_KEY:?set HEDERA_PRIVATE_KEY in .env}}"
LIB="node_modules/poseidon-solidity/PoseidonT3.sol:PoseidonT3"
CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
FILE="deployments/$CHAIN_ID.json"
POSEIDON_T3=$(j "$FILE" d.PoseidonT3)
SEM=$(j "$FILE" d.Semaphore)

forge script script/Smoke.s.sol:Smoke --rpc-url "$RPC" --private-key "$PK" --broadcast --slow \
  --libraries "$LIB:$POSEIDON_T3" ${FORGE_EXTRA:-}
GROUP=$(j "$FILE" d.smokeGroupId)

P=fixtures/proof.json
# tuple MESSAGE -> SemaphoreProof as a cast tuple string
tuple() { node -p "const p=require('./$P').proof; '('+[p.merkleTreeDepth,p.merkleTreeRoot,p.nullifier,'$1',p.scope].join(',')+',['+p.points.join(',')+'])'"; }
MSG=$(j $P d.proof.message)
BADMSG=$(node -p "(BigInt('$MSG')+1n).toString()")
SIG="verifyProof(uint256,(uint256,uint256,uint256,uint256,uint256,uint256[8]))(bool)"

ok=$(cast call "$SEM" "$SIG" "$GROUP" "$(tuple "$MSG")" --rpc-url "$RPC")
gas=$(cast estimate "$SEM" "$SIG" "$GROUP" "$(tuple "$MSG")" --rpc-url "$RPC" || echo "n/a")
bad=$(cast call "$SEM" "$SIG" "$GROUP" "$(tuple "$BADMSG")" --rpc-url "$RPC" 2>/dev/null || echo false)

echo "Group $GROUP | valid proof: $ok (~$gas gas) | tampered terms: $bad"
[ "$ok" = "true" ] && [ "$bad" = "false" ] && echo "SMOKE TEST PASSED" || { echo "SMOKE TEST FAILED"; exit 1; }
