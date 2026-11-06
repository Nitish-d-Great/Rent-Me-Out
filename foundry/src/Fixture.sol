// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Vm} from "forge-std/Vm.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// Reads fixtures/proof.json (written by `npm run fixture`) into Solidity types.
library Fixture {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    string private constant PATH = "fixtures/proof.json";

    function json() internal view returns (string memory) {
        return vm.readFile(PATH);
    }

    function commitments() internal view returns (uint256[] memory) {
        return vm.parseJsonUintArray(json(), ".commitments");
    }

    function proof() internal view returns (ISemaphore.SemaphoreProof memory p) {
        string memory j = json();
        p.merkleTreeDepth = vm.parseJsonUint(j, ".proof.merkleTreeDepth");
        p.merkleTreeRoot = vm.parseJsonUint(j, ".proof.merkleTreeRoot");
        p.nullifier = vm.parseJsonUint(j, ".proof.nullifier");
        p.message = vm.parseJsonUint(j, ".proof.message");
        p.scope = vm.parseJsonUint(j, ".proof.scope");
        uint256[] memory pts = vm.parseJsonUintArray(j, ".proof.points");
        for (uint256 i = 0; i < 8; i++) {
            p.points[i] = pts[i];
        }
    }

    function removeSiblings() internal view returns (uint256[] memory) {
        return vm.parseJsonUintArray(json(), ".removeSiblings");
    }
}
