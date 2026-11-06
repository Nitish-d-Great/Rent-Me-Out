import { createPublicClient, http, parseAbiItem } from "viem";
import { hederaTestnet, registryAddress } from "./registry";

/**
 * The approved-property set, rebuilt from the registry's own events.
 *
 * The contract stores only Merkle roots, not the member list, so a prover needs the
 * membership to rebuild the tree. Deriving it from PropertyApproved / PropertyRevoked
 * means the app depends on the chain rather than on a fixture file that can drift out
 * of step with what is deployed.
 */

const APPROVED = parseAbiItem(
  "event PropertyApproved(bytes32 indexed applicationId, uint256 indexed commitment, uint256 rootVersion, uint256 root)",
);
const REVOKED = parseAbiItem(
  "event PropertyRevoked(uint256 indexed commitment, uint256 rootVersion, uint256 root)",
);

/** Hashio rejects very wide ranges; the registry is recent, so a bounded window is enough. */
const LOOKBACK = 200_000n;

export interface GroupSnapshot {
  /** Commitments in the order they were approved -- the order the tree was built in. */
  members: string[];
  rootVersion: string;
}

export async function readGroup(): Promise<GroupSnapshot> {
  const pub = createPublicClient({ chain: hederaTestnet, transport: http() });
  const address = registryAddress();
  const tip = await pub.getBlockNumber();
  const fromBlock = tip > LOOKBACK ? tip - LOOKBACK : 0n;

  const [approved, revoked] = await Promise.all([
    pub.getLogs({ address, event: APPROVED, fromBlock, toBlock: tip }),
    pub.getLogs({ address, event: REVOKED, fromBlock, toBlock: tip }),
  ]);

  const gone = new Set(revoked.map((l) => l.args.commitment?.toString()));
  const members = approved
    .map((l) => l.args.commitment?.toString())
    .filter((c): c is string => Boolean(c) && !gone.has(c));

  const latest = approved.at(-1)?.args.rootVersion?.toString() ?? "0";
  return { members, rootVersion: latest };
}
