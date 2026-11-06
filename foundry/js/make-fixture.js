// Generates a Semaphore proof fixture that Foundry tests and scripts replay.
// Identities are deterministic, so the group root (and therefore the proof) is
// the same on every chain where these three commitments are added in order.
//
// Two cycles are emitted. `proof` is the owner's first listing. An approval is
// single-use (RentalRegistry calls validateProof), so a second listing of the same
// room needs a fresh application: `cycle2` is that re-application - a NEW identity,
// approved on top of the first three, listing a later period.
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

  // Cycle 1 deliberately spans "now" (2026-10-01 -> 2027-06-30), so a freshly bought room
  // reads isValid() == true and the tenant QR page shows a live tenancy rather than
  // "period has not started". Update these before they lapse.
  const terms = { room: 2, start: 1790812800, end: 1814313600, priceUsdc6: "1200000000", payout: "0x000000000000000000000000000000000000dEaD" };
  const message = BigInt(solidityPackedKeccak256(["uint256", "uint64", "uint64", "uint256", "address"], [terms.room, terms.start, terms.end, terms.priceUsdc6, terms.payout]));
  const scope = BigInt(terms.room); // nullifier = private, stable room tag

  const p = await generateProof(owners[1], group, message, scope);

  // Cycle 2: owner #2 re-applies after the first period expired. Fresh identity, so a
  // fresh nullifier (room tag): the two cycles are not linkable on-chain.
  const owner2b = new Identity("rentmeout-demo-property-2-cycle2");
  const group2 = new Group([...commitments, owner2b.commitment.toString()]);
  // Cycle 2 is the next tenancy, after cycle 1 expires (2027-07-01 -> 2028-03-31).
  const terms2 = { room: 2, start: 1814400000, end: 1838073600, priceUsdc6: "1500000000", payout: terms.payout };
  const message2 = BigInt(solidityPackedKeccak256(["uint256", "uint64", "uint64", "uint256", "address"], [terms2.room, terms2.start, terms2.end, terms2.priceUsdc6, terms2.payout]));
  const p2 = await generateProof(owner2b, group2, message2, BigInt(terms2.room));
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
    cycle2: {
      note: "Re-application after expiry: new identity, approved as a 4th member, later period.",
      terms: terms2,
      commitment: owner2b.commitment.toString(),
      proof: {
        merkleTreeDepth: p2.merkleTreeDepth.toString(),
        merkleTreeRoot: p2.merkleTreeRoot.toString(),
        nullifier: p2.nullifier.toString(),
        message: p2.message.toString(),
        scope: p2.scope.toString(),
        points: p2.points.map(String),
      },
    },
    // Lets the test revoke owner #2 (Semaphore needs the Merkle siblings to remove a leaf).
    removeIndex: 1,
    removeSiblings: group.generateMerkleProof(1).siblings.map(String),
  };
  fs.writeFileSync(path.join(__dirname, "..", "fixtures", "proof.json"), JSON.stringify(out, null, 2));
  console.log("Wrote fixtures/proof.json");
  console.log("  cycle1 root", out.proof.merkleTreeRoot, "tag", out.proof.nullifier);
  console.log("  cycle2 root", out.cycle2.proof.merkleTreeRoot, "tag", out.cycle2.proof.nullifier);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
