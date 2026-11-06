// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";

/// Deploys SemaphoreVerifier and Semaphore. PoseidonT3 is deployed first by
/// deploy.sh and linked in with --libraries, so no CREATE2 factory is needed
/// (Hedera may not have the usual deterministic deployer).
contract Deploy is Script {
    function run() external {
        address poseidon = vm.envAddress("POSEIDON_T3");

        vm.startBroadcast();
        SemaphoreVerifier verifier = new SemaphoreVerifier();
        Semaphore semaphore = new Semaphore(ISemaphoreVerifier(address(verifier)));
        vm.stopBroadcast();

        console.log("PoseidonT3        ", poseidon);
        console.log("SemaphoreVerifier ", address(verifier));
        console.log("Semaphore         ", address(semaphore));

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "PoseidonT3", poseidon);
        vm.serializeAddress(k, "SemaphoreVerifier", address(verifier));
        string memory out = vm.serializeAddress(k, "Semaphore", address(semaphore));
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
