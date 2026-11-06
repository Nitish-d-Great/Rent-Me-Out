// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Vm} from "forge-std/Vm.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// Reads fixtures/proof.json (written by `npm run fixture`) into Solidity types.
library Fixture {
    /// The listing terms a proof is bound to, as `listingMessage` orders them.
    struct Terms {
        uint256 room;
        uint64 start;
        uint64 end;
        uint256 price;
        address payout;
    }

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    string private constant PATH = "fixtures/proof.json";

    function json() internal view returns (string memory) {
        return vm.readFile(PATH);
    }

    function commitments() internal view returns (uint256[] memory) {
        return vm.parseJsonUintArray(json(), ".commitments");
    }

    function proof() internal view returns (ISemaphore.SemaphoreProof memory) {
        return _proofAt(".proof");
    }

    /// The owner's re-application after the first period expired: a fresh identity
    /// (approved as a 4th member) listing a later period.
    function cycle2Proof() internal view returns (ISemaphore.SemaphoreProof memory) {
        return _proofAt(".cycle2.proof");
    }

    function terms() internal view returns (Terms memory) {
        return _termsAt(".terms");
    }

    function cycle2Terms() internal view returns (Terms memory) {
        return _termsAt(".cycle2.terms");
    }

    function _termsAt(string memory key) private view returns (Terms memory t) {
        string memory j = json();
        t.room = vm.parseJsonUint(j, string.concat(key, ".room"));
        t.start = uint64(vm.parseJsonUint(j, string.concat(key, ".start")));
        t.end = uint64(vm.parseJsonUint(j, string.concat(key, ".end")));
        t.price = vm.parseJsonUint(j, string.concat(key, ".priceUsdc6"));
        t.payout = vm.parseJsonAddress(j, string.concat(key, ".payout"));
    }

    function cycle2Commitment() internal view returns (uint256) {
        return vm.parseJsonUint(json(), ".cycle2.commitment");
    }

    function _proofAt(string memory key) private view returns (ISemaphore.SemaphoreProof memory p) {
        string memory j = json();
        p.merkleTreeDepth = vm.parseJsonUint(j, string.concat(key, ".merkleTreeDepth"));
        p.merkleTreeRoot = vm.parseJsonUint(j, string.concat(key, ".merkleTreeRoot"));
        p.nullifier = vm.parseJsonUint(j, string.concat(key, ".nullifier"));
        p.message = vm.parseJsonUint(j, string.concat(key, ".message"));
        p.scope = vm.parseJsonUint(j, string.concat(key, ".scope"));
        uint256[] memory pts = vm.parseJsonUintArray(j, string.concat(key, ".points"));
        for (uint256 i = 0; i < 8; i++) {
            p.points[i] = pts[i];
        }
    }

    function removeSiblings() internal view returns (uint256[] memory) {
        return vm.parseJsonUintArray(json(), ".removeSiblings");
    }
}
