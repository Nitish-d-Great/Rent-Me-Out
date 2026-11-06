// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {RentalRegistry} from "../src/RentalRegistry.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";
import {Fixture} from "../src/Fixture.sol";

/// Drives the whole product flow against a live deployment, using the demo fixture:
/// approve properties -> verify a broker -> list a room -> buy it -> read the tenant view.
/// The sender plays registrar, owner and broker at once, so it needs only one key.
///
///   forge script script/DemoFlow.s.sol --rpc-url $HEDERA_RPC_URL \
///     --private-key $HEDERA_PRIVATE_KEY --broadcast --slow --legacy
contract DemoFlow is Script {
    function run() external {
        string memory file = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory j = vm.readFile(file);
        RentalRegistry reg = RentalRegistry(vm.parseJsonAddress(j, ".RentalRegistry"));
        BrokerIdentityRegistry ids = BrokerIdentityRegistry(vm.parseJsonAddress(j, ".BrokerIdentityRegistry"));
        DemoUSDC usdc = DemoUSDC(vm.parseJsonAddress(j, ".USDC"));

        address me = msg.sender;
        Fixture.Terms memory t = Fixture.terms();
        bytes32 idKey = keccak256(abi.encodePacked("broker-verify", bytes32(uint256(0xDEE0))));
        bytes32 sessKey = keccak256(abi.encodePacked("demo-session-1"));

        vm.startBroadcast();

        // 1. registrar approves the three demo properties (idempotent-ish: skip if done)
        if (reg.rootVersion() == 0) {
            uint256[] memory c = Fixture.commitments();
            for (uint256 i = 0; i < c.length; i++) {
                reg.approveProperty(bytes32(i + 1), c[i]);
            }
        }

        // 2. broker enrollment: World ID identity + presence session
        if (!ids.isVerified(me)) ids.bindIdentity(idKey, me);
        ids.bindSession(sessKey, me);

        // 3. fund and approve
        usdc.mint(me, t.price);
        usdc.approve(address(reg), t.price);

        // 4. owner lists the room with the ZK membership proof
        uint256 id = reg.createListing(Fixture.proof(), t.start, t.end, t.price, t.payout);

        // 5. broker buys it: USDC out, room token in, one transaction
        reg.buyRoom(id);

        vm.stopBroadcast();

        _report(reg, ids, usdc, id, sessKey, t.payout);
    }

    function _report(
        RentalRegistry reg,
        BrokerIdentityRegistry ids,
        DemoUSDC usdc,
        uint256 id,
        bytes32 sessKey,
        address payout
    ) private view {
        RentalRegistry.Listing memory l = reg.getListing(id);
        address holder = reg.holderOf(id);
        console.log("listing id        ", id);
        console.log("state (2=Held)    ", uint256(reg.roomState(id)));
        console.log("valid now         ", reg.isValid(id));
        console.log("holder            ", holder);
        console.log("ATS room token    ", address(reg.tokenOf(id)));
        console.log("broker token bal  ", reg.tokenOf(id).balanceOf(holder));
        console.log("period start      ", l.start);
        console.log("period end        ", l.end);
        console.log("price (6dp)       ", l.price);
        console.log("room tag          ", l.roomTag);
        console.log("payout balance    ", usdc.balanceOf(payout));
        console.log("holderIdentity    ", reg.holderIdentity(id));
        console.log("session matches   ", ids.sessionMatchesHolder(sessKey, holder));
    }
}
