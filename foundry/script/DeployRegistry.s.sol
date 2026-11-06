// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {RentalRegistry} from "../src/RentalRegistry.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {IBrokerIdentity} from "../src/interfaces/IBrokerIdentity.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";

/// Deploys BrokerIdentityRegistry + RentalRegistry (which creates RoomRights and the
/// approved-property Semaphore group) against the Semaphore in deployments/<chainid>.json.
///
/// Env:
///   USDC_ADDRESS  settlement token. Omit it and a DemoUSDC faucet is deployed instead
///                 (testnet demos: no HTS association needed, anyone can mint).
///   REGISTRAR     optional extra registrar wallet (the backend agent).
contract DeployRegistry is Script {
    function run() external {
        string memory file = string.concat("deployments/", vm.toString(block.chainid), ".json");
        address semaphore = vm.parseJsonAddress(vm.readFile(file), ".Semaphore");
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address registrar = vm.envOr("REGISTRAR", address(0));

        vm.startBroadcast();
        bool demoToken = usdc == address(0);
        if (demoToken) {
            usdc = address(new DemoUSDC());
        }
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
        console.log("USDC                  ", usdc, demoToken ? "(DemoUSDC faucet)" : "(configured)");
        console.log("owner / registrar     ", msg.sender);
        if (registrar != address(0)) console.log("extra registrar       ", registrar);
        console.log("approved-set groupId  ", reg.groupId());

        vm.writeJson(vm.toString(address(ids)), file, ".BrokerIdentityRegistry");
        vm.writeJson(vm.toString(address(reg)), file, ".RentalRegistry");
        vm.writeJson(vm.toString(address(reg.rights())), file, ".RoomRights");
        vm.writeJson(vm.toString(usdc), file, ".USDC");
        vm.writeJson(vm.toString(reg.groupId()), file, ".approvedGroupId");

        // Roles: the deployer is owner and the first registrar on BOTH contracts (they keep
        // independent role tables). The backend agent is appended when REGISTRAR is set.
        vm.writeJson(vm.toString(msg.sender), file, ".owner");
        string memory registrars = registrar == address(0)
            ? string.concat('["', vm.toString(msg.sender), '"]')
            : string.concat('["', vm.toString(msg.sender), '","', vm.toString(registrar), '"]');
        vm.writeJson(registrars, file, ".registrars");
    }
}
