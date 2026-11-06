// Generates a Semaphore proof fixture that Foundry tests and scripts replay.
// Identities are deterministic, so the group root (and therefore the proof) is
// the same on every chain where these three commitments are added in order.
// Usage: npm run fixture
const fs = require("fs");
const path = require("path");
const { Identity, Group, generateProof } = require("@semaphore-protocol/core");
const { solidityPackedKeccak256 } = require("ethers");

(async () => {
  // DEMO ONLY: fixed seeds. Real owners create a random Identity on their own device.
  const owners = ["rentmeout-demo-property-1", "rentmeout-demo-property-2", "rentmeout-demo-property-3"].map((s) => new Identity(s));
  const commitments = owners.map((o) => o.commitment.toString());
  const group = new Group(commitments);

  const terms = { room: 2, start: 1767225600, end: 1774915200, priceUsdc6: "1200000000", payout: "0x000000000000000000000000000000000000dEaD" };
  const message = BigInt(solidityPackedKeccak256(["uint256", "uint64", "uint64", "uint256", "address"], [terms.room, terms.start, terms.end, terms.priceUsdc6, terms.payout]));
  const scope = BigInt(terms.room); // nullifier = private, stable room tag

  const p = await generateProof(owners[1], group, message, scope);
  const out = {
    note: "Demo fixture. Owner #2 proves its property is approved, for listing terms below.",
    terms,
    commitments,
    proof: {
      merkleTreeDepth: p.merkleTreeDepth.toString(),
      merkleTreeRoot: p.merkleTreeRoot.toString(),
      nullifier: p.nullifier.toString(),
      message: p.message.toString(),
      scope: p.scope.toString(),
      points: p.points.map(String),
    },
    // Lets the test revoke owner #2 (Semaphore needs the Merkle siblings to remove a leaf).
    removeIndex: 1,
    removeSiblings: group.generateMerkleProof(1).siblings.map(String),
  };
  fs.writeFileSync(path.join(__dirname, "..", "fixtures", "proof.json"), JSON.stringify(out, null, 2));
  console.log("Wrote fixtures/proof.json  root", out.proof.merkleTreeRoot);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
