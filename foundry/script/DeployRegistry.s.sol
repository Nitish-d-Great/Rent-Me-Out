// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {RentalRegistry} from "../src/RentalRegistry.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {IBrokerIdentity} from "../src/interfaces/IBrokerIdentity.sol";
import {IATSFactory} from "../src/interfaces/IATS.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";

/// Deploys RentalRegistry (which creates the approved-property Semaphore group) against the
/// Semaphore in deployments/<chainid>.json. Room tokens are issued per listing by the ATS
/// factory already live on Hedera testnet, so no token contract is deployed here.
///
/// Env:
///   USDC_ADDRESS  settlement token. Omit it and a DemoUSDC faucet is deployed instead
///                 (testnet demos: no HTS association needed, anyone can mint).
///   REGISTRAR     optional extra registrar wallet (the backend agent).
///   IDENTITY_ADDRESS  an existing BrokerIdentityRegistry to reuse, which keeps every broker
///                     already enrolled with World ID. Omit it to deploy a new one.
///   ATS_FACTORY, ATS_RESOLVER  override the ATS 8.0.0 testnet addresses below.
contract DeployRegistry is Script {
    // From ATS deployments/hedera-testnet/newBlr-2026-06-12T11-19-42-198.json.
    address private constant TESTNET_ATS_FACTORY = 0xd1F118A40f3b02883D35909eF2517e7EDd78379d;
    address private constant TESTNET_ATS_RESOLVER = 0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a;

    function run() external {
        string memory file = string.concat("deployments/", vm.toString(block.chainid), ".json");
        address semaphore = vm.parseJsonAddress(vm.readFile(file), ".Semaphore");
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address registrar = vm.envOr("REGISTRAR", address(0));
        address existingIdentity = vm.envOr("IDENTITY_ADDRESS", address(0));
        address atsFactory = vm.envOr("ATS_FACTORY", TESTNET_ATS_FACTORY);
        address atsResolver = vm.envOr("ATS_RESOLVER", TESTNET_ATS_RESOLVER);

        vm.startBroadcast();
        bool demoToken = usdc == address(0);
        if (demoToken) {
            usdc = address(new DemoUSDC());
        }
        BrokerIdentityRegistry ids = existingIdentity == address(0)
            ? new BrokerIdentityRegistry(msg.sender)
            : BrokerIdentityRegistry(existingIdentity);
        RentalRegistry reg = new RentalRegistry(
            ISemaphore(semaphore),
            usdc,
            IBrokerIdentity(address(ids)),
            msg.sender,
            300,
            IATSFactory(atsFactory),
            atsResolver
        );
        if (registrar != address(0)) {
            ids.setRegistrar(registrar, true);
            reg.setRegistrar(registrar, true);
        }
        vm.stopBroadcast();

        console.log("BrokerIdentityRegistry", address(ids));
        console.log("RentalRegistry        ", address(reg));
        console.log("ATS factory           ", atsFactory);
        console.log("ATS resolver          ", atsResolver);
        console.log("USDC                  ", usdc, demoToken ? "(DemoUSDC faucet)" : "(configured)");
        console.log("owner / registrar     ", msg.sender);
        if (registrar != address(0)) console.log("extra registrar       ", registrar);
        console.log("approved-set groupId  ", reg.groupId());

        vm.writeJson(vm.toString(address(ids)), file, ".BrokerIdentityRegistry");
        vm.writeJson(vm.toString(address(reg)), file, ".RentalRegistry");
        vm.writeJson(vm.toString(atsFactory), file, ".AtsFactory");
        vm.writeJson(vm.toString(atsResolver), file, ".AtsResolver");
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
