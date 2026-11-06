// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreGroups} from "@semaphore-protocol/contracts/interfaces/ISemaphoreGroups.sol";
import {Roles} from "./Roles.sol";
import {RoomRights} from "./RoomRights.sol";
import {IBrokerIdentity} from "./interfaces/IBrokerIdentity.sol";

/// RentMeOut core: property approval, room listings, atomic purchase and lifecycle.
///
/// Privacy model: the registrar approves an owner's opaque Semaphore identity commitment
/// (never an address). The owner lists a room with a Semaphore proof that "some approved
/// property authorises these exact terms". The proof's nullifier (scope = room index) is a
/// stable private room tag: the same property+room always yields the same tag, so overlap
/// checks work without revealing which property it is. `verifyProof` is used (not
/// `validateProof`) so the nullifier is never consumed and a room can be relisted later.
contract RentalRegistry is Roles {
    // ---------------------------------------------------------------- types
    enum Status {
        None,
        Available,
        Sold,
        Cancelled,
        Expired
    }

    /// Display state for the UI / QR page. Hedera (this contract) is authoritative.
    enum RoomState {
        Unknown,
        Available, // listed, no holder
        Held, // sold, valid or upcoming (see isValid for the date check)
        Frozen, // dispute
        Expired, // period ended; token burned
        Cancelled // owner cancelled before sale; token burned
    }

    struct Listing {
        address payout; // owner's payout wallet, bound into the proof
        uint64 start;
        uint64 end;
        Status status;
        uint256 price; // one-time USDC price (6 decimals)
        uint256 roomTag; // private room tag = Semaphore nullifier
    }

    // --------------------------------------------------------------- errors
    error InvalidPeriod();
    error InvalidPrice();
    error InvalidPayout();
    error TermsNotBoundToProof();
    error InvalidProof();
    error RoomAlreadyListed(uint256 conflictingListingId);
    error NoSuchListing();
    error NotAvailable();
    error ListingEnded();
    error BrokerNotVerified();
    error PaymentFailed();
    error NotListingOwnerOrRegistrar();
    error NotFrozen();
    error AlreadyFrozen();
    error NotYetExpired();
    error NothingToExpire();
    error Reentrancy();

    // --------------------------------------------------------------- events
    event PropertyApproved(bytes32 indexed applicationId, uint256 indexed commitment, uint256 rootVersion, uint256 root);
    event PropertyRevoked(uint256 indexed commitment, uint256 rootVersion, uint256 root);
    event PropertyRejected(bytes32 indexed applicationId, bytes32 reasonHash);
    event ListingCreated(
        uint256 indexed listingId,
        uint256 indexed roomTag,
        address indexed payout,
        uint64 start,
        uint64 end,
        uint256 price,
        uint256 rootVersion
    );
    event ListingCancelled(uint256 indexed listingId, address indexed by);
    event RoomPurchased(uint256 indexed listingId, address indexed broker, address indexed payout, uint256 price);
    event RoomFrozen(uint256 indexed listingId, address indexed by, bytes32 reasonHash);
    event RoomUnfrozen(uint256 indexed listingId, address indexed by, bytes32 reasonHash);
    event RoomExpired(uint256 indexed listingId);

    // ---------------------------------------------------------------- state
    ISemaphore public immutable semaphore;
    uint256 public immutable groupId; // approved-property set; this contract is the group admin
    address public immutable usdc;
    IBrokerIdentity public immutable identity;
    RoomRights public immutable rights;

    /// Version counter for the approved-property root; bumped on every approve/revoke.
    uint256 public rootVersion;
    mapping(uint256 => uint256) public rootAt; // version => root
    mapping(uint256 => uint256) public rootTimestamp; // version => block.timestamp

    uint256 public listingCount; // listing ids start at 1; id == token id
    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => uint256[]) private _roomListings; // roomTag => listing ids

    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param rootWindow seconds an older approved-set root still verifies after a change.
    constructor(ISemaphore semaphore_, address usdc_, IBrokerIdentity identity_, address owner_, uint256 rootWindow)
        Roles(owner_)
    {
        semaphore = semaphore_;
        usdc = usdc_;
        identity = identity_;
        groupId = semaphore_.createGroup(address(this), rootWindow);
        rights = new RoomRights(identity_, address(this));
    }

    // ------------------------------------------------- registrar: properties
    /// Approve a property: add the owner's Semaphore identity commitment to the approved set.
    /// `applicationId` is the opaque application id (links to the Arkiv record in the event log).
    function approveProperty(bytes32 applicationId, uint256 commitment) external onlyRegistrar {
        semaphore.addMember(groupId, commitment);
        (uint256 v, uint256 root) = _bumpRoot();
        emit PropertyApproved(applicationId, commitment, v, root);
    }

    /// Revoke a property (dispute / bad deed). Needs the Merkle siblings of the leaf, which
    /// the attestation service keeps. Old proofs die after the group's root window.
    function revokeProperty(uint256 commitment, uint256[] calldata merkleProofSiblings) external onlyRegistrar {
        semaphore.removeMember(groupId, commitment, merkleProofSiblings);
        (uint256 v, uint256 root) = _bumpRoot();
        emit PropertyRevoked(commitment, v, root);
    }

    /// Audit record for a rejection; no state changes (rejected properties are never added).
    function rejectProperty(bytes32 applicationId, bytes32 reasonHash) external onlyRegistrar {
        emit PropertyRejected(applicationId, reasonHash);
    }

    function _bumpRoot() private returns (uint256 v, uint256 root) {
        v = ++rootVersion;
        root = ISemaphoreGroups(address(semaphore)).getMerkleTreeRoot(groupId);
        rootAt[v] = root;
        rootTimestamp[v] = block.timestamp;
    }

    // --------------------------------------------------- owner: list a room
    /// The message the owner's Semaphore proof must be bound to. Matches js/make-fixture.js.
    /// `room` is the proof's scope (room index). Binding the terms stops anyone altering
    /// price, dates or the payout address of a valid proof.
    function listingMessage(uint256 room, uint64 start, uint64 end, uint256 price, address payout)
        public
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encodePacked(room, start, end, price, payout)));
    }

    /// List one room for one period. Requires a proof of membership in the approved set.
    /// The room token is minted into this contract's escrow until bought or cancelled.
    function createListing(
        ISemaphore.SemaphoreProof calldata proof,
        uint64 start,
        uint64 end,
        uint256 price,
        address payout
    ) external nonReentrant returns (uint256 listingId) {
        if (end <= start || end <= block.timestamp) revert InvalidPeriod();
        if (price == 0) revert InvalidPrice();
        if (payout == address(0)) revert InvalidPayout();
        if (proof.message != listingMessage(proof.scope, start, end, price, payout)) revert TermsNotBoundToProof();
        // Reverts inside Semaphore for unknown/expired roots; returns false for a bad proof.
        if (!semaphore.verifyProof(groupId, proof)) revert InvalidProof();

        uint256 tag = proof.nullifier;
        uint256[] storage ids = _roomListings[tag];
        for (uint256 i = 0; i < ids.length; i++) {
            Listing storage other = _listings[ids[i]];
            if (other.status != Status.Available && other.status != Status.Sold) continue;
            if (start < other.end && other.start < end) revert RoomAlreadyListed(ids[i]);
        }

        listingId = ++listingCount;
        _listings[listingId] =
            Listing({payout: payout, start: start, end: end, status: Status.Available, price: price, roomTag: tag});
        ids.push(listingId);

        rights.mint(address(this), listingId);
        emit ListingCreated(listingId, tag, payout, start, end, price, rootVersion);
    }

    /// Owner (payout wallet) or registrar cancels a listing that has not sold. Burns the token.
    function cancelListing(uint256 listingId) external {
        Listing storage l = _get(listingId);
        if (msg.sender != l.payout && !isRegistrar[msg.sender]) revert NotListingOwnerOrRegistrar();
        if (l.status != Status.Available) revert NotAvailable();
        l.status = Status.Cancelled;
        rights.burn(listingId);
        emit ListingCancelled(listingId, msg.sender);
    }

    // ------------------------------------------------------- broker: purchase
    /// Atomic purchase: USDC goes broker -> owner and the room token goes escrow -> broker in
    /// one transaction. Either both happen or neither does. The broker must have approved
    /// this contract for `price` USDC first (on Hedera: associate USDC, then approve).
    function buyRoom(uint256 listingId) external nonReentrant {
        Listing storage l = _get(listingId);
        if (l.status != Status.Available) revert NotAvailable();
        if (block.timestamp >= l.end) revert ListingEnded();
        if (rights.isFrozen(listingId)) revert NotAvailable();
        if (!identity.isVerified(msg.sender)) revert BrokerNotVerified();

        l.status = Status.Sold; // effects before interactions
        _pullUsdc(msg.sender, l.payout, l.price);
        rights.agentTransfer(listingId, msg.sender);

        emit RoomPurchased(listingId, msg.sender, l.payout, l.price);
    }

    function _pullUsdc(address from, address to, uint256 amount) private {
        // transferFrom(address,address,uint256); tolerate tokens that return nothing.
        (bool ok, bytes memory ret) = usdc.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert PaymentFailed();
    }

    // ----------------------------------------------------- registrar: disputes
    function freezeRoom(uint256 listingId, bytes32 reasonHash) external onlyRegistrar {
        Listing storage l = _get(listingId);
        if (l.status != Status.Available && l.status != Status.Sold) revert NotAvailable();
        if (rights.isFrozen(listingId)) revert AlreadyFrozen();
        rights.setFrozen(listingId, true);
        emit RoomFrozen(listingId, msg.sender, reasonHash);
    }

    function unfreezeRoom(uint256 listingId, bytes32 reasonHash) external onlyRegistrar {
        _get(listingId);
        if (!rights.isFrozen(listingId)) revert NotFrozen();
        rights.setFrozen(listingId, false);
        emit RoomUnfrozen(listingId, msg.sender, reasonHash);
    }

    // ------------------------------------------------------------- expiry
    /// Anyone (keeper, Hedera scheduled transaction, or the tenant UI) can retire a listing
    /// once its period has ended. Burns the token so there is no current holder.
    function expire(uint256 listingId) public {
        Listing storage l = _get(listingId);
        if (l.status != Status.Available && l.status != Status.Sold) revert NothingToExpire();
        if (block.timestamp < l.end) revert NotYetExpired();
        l.status = Status.Expired;
        rights.burn(listingId);
        emit RoomExpired(listingId);
    }

    function expireMany(uint256[] calldata listingIds) external {
        for (uint256 i = 0; i < listingIds.length; i++) {
            Listing storage l = _listings[listingIds[i]];
            // skip entries that cannot be expired instead of reverting the whole batch
            if ((l.status == Status.Available || l.status == Status.Sold) && block.timestamp >= l.end) {
                expire(listingIds[i]);
            }
        }
    }

    // -------------------------------------------------------------- views
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _get(listingId);
    }

    /// Current approved-property root and its version (for the ZK / QR verification page).
    function approvedRoot() external view returns (uint256 root, uint256 version) {
        return (ISemaphoreGroups(address(semaphore)).getMerkleTreeRoot(groupId), rootVersion);
    }

    function listingsOfRoom(uint256 roomTag) external view returns (uint256[] memory) {
        return _roomListings[roomTag];
    }

    /// Current holder, or address(0) if unsold / cancelled / expired.
    function holderOf(uint256 listingId) public view returns (address) {
        Status s = _get(listingId).status;
        return s == Status.Sold ? rights.ownerOf(listingId) : address(0);
    }

    function roomState(uint256 listingId) public view returns (RoomState) {
        if (listingId == 0 || listingId > listingCount) return RoomState.Unknown;
        Listing storage l = _listings[listingId];
        if (l.status == Status.Cancelled) return RoomState.Cancelled;
        if (l.status == Status.Expired) return RoomState.Expired;
        // Ended but nobody has called expire() yet: already expired for every reader.
        if (block.timestamp >= l.end) return RoomState.Expired;
        if (rights.isFrozen(listingId)) return RoomState.Frozen;
        return l.status == Status.Sold ? RoomState.Held : RoomState.Available;
    }

    /// The rule the tenant page relies on: a holder exists, not frozen, inside the period.
    function isValid(uint256 listingId) public view returns (bool) {
        if (listingId == 0 || listingId > listingCount) return false;
        Listing storage l = _listings[listingId];
        return l.status == Status.Sold && !rights.isFrozen(listingId) && block.timestamp >= l.start
            && block.timestamp < l.end;
    }

    /// One call for the public verify page.
    function verifyRoom(uint256 listingId)
        external
        view
        returns (RoomState state, bool valid, address holder, uint64 start, uint64 end, uint256 price, uint256 roomTag)
    {
        Listing memory l = _get(listingId);
        return (roomState(listingId), isValid(listingId), holderOf(listingId), l.start, l.end, l.price, l.roomTag);
    }

    function _get(uint256 listingId) private view returns (Listing storage l) {
        l = _listings[listingId];
        if (l.status == Status.None) revert NoSuchListing();
    }
}
