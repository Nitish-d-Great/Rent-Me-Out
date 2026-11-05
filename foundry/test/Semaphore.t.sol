// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {Fixture} from "../src/Fixture.sol";

/// Same checks the Hedera smoke test runs, on a local EVM. PoseidonT3 is
/// deployed and linked automatically by forge.
contract SemaphoreTest is Test {
    Semaphore semaphore;
    uint256 groupId;
    address registrar = makeAddr("registrar");
    uint256 constant ROOT_WINDOW = 300; // old roots valid 5 minutes after a change

    function setUp() public {
        semaphore = new Semaphore(ISemaphoreVerifier(address(new SemaphoreVerifier())));
        groupId = semaphore.createGroup(registrar, ROOT_WINDOW);
        vm.prank(registrar);
        semaphore.addMembers(groupId, Fixture.commitments()); // 3 approved properties
    }

    function test_ApprovedOwnerProofVerifies() public view {
        ISemaphore.SemaphoreProof memory p = Fixture.proof();
        assertEq(p.merkleTreeRoot, semaphore.getMerkleTreeRoot(groupId), "fixture root matches on-chain root");
        assertTrue(semaphore.verifyProof(groupId, p));
    }

    function test_TamperedListingTermsRejected() public view {
        ISemaphore.SemaphoreProof memory p = Fixture.proof();
        p.message += 1; // e.g. attacker changes price or payout address
        assertFalse(semaphore.verifyProof(groupId, p));
    }

    function test_TamperedProofPointsRejected() public view {
        ISemaphore.SemaphoreProof memory p = Fixture.proof();
        p.points[0] += 1;
        assertFalse(semaphore.verifyProof(groupId, p));
    }

    function test_ProofNotValidForAnotherGroup() public {
        uint256 other = semaphore.createGroup(registrar, ROOT_WINDOW);
        vm.prank(registrar);
        semaphore.addMember(other, 12345);
        vm.expectRevert(ISemaphore.Semaphore__MerkleTreeRootIsNotPartOfTheGroup.selector);
        semaphore.verifyProof(other, Fixture.proof());
    }

    /// verifyProof does not store the nullifier, so the same room can be relisted
    /// later. RentalRegistry uses the nullifier as a room tag for its own overlap check.
    function test_VerifyDoesNotConsumeNullifier() public view {
        ISemaphore.SemaphoreProof memory p = Fixture.proof();
        assertTrue(semaphore.verifyProof(groupId, p));
        assertTrue(semaphore.verifyProof(groupId, p));
    }

    function test_OnlyRegistrarCanApprove() public {
        vm.expectRevert(); // Semaphore__CallerIsNotTheGroupAdmin
        semaphore.addMember(groupId, 999);
    }

    /// Registrar revokes owner #2: the old root keeps working only for ROOT_WINDOW.
    function test_RevokedPropertyStopsProvingAfterWindow() public {
        uint256[] memory c = Fixture.commitments();
        vm.prank(registrar);
        semaphore.removeMember(groupId, c[1], Fixture.removeSiblings());

        ISemaphore.SemaphoreProof memory p = Fixture.proof();
        assertTrue(semaphore.verifyProof(groupId, p), "still inside the window");

        vm.warp(block.timestamp + ROOT_WINDOW);
        vm.expectRevert(ISemaphore.Semaphore__MerkleTreeRootIsExpired.selector);
        semaphore.verifyProof(groupId, p);
    }

    function test_GasReport_VerifyProof() public {
        ISemaphore.SemaphoreProof memory p = Fixture.proof();
        uint256 g = gasleft();
        semaphore.verifyProof(groupId, p);
        emit log_named_uint("verifyProof gas", g - gasleft());
    }
}
