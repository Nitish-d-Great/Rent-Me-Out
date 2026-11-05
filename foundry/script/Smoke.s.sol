// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {Fixture} from "../src/Fixture.sol";

/// Creates a demo group (sender = admin, 5-minute old-root window) and adds the
/// 3 fixture commitments. smoke.sh then verifies the fixture proof with eth_call,
/// so the proof check runs on Hedera itself, not in forge's local simulation.
contract Smoke is Script {
    function run() external {
        string memory file = string.concat("deployments/", vm.toString(block.chainid), ".json");
        Semaphore semaphore = Semaphore(vm.parseJsonAddress(vm.readFile(file), ".Semaphore"));

        vm.startBroadcast();
        uint256 groupId = semaphore.createGroup(msg.sender, 300);
        semaphore.addMembers(groupId, Fixture.commitments());
        vm.stopBroadcast();

        require(semaphore.getMerkleTreeRoot(groupId) == Fixture.proof().merkleTreeRoot, "root mismatch");
        console.log("Group", groupId, "created with 3 approved properties");
        vm.writeJson(vm.toString(groupId), file, ".smokeGroupId");
    }
}
