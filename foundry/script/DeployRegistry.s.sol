// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {RentalRegistry} from "../src/RentalRegistry.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {IBrokerIdentity} from "../src/interfaces/IBrokerIdentity.sol";

/// Deploys BrokerIdentityRegistry + RentalRegistry (which creates RoomRights and the
/// approved-property Semaphore group) against the Semaphore in deployments/<chainid>.json.
/// Env: USDC_ADDRESS (EVM address of the HTS USDC token), optional REGISTRAR (extra registrar wallet).
contract DeployRegistry is Script {
    function run() external {
        string memory file = string.concat("deployments/", vm.toString(block.chainid), ".json");
        address semaphore = vm.parseJsonAddress(vm.readFile(file), ".Semaphore");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address registrar = vm.envOr("REGISTRAR", address(0));

        vm.startBroadcast();
        BrokerIdentityRegistry ids = new BrokerIdentityRegistry(msg.sender);
        RentalRegistry reg =
            new RentalRegistry(ISemaphore(semaphore), usdc, IBrokerIdentity(address(ids)), msg.sender, 300);
        if (registrar != address(0)) {
            ids.setRegistrar(registrar, true);
            reg.setRegistrar(registrar, true);
        }
        vm.stopBroadcast();

        console.log("BrokerIdentityRegistry", address(ids));
        console.log("RentalRegistry        ", address(reg));
        console.log("RoomRights            ", address(reg.rights()));
        console.log("approved-set groupId  ", reg.groupId());

        vm.writeJson(vm.toString(address(ids)), file, ".BrokerIdentityRegistry");
        vm.writeJson(vm.toString(address(reg)), file, ".RentalRegistry");
        vm.writeJson(vm.toString(address(reg.rights())), file, ".RoomRights");
        vm.writeJson(vm.toString(reg.groupId()), file, ".approvedGroupId");
    }
}
