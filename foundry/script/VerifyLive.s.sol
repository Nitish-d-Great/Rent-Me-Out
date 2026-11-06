// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {RentalRegistry} from "../src/RentalRegistry.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {DemoUSDC} from "../src/DemoUSDC.sol";

/// Checks a live deployment: reads every wired reference, then exercises session rotation
/// and the dispute freeze/unfreeze path against the real chain. Reverts if anything is
/// inconsistent, so a non-zero exit means the deployment is not healthy.
///
///   forge script script/VerifyLive.s.sol --rpc-url $HEDERA_RPC_URL \
///     --private-key $HEDERA_PRIVATE_KEY --broadcast --slow --legacy
contract VerifyLive is Script {
    RentalRegistry reg;
    BrokerIdentityRegistry ids;
    DemoUSDC usdc;

    function run() external {
        string memory j = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        reg = RentalRegistry(vm.parseJsonAddress(j, ".RentalRegistry"));
        ids = BrokerIdentityRegistry(vm.parseJsonAddress(j, ".BrokerIdentityRegistry"));
        usdc = DemoUSDC(vm.parseJsonAddress(j, ".USDC"));
        address me = msg.sender;

        _wiring(j, me);
        _listingOne();

        vm.startBroadcast();
        _sessionRotation(me);
        _freezeCycle();
        vm.stopBroadcast();

        console.log("");
        console.log("ALL LIVE CHECKS PASSED");
    }

    function holder_(uint256 id) private view returns (address) {
        return reg.holderOf(id);
    }

    function _wiring(string memory j, address me) private view {
        console.log("== wiring ==");
        require(address(reg).code.length > 0, "RentalRegistry has no code");
        require(address(ids).code.length > 0, "BrokerIdentityRegistry has no code");
        require(address(reg.atsFactory()).code.length > 0, "ATS factory has no code");
        require(address(usdc).code.length > 0, "USDC has no code");

        require(address(reg.identity()) == address(ids), "registry -> identity mismatch");
        require(reg.usdc() == address(usdc), "registry -> usdc mismatch");
        require(address(reg.semaphore()) == vm.parseJsonAddress(j, ".Semaphore"), "registry -> semaphore mismatch");
        require(reg.isRegistrar(me), "sender is not a registrar");
        require(ids.isRegistrar(me), "sender is not an identity registrar");

        // the roles recorded in the deployment file must still be true on-chain
        address recordedOwner = vm.parseJsonAddress(j, ".owner");
        require(reg.owner() == recordedOwner, "recorded owner != RentalRegistry.owner");
        require(ids.owner() == recordedOwner, "recorded owner != BrokerIdentityRegistry.owner");
        address[] memory recorded = vm.parseJsonAddressArray(j, ".registrars");
        require(recorded.length > 0, "no registrars recorded");
        for (uint256 i = 0; i < recorded.length; i++) {
            require(reg.isRegistrar(recorded[i]), "recorded registrar lost its registry role");
            require(ids.isRegistrar(recorded[i]), "recorded registrar lost its identity role");
        }
        console.log("  owner / registrar  ", recordedOwner);
        console.log("  registrars recorded", recorded.length);

        (uint256 root, uint256 version) = reg.approvedRoot();
        console.log("  groupId            ", reg.groupId());
        console.log("  rootVersion        ", version);
        console.log("  approvedRoot       ", root);
        console.log("  listingCount       ", reg.listingCount());
        require(version > 0 && root != 0, "no approved properties");
    }

    function _listingOne() private view {
        console.log("== listing 1 ==");
        uint256 id = 1;
        RentalRegistry.Listing memory l = reg.getListing(id);
        address holder = reg.holderOf(id);
        console.log("  state (2=Held)     ", uint256(reg.roomState(id)));
        console.log("  isValid            ", reg.isValid(id));
        console.log("  holder             ", holder);
        console.log("  holderIdentity     ", reg.holderIdentity(id));
        console.log("  payout balance     ", usdc.balanceOf(l.payout));

        require(holder != address(0), "no holder");
        require(reg.tokenOf(id).balanceOf(holder) == 1, "token holder != rights holder");
        require(reg.holderIdentity(id) == ids.identityOf(holder), "holderIdentity mismatch");
        require(ids.isVerified(holder), "holder is not a verified broker");
        require(usdc.balanceOf(l.payout) >= l.price, "payout never received the price");
    }

    function _sessionRotation(address me) private {
        console.log("== session rotation ==");
        bytes32 old = ids.sessionOfWallet(me);
        bytes32 fresh = keccak256(abi.encodePacked("verify-live-session", block.timestamp));

        ids.bindSession(fresh, me);
        require(ids.sessionMatchesHolder(fresh, me), "new session does not match holder");
        if (old != bytes32(0)) {
            require(!ids.sessionMatchesHolder(old, me), "superseded session still matches");
            require(ids.walletOfSession(old) == address(0), "superseded session not cleared");
        }
        require(!ids.sessionMatchesHolder(fresh, address(0xBEEF)), "session matched a stranger");
        console.log("  rotated, old session revoked");
    }

    function _freezeCycle() private {
        console.log("== dispute freeze ==");
        uint256 id = 1;
        require(reg.isValid(id), "precondition: listing 1 should be valid");

        reg.freezeRoom(id, keccak256("verify-live-drill"));
        require(reg.tokenOf(id).isFrozen(holder_(id)), "token not frozen");
        require(reg.roomState(id) == RentalRegistry.RoomState.Frozen, "state is not Frozen");
        require(!reg.isValid(id), "frozen room still reads valid");
        console.log("  frozen: state=3, isValid=false");

        reg.unfreezeRoom(id, keccak256("verify-live-resolved"));
        require(!reg.tokenOf(id).isFrozen(holder_(id)), "still frozen");
        require(reg.roomState(id) == RentalRegistry.RoomState.Held, "did not return to Held");
        require(reg.isValid(id), "did not return to valid");
        console.log("  unfrozen: state=2, isValid=true");
    }
}
