// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {Fixture} from "../src/Fixture.sol";
import {RentalRegistry} from "../src/RentalRegistry.sol";
import {RoomRights} from "../src/RoomRights.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {IBrokerIdentity} from "../src/interfaces/IBrokerIdentity.sol";
import {Roles} from "../src/Roles.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract RentalRegistryTest is Test {
    Semaphore semaphore;
    RentalRegistry reg;
    RoomRights rights;
    BrokerIdentityRegistry ids;
    MockUSDC usdc;

    address registrar = makeAddr("registrar");
    address brokerA = makeAddr("brokerA");
    address brokerB = makeAddr("brokerB");
    address stranger = makeAddr("stranger");

    // Terms baked into fixtures/proof.json (see js/make-fixture.js).
    uint64 constant START = 1767225600;
    uint64 constant END = 1774915200;
    uint256 constant PRICE = 1_200_000_000;
    address constant PAYOUT = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        vm.warp(START - 10 days);
        semaphore = new Semaphore(ISemaphoreVerifier(address(new SemaphoreVerifier())));
        usdc = new MockUSDC();
        ids = new BrokerIdentityRegistry(registrar);
        reg = new RentalRegistry(semaphore, address(usdc), IBrokerIdentity(address(ids)), registrar, 300);
        rights = reg.rights();

        uint256[] memory c = Fixture.commitments();
        vm.startPrank(registrar);
        for (uint256 i = 0; i < c.length; i++) {
            reg.approveProperty(bytes32(i + 1), c[i]);
        }
        ids.registerBroker(brokerA, 111);
        vm.stopPrank();

        usdc.mint(brokerA, 5_000_000_000);
        usdc.mint(brokerB, 5_000_000_000);
        vm.prank(brokerA);
        usdc.approve(address(reg), type(uint256).max);
        vm.prank(brokerB);
        usdc.approve(address(reg), type(uint256).max);
    }

    function _list() internal returns (uint256) {
        return reg.createListing(Fixture.proof(), START, END, PRICE, PAYOUT);
    }

    // ------------------------------------------------------------ properties
    function test_ApprovalBuildsRootVersions() public view {
        (uint256 root, uint256 v) = reg.approvedRoot();
        assertEq(v, 3);
        assertEq(root, Fixture.proof().merkleTreeRoot);
        assertEq(reg.rootAt(3), root);
    }

    function test_OnlyRegistrarApproves() public {
        vm.prank(stranger);
        vm.expectRevert(Roles.NotRegistrar.selector);
        reg.approveProperty(bytes32(uint256(9)), 12345);
    }

    function test_RevokeBumpsRootAndKillsProofAfterWindow() public {
        uint256[] memory c = Fixture.commitments();
        vm.prank(registrar);
        reg.revokeProperty(c[1], Fixture.removeSiblings());
        assertEq(reg.rootVersion(), 4);

        vm.warp(block.timestamp + 301);
        vm.expectRevert(); // old root expired
        _list();
    }

    // -------------------------------------------------------------- listing
    function test_CreateListingEscrowsToken() public {
        uint256 id = _list();
        assertEq(id, 1);
        assertEq(rights.ownerOf(id), address(reg));
        assertEq(uint256(reg.roomState(id)), uint256(RentalRegistry.RoomState.Available));
        RentalRegistry.Listing memory l = reg.getListing(id);
        assertEq(l.price, PRICE);
        assertEq(l.payout, PAYOUT);
        assertEq(l.roomTag, Fixture.proof().nullifier);
        assertEq(reg.holderOf(id), address(0));
    }

    function test_TamperedTermsRejected() public {
        vm.expectRevert(RentalRegistry.TermsNotBoundToProof.selector);
        reg.createListing(Fixture.proof(), START, END, PRICE - 1, PAYOUT);
        vm.expectRevert(RentalRegistry.TermsNotBoundToProof.selector);
        reg.createListing(Fixture.proof(), START, END, PRICE, stranger); // redirect payout
    }

    function test_ForgedProofRejected() public {
        ISemaphore.SemaphoreProof memory p = Fixture.proof();
        p.points[0] += 1;
        vm.expectRevert(RentalRegistry.InvalidProof.selector);
        reg.createListing(p, START, END, PRICE, PAYOUT);
    }

    function test_OverlapRejectedThenRelistAfterCancel() public {
        uint256 id = _list();
        vm.expectRevert(abi.encodeWithSelector(RentalRegistry.RoomAlreadyListed.selector, id));
        _list();

        vm.prank(PAYOUT); // owner cancels
        reg.cancelListing(id);
        assertEq(uint256(reg.roomState(id)), uint256(RentalRegistry.RoomState.Cancelled));
        assertFalse(rights.exists(id));
        assertEq(_list(), 2); // same room, same period, now allowed
    }

    function test_InvalidPeriodRejected() public {
        vm.expectRevert(RentalRegistry.InvalidPeriod.selector);
        reg.createListing(Fixture.proof(), END, START, PRICE, PAYOUT);
    }

    // ------------------------------------------------------------- purchase
    function test_VerifiedBrokerBuysAtomically() public {
        uint256 id = _list();
        uint256 before = usdc.balanceOf(PAYOUT);
        vm.prank(brokerA);
        reg.buyRoom(id);

        assertEq(usdc.balanceOf(PAYOUT) - before, PRICE);
        assertEq(rights.ownerOf(id), brokerA);
        assertEq(reg.holderOf(id), brokerA);
        assertEq(uint256(reg.roomState(id)), uint256(RentalRegistry.RoomState.Held));
        assertFalse(reg.isValid(id), "period has not started");

        vm.warp(START + 1);
        assertTrue(reg.isValid(id));
        (RentalRegistry.RoomState st, bool valid, address holder,,,,) = reg.verifyRoom(id);
        assertEq(uint256(st), uint256(RentalRegistry.RoomState.Held));
        assertTrue(valid);
        assertEq(holder, brokerA);
    }

    function test_UnverifiedBrokerBlocked() public {
        uint256 id = _list();
        vm.prank(brokerB);
        vm.expectRevert(RentalRegistry.BrokerNotVerified.selector);
        reg.buyRoom(id);
        assertEq(usdc.balanceOf(PAYOUT), 0);
    }

    function test_SecondBuyerRaceLoses() public {
        uint256 id = _list();
        vm.prank(registrar);
        ids.registerBroker(brokerB, 222);
        vm.prank(brokerA);
        reg.buyRoom(id);
        vm.prank(brokerB);
        vm.expectRevert(RentalRegistry.NotAvailable.selector);
        reg.buyRoom(id);
    }

    function test_PaymentFailureRevertsWholePurchase() public {
        uint256 id = _list();
        vm.prank(brokerA);
        usdc.approve(address(reg), 0);
        vm.prank(brokerA);
        vm.expectRevert(); // allowance underflow in token
        reg.buyRoom(id);
        assertEq(rights.ownerOf(id), address(reg), "token never left escrow");
        assertEq(uint256(reg.getListing(id).status), uint256(RentalRegistry.Status.Available));
    }

    function test_CannotCancelAfterSale() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);
        vm.prank(PAYOUT);
        vm.expectRevert(RentalRegistry.NotAvailable.selector);
        reg.cancelListing(id);
    }

    function test_OnlyOwnerOrRegistrarCancels() public {
        uint256 id = _list();
        vm.prank(stranger);
        vm.expectRevert(RentalRegistry.NotListingOwnerOrRegistrar.selector);
        reg.cancelListing(id);
        vm.prank(registrar);
        reg.cancelListing(id);
    }

    function test_HolderCannotMoveToken() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);
        vm.prank(brokerA);
        vm.expectRevert(RoomRights.TransfersDisabled.selector);
        rights.transferFrom(brokerA, brokerB, id);
        vm.prank(brokerA);
        vm.expectRevert(RoomRights.NotAgent.selector);
        rights.agentTransfer(id, brokerB);
    }

    // --------------------------------------------------------------- freeze
    function test_FreezeAndUnfreeze() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);
        vm.warp(START + 1);

        vm.prank(registrar);
        reg.freezeRoom(id, keccak256("dispute #1"));
        assertEq(uint256(reg.roomState(id)), uint256(RentalRegistry.RoomState.Frozen));
        assertFalse(reg.isValid(id));

        vm.prank(registrar);
        reg.unfreezeRoom(id, keccak256("resolved"));
        assertTrue(reg.isValid(id));
    }

    function test_FrozenListingCannotBeBought() public {
        uint256 id = _list();
        vm.prank(registrar);
        reg.freezeRoom(id, bytes32(0));
        vm.prank(brokerA);
        vm.expectRevert(RentalRegistry.NotAvailable.selector);
        reg.buyRoom(id);
    }

    function test_OnlyRegistrarFreezes() public {
        uint256 id = _list();
        vm.prank(stranger);
        vm.expectRevert(Roles.NotRegistrar.selector);
        reg.freezeRoom(id, bytes32(0));
    }

    // --------------------------------------------------------------- expiry
    function test_ExpiryBurnsToken() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);

        vm.expectRevert(RentalRegistry.NotYetExpired.selector);
        reg.expire(id);

        vm.warp(END);
        assertFalse(reg.isValid(id));
        assertEq(uint256(reg.roomState(id)), uint256(RentalRegistry.RoomState.Expired), "expired even before keeper runs");

        uint256[] memory batch = new uint256[](1);
        batch[0] = id;
        reg.expireMany(batch);
        assertFalse(rights.exists(id));
        assertEq(reg.holderOf(id), address(0));
        assertEq(rights.balanceOf(brokerA), 0);
    }

    function test_ExpiredFrozenTokenStillBurns() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);
        vm.prank(registrar);
        reg.freezeRoom(id, bytes32(0));
        vm.warp(END);
        reg.expire(id);
        assertFalse(rights.exists(id));
        assertFalse(rights.isFrozen(id));
    }

    function test_CannotBuyAfterEnd() public {
        uint256 id = _list();
        vm.warp(END);
        vm.prank(brokerA);
        vm.expectRevert(RentalRegistry.ListingEnded.selector);
        reg.buyRoom(id);
    }

    // ------------------------------------------------------------- identity
    function test_OneIdentityOneWallet() public {
        vm.startPrank(registrar);
        vm.expectRevert(abi.encodeWithSelector(BrokerIdentityRegistry.IdentityAlreadyLinked.selector, brokerA));
        ids.registerBroker(brokerB, 111);
        vm.expectRevert(abi.encodeWithSelector(BrokerIdentityRegistry.WalletAlreadyVerified.selector, 111));
        ids.registerBroker(brokerA, 333);
        ids.removeBroker(brokerA);
        ids.registerBroker(brokerB, 111); // freed after removal
        vm.stopPrank();
        assertTrue(ids.isVerified(brokerB));
        assertFalse(ids.isVerified(brokerA));
    }

    function test_RemovedBrokerCannotBuy() public {
        uint256 id = _list();
        vm.prank(registrar);
        ids.removeBroker(brokerA);
        vm.prank(brokerA);
        vm.expectRevert(RentalRegistry.BrokerNotVerified.selector);
        reg.buyRoom(id);
    }

    function test_NoSuchListing() public {
        vm.expectRevert(RentalRegistry.NoSuchListing.selector);
        reg.getListing(99);
        assertEq(uint256(reg.roomState(99)), uint256(RentalRegistry.RoomState.Unknown));
    }
}
