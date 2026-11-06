// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {Roles} from "../src/Roles.sol";

/// Covers the World ID surface the app calls: identity bindings in both key shapes, and
/// session bindings used for the on-site presence check.
contract BrokerIdentityTest is Test {
    BrokerIdentityRegistry ids;

    address registrar = makeAddr("registrar");
    address brokerA = makeAddr("brokerA");
    address brokerB = makeAddr("brokerB");
    address stranger = makeAddr("stranger");

    // identityKey = keccak256(abi.encodePacked("broker-verify", bytes32(nullifier)))
    bytes32 idKeyA = keccak256(abi.encodePacked("broker-verify", bytes32(uint256(0xAAA))));
    bytes32 idKeyB = keccak256(abi.encodePacked("broker-verify", bytes32(uint256(0xBBB))));
    bytes32 sessA = keccak256(abi.encodePacked("session-a"));
    bytes32 sessA2 = keccak256(abi.encodePacked("session-a-second"));
    bytes32 sessB = keccak256(abi.encodePacked("session-b"));

    function setUp() public {
        ids = new BrokerIdentityRegistry(registrar);
    }

    // ------------------------------------------------------------- identity
    function test_BindIdentityMatchesUint256View() public {
        vm.prank(registrar);
        ids.bindIdentity(idKeyA, brokerA);

        assertTrue(ids.isVerified(brokerA));
        assertTrue(ids.isIdentityBound(idKeyA));
        assertEq(ids.walletOfIdentity(idKeyA), brokerA);
        assertEq(ids.identityOfWallet(brokerA), idKeyA);
        // same storage, two shapes
        assertEq(ids.identityOf(brokerA), uint256(idKeyA));
        assertEq(ids.walletOf(uint256(idKeyA)), brokerA);
    }

    function test_BindIdentityNeedsRegistrar() public {
        vm.prank(stranger);
        vm.expectRevert(Roles.NotRegistrar.selector);
        ids.bindIdentity(idKeyA, brokerA);
    }

    function test_OneHumanOneWallet() public {
        vm.startPrank(registrar);
        ids.bindIdentity(idKeyA, brokerA);
        vm.expectRevert(abi.encodeWithSelector(BrokerIdentityRegistry.IdentityAlreadyBound.selector, brokerA));
        ids.bindIdentity(idKeyA, brokerB);
        vm.expectRevert(abi.encodeWithSelector(BrokerIdentityRegistry.WalletAlreadyHasIdentity.selector, uint256(idKeyA)));
        ids.bindIdentity(idKeyB, brokerA);
        vm.stopPrank();
    }

    function test_RejectsEmptyKeyAndZeroWallet() public {
        vm.startPrank(registrar);
        vm.expectRevert(BrokerIdentityRegistry.EmptyKey.selector);
        ids.bindIdentity(bytes32(0), brokerA);
        vm.expectRevert(BrokerIdentityRegistry.ZeroAddress.selector);
        ids.bindIdentity(idKeyA, address(0));
        vm.stopPrank();
    }

    // -------------------------------------------------------------- sessions
    function test_SessionMatchesOnlyItsOwnHolder() public {
        vm.startPrank(registrar);
        ids.bindIdentity(idKeyA, brokerA);
        ids.bindSession(sessA, brokerA);
        vm.stopPrank();

        assertEq(ids.walletOfSession(sessA), brokerA);
        assertEq(ids.sessionOfWallet(brokerA), sessA);
        assertTrue(ids.sessionMatchesHolder(sessA, brokerA));
        assertFalse(ids.sessionMatchesHolder(sessA, brokerB), "wrong holder");
        assertFalse(ids.sessionMatchesHolder(sessB, brokerA), "unknown session");
        assertFalse(ids.sessionMatchesHolder(bytes32(0), brokerA), "empty session");
        assertFalse(ids.sessionMatchesHolder(sessA, address(0)), "no holder");
    }

    function test_SessionCannotMoveToAnotherWallet() public {
        vm.startPrank(registrar);
        ids.bindSession(sessA, brokerA);
        vm.expectRevert(abi.encodeWithSelector(BrokerIdentityRegistry.SessionAlreadyBound.selector, brokerA));
        ids.bindSession(sessA, brokerB);
        vm.stopPrank();
        assertTrue(ids.sessionMatchesHolder(sessA, brokerA));
    }

    function test_RebindingSameSessionIsIdempotent() public {
        vm.startPrank(registrar);
        ids.bindSession(sessA, brokerA);
        ids.bindSession(sessA, brokerA); // re-enrollment, no revert
        vm.stopPrank();
        assertTrue(ids.sessionMatchesHolder(sessA, brokerA));
    }

    function test_NewSessionSupersedesTheOld() public {
        vm.startPrank(registrar);
        ids.bindSession(sessA, brokerA);
        ids.bindSession(sessA2, brokerA);
        vm.stopPrank();

        assertTrue(ids.sessionMatchesHolder(sessA2, brokerA), "newest session proves presence");
        assertFalse(ids.sessionMatchesHolder(sessA, brokerA), "superseded session is dead");
        assertEq(ids.walletOfSession(sessA), address(0));
    }

    function test_SessionNeedsRegistrar() public {
        vm.prank(stranger);
        vm.expectRevert(Roles.NotRegistrar.selector);
        ids.bindSession(sessA, brokerA);
    }

    function test_RemoveBrokerClearsSession() public {
        vm.startPrank(registrar);
        ids.bindIdentity(idKeyA, brokerA);
        ids.bindSession(sessA, brokerA);
        ids.removeBroker(brokerA);
        vm.stopPrank();

        assertFalse(ids.isVerified(brokerA));
        assertFalse(ids.sessionMatchesHolder(sessA, brokerA), "session dies with the binding");
        assertEq(ids.sessionOfWallet(brokerA), bytes32(0));
        assertFalse(ids.isIdentityBound(idKeyA), "identity freed for re-enrollment");
    }
}
