// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {Fixture} from "../src/Fixture.sol";
import {RentalRegistry} from "../src/RentalRegistry.sol";
import {BrokerIdentityRegistry} from "../src/BrokerIdentityRegistry.sol";
import {IBrokerIdentity} from "../src/interfaces/IBrokerIdentity.sol";
import {Roles} from "../src/Roles.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockATSFactory, MockATSToken} from "./mocks/MockATS.sol";

contract RentalRegistryTest is Test {
    Semaphore semaphore;
    RentalRegistry reg;
    MockATSFactory factory;
    BrokerIdentityRegistry ids;
    MockUSDC usdc;

    address registrar = makeAddr("registrar");
    address brokerA = makeAddr("brokerA");
    address brokerB = makeAddr("brokerB");
    address stranger = makeAddr("stranger");

    // Terms are read from fixtures/proof.json in setUp, so they cannot drift from the proof
    // they are bound to. Cycle 2 is the re-application after cycle 1's period ends.
    uint64 START;
    uint64 END;
    uint256 PRICE;
    address PAYOUT;
    uint64 START2;
    uint64 END2;
    uint256 PRICE2;

    function setUp() public {
        Fixture.Terms memory t = Fixture.terms();
        (START, END, PRICE, PAYOUT) = (t.start, t.end, t.price, t.payout);
        Fixture.Terms memory t2 = Fixture.cycle2Terms();
        (START2, END2, PRICE2) = (t2.start, t2.end, t2.price);

        vm.warp(START - 10 days);
        semaphore = new Semaphore(ISemaphoreVerifier(address(new SemaphoreVerifier())));
        usdc = new MockUSDC();
        ids = new BrokerIdentityRegistry(registrar);
        factory = new MockATSFactory();
        reg = new RentalRegistry(
            semaphore, address(usdc), IBrokerIdentity(address(ids)), registrar, 300, factory, makeAddr("resolver")
        );

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

    function _token(uint256 id) internal view returns (MockATSToken) {
        return MockATSToken(address(reg.tokenOf(id)));
    }

    function _list() internal returns (uint256) {
        return reg.createListing(Fixture.proof(), START, END, PRICE, PAYOUT);
    }

    /// Owner re-applies and the registrar approves a fresh commitment, then lists again.
    function _reapplyAndList() internal returns (uint256) {
        vm.prank(registrar);
        reg.approveProperty(bytes32(uint256(0xBEEF)), Fixture.cycle2Commitment());
        return reg.createListing(Fixture.cycle2Proof(), START2, END2, PRICE2, PAYOUT);
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
        assertEq(_token(id).balanceOf(address(reg)), 1);
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
        vm.expectRevert(ISemaphore.Semaphore__InvalidProof.selector);
        reg.createListing(p, START, END, PRICE, PAYOUT);
    }

    function test_ApprovalIsSingleUse() public {
        _list();
        // same approval, same room: the nullifier is spent inside the Semaphore group
        vm.expectRevert(ISemaphore.Semaphore__YouAreUsingTheSameNullifierTwice.selector);
        _list();
    }

    function test_CancelDoesNotGiveBackTheApproval() public {
        uint256 id = _list();
        vm.prank(PAYOUT);
        reg.cancelListing(id);
        assertEq(uint256(reg.roomState(id)), uint256(RentalRegistry.RoomState.Cancelled));
        assertEq(_token(id).totalSupply(), 0);

        // the owner must re-apply; the spent proof cannot be reused, by them or anyone else
        vm.expectRevert(ISemaphore.Semaphore__YouAreUsingTheSameNullifierTwice.selector);
        _list();
        vm.prank(stranger);
        vm.expectRevert(ISemaphore.Semaphore__YouAreUsingTheSameNullifierTwice.selector);
        _list();
    }

    /// The headline flow: expire, re-apply, tokenise from scratch.
    function test_ExpiryThenReapprovalMintsFreshToken() public {
        uint256 id1 = _list();
        vm.prank(brokerA);
        reg.buyRoom(id1);

        vm.warp(END);
        reg.expire(id1);
        assertEq(uint256(reg.roomState(id1)), uint256(RentalRegistry.RoomState.Expired));
        assertEq(_token(id1).totalSupply(), 0, "old token burned");

        uint256 id2 = _reapplyAndList();
        assertEq(id2, 2, "a brand-new token id, minted from scratch");
        assertTrue(address(_token(id2)) != address(_token(id1)), "a fresh token each cycle");
        assertEq(_token(id2).balanceOf(address(reg)), 1, "escrowed again");
        assertEq(uint256(reg.roomState(id2)), uint256(RentalRegistry.RoomState.Available));

        RentalRegistry.Listing memory l = reg.getListing(id2);
        assertEq(l.price, PRICE2);
        assertEq(l.start, START2);

        // the new cycle is not linkable to the old one: a different room tag
        assertTrue(l.roomTag != reg.getListing(id1).roomTag, "fresh identity, fresh tag");

        // and the new listing sells normally
        vm.warp(START2 - 1 days);
        vm.prank(brokerA);
        reg.buyRoom(id2);
        assertEq(reg.holderOf(id2), brokerA);
    }

    function test_ReapprovalRequiresRegistrar() public {
        _list();
        vm.warp(END);
        reg.expire(1);
        // without the registrar approving the fresh commitment, the new proof has no valid root
        vm.expectRevert(ISemaphore.Semaphore__MerkleTreeRootIsNotPartOfTheGroup.selector);
        reg.createListing(Fixture.cycle2Proof(), START2, END2, PRICE2, PAYOUT);
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
        assertEq(_token(id).balanceOf(brokerA), 1);
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

    function test_HolderIdentityMatchesBrokerNullifier() public {
        uint256 id = _list();
        assertEq(reg.holderIdentity(id), 0, "no holder before sale");
        vm.prank(brokerA);
        reg.buyRoom(id);
        assertEq(reg.holderIdentity(id), 111, "nullifier registered for brokerA");
        vm.warp(END);
        reg.expire(id);
        assertEq(reg.holderIdentity(id), 0, "no holder after expiry");
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
        assertEq(_token(id).balanceOf(address(reg)), 1, "token never left escrow");
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
        MockATSToken token = _token(id);

        // Nobody else is on this token's allowlist, not even another verified broker...
        vm.prank(brokerA);
        vm.expectRevert(abi.encodeWithSelector(MockATSToken.NotCompliant.selector, brokerB));
        token.transfer(brokerB, 1);
        // ...and the escrow left it at sale, so the token cannot be handed back either.
        vm.prank(brokerA);
        vm.expectRevert(abi.encodeWithSelector(MockATSToken.NotCompliant.selector, address(reg)));
        token.transfer(address(reg), 1);

        vm.prank(brokerA);
        vm.expectRevert();
        token.forcedTransfer(brokerA, brokerB, 1);
    }

    // ------------------------------------------------------------ ATS token
    function test_ListingIssuesItsOwnAtsToken() public {
        uint256 id = _list();
        MockATSToken token = _token(id);

        assertEq(factory.issued(), 1);
        assertEq(token.name(), "RentMeOut Room Rights #1");
        assertEq(token.decimals(), 0);
        assertEq(token.maxSupply(), 1);
        assertEq(token.totalSupply(), 1);
        assertTrue(token.isWhiteList(), "must be an allowlist, not a denylist");
        assertTrue(token.isControllable(), "forced transfer needs this");
        assertTrue(token.isInControlList(address(reg)), "escrow must be allowed to hold it");
    }

    function test_SaleMovesTheAllowlistToTheBroker() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);

        assertTrue(_token(id).isInControlList(brokerA));
        assertFalse(_token(id).isInControlList(address(reg)));
    }

    function test_RegistrarFreezeReachesTheAtsToken() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);

        vm.prank(registrar);
        reg.freezeRoom(id, bytes32("dispute"));
        assertTrue(_token(id).isFrozen(brokerA), "the broker is frozen on the token itself");
        assertTrue(reg.isFrozen(id));

        vm.prank(registrar);
        reg.unfreezeRoom(id, bytes32("resolved"));
        assertFalse(_token(id).isFrozen(brokerA));
        assertFalse(reg.isFrozen(id));
    }

    function test_FrozenEscrowBlocksPurchaseOnTheToken() public {
        uint256 id = _list();
        vm.prank(registrar);
        reg.freezeRoom(id, bytes32("dispute"));
        assertTrue(_token(id).isFrozen(address(reg)));

        vm.prank(brokerA);
        vm.expectRevert(RentalRegistry.NotAvailable.selector);
        reg.buyRoom(id);
    }

    function test_RedeemedTokenMeansNoHolderAndStillExpires() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);
        vm.warp(START + 1);
        assertEq(reg.holderOf(id), brokerA);
        assertTrue(reg.isValid(id));

        MockATSToken token = _token(id); // looked up first: vm.prank covers only the next call
        vm.prank(brokerA);
        token.redeem(1);
        assertEq(reg.holderOf(id), address(0), "the token decides who holds the room");
        assertFalse(reg.isValid(id));

        vm.warp(END + 1);
        reg.expire(id);
        assertEq(uint8(reg.roomState(id)), uint8(RentalRegistry.RoomState.Expired));
    }

    function test_ConstructorRejectsFactoryWithNoCode() public {
        vm.expectRevert(RentalRegistry.AtsFactoryHasNoCode.selector);
        new RentalRegistry(
            semaphore,
            address(usdc),
            IBrokerIdentity(address(ids)),
            registrar,
            300,
            MockATSFactory(makeAddr("noCode")),
            makeAddr("resolver")
        );
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
        assertEq(_token(id).totalSupply(), 0);
        assertEq(reg.holderOf(id), address(0));
        assertEq(_token(id).balanceOf(brokerA), 0);
    }

    function test_ExpiredFrozenTokenStillBurns() public {
        uint256 id = _list();
        vm.prank(brokerA);
        reg.buyRoom(id);
        vm.prank(registrar);
        reg.freezeRoom(id, bytes32(0));
        vm.warp(END);
        reg.expire(id);
        assertEq(_token(id).totalSupply(), 0);
        assertFalse(_token(id).isFrozen(brokerA));
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
        vm.expectRevert(abi.encodeWithSelector(BrokerIdentityRegistry.IdentityAlreadyBound.selector, brokerA));
        ids.registerBroker(brokerB, 111);
        vm.expectRevert(abi.encodeWithSelector(BrokerIdentityRegistry.WalletAlreadyHasIdentity.selector, 111));
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
