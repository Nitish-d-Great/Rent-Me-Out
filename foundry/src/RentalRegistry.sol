// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import {ISemaphoreGroups} from "@semaphore-protocol/contracts/interfaces/ISemaphoreGroups.sol";
import {Roles} from "./Roles.sol";
import {IATSFactory, IATSToken} from "./interfaces/IATS.sol";
import {IBrokerIdentity} from "./interfaces/IBrokerIdentity.sol";

/// RentMeOut core: property approval, room listings, atomic purchase and lifecycle.
///
/// Privacy model: the registrar approves an owner's opaque Semaphore identity commitment
/// (never an address). The owner lists a room with a Semaphore proof that "some approved
/// property authorises these exact terms".
///
/// One approval, one tokenisation. `validateProof` consumes the proof's nullifier inside the
/// Semaphore group, so an approved commitment can list a given room exactly once, ever. When
/// that period is cancelled or expires the token is burned and the approval is spent: to list
/// the room again the owner must re-apply and have a FRESH commitment approved. Each cycle
/// therefore mints a brand-new room token from scratch.
///
/// A side effect is unlinkability: the room tag (the nullifier, scope = room index) is derived
/// from the identity secret, so a re-application produces a different tag and nobody can tell
/// two cycles concern the same room. The cost is that the contract can no longer detect a
/// double-booking across two approvals of the same room (the tags differ), so the registrar
/// must not approve a fresh application for a room whose period is still live.
///
/// Each listing's room token is its own Asset Tokenization Studio security (supply 1, zero
/// decimals), issued through the ATS factory inside createListing, so a listing cannot exist
/// without its token. This contract is the token's only admin and agent. Its allowlist holds
/// just the current custodian, which blocks resale, because a holder has nobody to send to.
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
    error RoomAlreadyListed(uint256 conflictingListingId);
    error NoSuchListing();
    error NotAvailable();
    error ListingEnded();
    error BrokerNotVerified();
    error PaymentFailed();
    error UsdcHasNoCode();
    error AtsFactoryHasNoCode();
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
        uint256 approvedRootUsed
    );
    event RoomTokenIssued(uint256 indexed listingId, address indexed token);
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
    IATSFactory public immutable atsFactory;
    address public immutable atsResolver;

    // ATS role ids, from constants/roles.sol of asset-tokenization-contracts@8.0.0.
    bytes32 private constant ROLE_ADMIN = 0x00;
    // Mint, burn, forced transfer and freeze all accept the agent role.
    bytes32 private constant ROLE_AGENT = 0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b;
    // Editing the allowlist needs its own role; the agent role does not cover it.
    bytes32 private constant ROLE_CONTROL_LIST = 0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d;
    bytes32 private constant EQUITY_CONFIG_ID = bytes32(uint256(1));
    uint8 private constant REGULATION_TYPE_REG_S = 1;
    uint8 private constant REGULATION_SUBTYPE_NONE = 0;
    /// The factory rejects an empty ISIN and requires a valid checksum. A room right has no
    /// real ISIN, so this is the same placeholder ats-issue.mjs uses.
    string private constant PLACEHOLDER_ISIN = "US0378331005";

    /// Version counter for the approved-property root; bumped on every approve/revoke.
    uint256 public rootVersion;
    mapping(uint256 => uint256) public rootAt; // version => root
    mapping(uint256 => uint256) public rootTimestamp; // version => block.timestamp

    uint256 public listingCount; // listing ids start at 1; id == token id
    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => uint256[]) private _roomListings; // roomTag => listing ids
    mapping(uint256 => IATSToken) public tokenOf; // listing id => its ATS room token
    mapping(uint256 => address) private _buyer; // listing id => broker who bought it

    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param rootWindow seconds an older approved-set root still verifies after a change.
    /// @param atsFactory_ the ATS factory that issues each room token.
    /// @param atsResolver_ the ATS business logic resolver those tokens route through.
    constructor(
        ISemaphore semaphore_,
        address usdc_,
        IBrokerIdentity identity_,
        address owner_,
        uint256 rootWindow,
        IATSFactory atsFactory_,
        address atsResolver_
    ) Roles(owner_) {
        // A call to an address with no code succeeds with empty returndata, which _pullUsdc
        // would read as a successful transfer - i.e. free rooms. Fail at deploy instead.
        if (usdc_.code.length == 0) revert UsdcHasNoCode();
        if (address(atsFactory_).code.length == 0) revert AtsFactoryHasNoCode();
        semaphore = semaphore_;
        usdc = usdc_;
        identity = identity_;
        groupId = semaphore_.createGroup(address(this), rootWindow);
        atsFactory = atsFactory_;
        atsResolver = atsResolver_;
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

    /// List one room for one period. Requires a proof of membership in the approved set, which
    /// is spent by this call: the same approval cannot list this room again. An ATS token is
    /// issued for the listing and minted into this contract's escrow until bought or cancelled.
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
        // Reverts inside Semaphore for a bad proof, an unknown/expired root, or a nullifier
        // already spent in this group (Semaphore__YouAreUsingTheSameNullifierTwice) - that
        // last one is what makes an approval single-use and blocks proof replay.
        semaphore.validateProof(groupId, proof);

        // Belt and braces: validateProof already guarantees one listing per tag, so this loop
        // can only ever see an empty array. It stays as a guard in case the proof call changes.
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

        IATSToken token = _issueRoomToken(listingId);
        tokenOf[listingId] = token;
        token.addToControlList(address(this)); // the ATS allowlist applies to mints too
        token.mint(address(this), 1);
        emit RoomTokenIssued(listingId, address(token));
        emit ListingCreated(listingId, tag, payout, start, end, price, proof.merkleTreeRoot);
    }

    /// Owner (payout wallet) or registrar cancels a listing that has not sold. Burns the token.
    function cancelListing(uint256 listingId) external {
        Listing storage l = _get(listingId);
        if (msg.sender != l.payout && !isRegistrar[msg.sender]) revert NotListingOwnerOrRegistrar();
        if (l.status != Status.Available) revert NotAvailable();
        l.status = Status.Cancelled;
        _burnRoomToken(listingId);
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
        if (isFrozen(listingId)) revert NotAvailable();
        // A forced transfer skips the ATS allowlist check, so this is the real gate.
        if (!identity.isVerified(msg.sender)) revert BrokerNotVerified();

        l.status = Status.Sold; // effects before interactions
        _buyer[listingId] = msg.sender;
        _pullUsdc(msg.sender, l.payout, l.price);

        IATSToken token = tokenOf[listingId];
        token.addToControlList(msg.sender);
        token.forcedTransfer(address(this), msg.sender, 1);
        // Leaving the broker as the only allowed address is what blocks resale.
        token.removeFromControlList(address(this));

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
        if (isFrozen(listingId)) revert AlreadyFrozen();
        tokenOf[listingId].freezePartialTokens(_custodian(listingId), 1);
        emit RoomFrozen(listingId, msg.sender, reasonHash);
    }

    function unfreezeRoom(uint256 listingId, bytes32 reasonHash) external onlyRegistrar {
        _get(listingId);
        if (!isFrozen(listingId)) revert NotFrozen();
        tokenOf[listingId].unfreezePartialTokens(_custodian(listingId), 1);
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
        _burnRoomToken(listingId);
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

    // ------------------------------------------------------------ ATS token
    function _issueRoomToken(uint256 listingId) private returns (IATSToken) {
        return IATSToken(atsFactory.deployEquity(_equityData(listingId), _regulationData()));
    }

    /// Burns work on a frozen token too: a dispute must not stop a room being retired.
    function _burnRoomToken(uint256 listingId) private {
        IATSToken token = tokenOf[listingId];
        address custodian = _custodian(listingId);
        if (token.isFrozen(custodian)) token.unfreezePartialTokens(custodian, 1);
        // A holder can redeem their own ATS token, and that must not block expiry.
        if (token.balanceOf(custodian) != 0) token.burn(custodian, 1);
    }

    /// Who holds the token: this contract's escrow until sold, then the broker.
    function _custodian(uint256 listingId) private view returns (address) {
        address buyer = _buyer[listingId];
        return buyer == address(0) ? address(this) : buyer;
    }

    function _equityData(uint256 listingId) private view returns (IATSFactory.EquityData memory data) {
        address[] memory self = new address[](1);
        self[0] = address(this);
        IATSFactory.Rbac[] memory rbacs = new IATSFactory.Rbac[](3);
        rbacs[0] = IATSFactory.Rbac(ROLE_ADMIN, self);
        rbacs[1] = IATSFactory.Rbac(ROLE_AGENT, self);
        rbacs[2] = IATSFactory.Rbac(ROLE_CONTROL_LIST, self);

        IATSFactory.SecurityData memory security;
        security.resolver = atsResolver;
        security.maxSupply = 1; // one token per room period
        security.resolverProxyConfiguration = IATSFactory.ResolverProxyConfiguration(EQUITY_CONFIG_ID, 1);
        security.erc20MetadataInfo = IATSFactory.ERC20MetadataInfo(
            string.concat("RentMeOut Room Rights #", _toString(listingId)), "RMO", PLACEHOLDER_ISIN, 0
        );
        security.rbacs = rbacs;
        security.isControllable = true; // needed for forced transfer and burn
        security.isWhiteList = true; // allowlist; false would make the same list a denylist

        data.security = security;
        data.equityDetails.currency = "USD";
    }

    function _regulationData() private pure returns (IATSFactory.RegulationData memory data) {
        data.regulationType = REGULATION_TYPE_REG_S;
        data.regulationSubType = REGULATION_SUBTYPE_NONE;
        data.additionalSecurityData.info = "RentMeOut room rights";
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        for (uint256 v = value; v != 0; v /= 10) digits++;
        bytes memory out = new bytes(digits);
        for (; value != 0; value /= 10) out[--digits] = bytes1(uint8(48 + value % 10));
        return string(out);
    }

    // -------------------------------------------------------------- views
    /// Whether the room's token is frozen. The ATS token is the source of truth.
    function isFrozen(uint256 listingId) public view returns (bool) {
        IATSToken token = tokenOf[listingId];
        return address(token) != address(0) && token.isFrozen(_custodian(listingId));
    }

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
        if (_get(listingId).status != Status.Sold) return address(0);
        // The token decides: a broker who redeemed it no longer holds the room. A frozen
        // token has left the spendable balance, but its holder still holds the room.
        address buyer = _buyer[listingId];
        IATSToken token = tokenOf[listingId];
        return token.balanceOf(buyer) != 0 || token.isFrozen(buyer) ? buyer : address(0);
    }

    /// World ID nullifier hash of the current holder (0 if there is no holder). The tenant
    /// verify page compares it with the nullifier of the World ID proof of presence that the
    /// person on site completes. Both must come from the same World ID action.
    function holderIdentity(uint256 listingId) external view returns (uint256) {
        address holder = holderOf(listingId);
        return holder == address(0) ? 0 : identity.identityOf(holder);
    }

    function roomState(uint256 listingId) public view returns (RoomState) {
        if (listingId == 0 || listingId > listingCount) return RoomState.Unknown;
        Listing storage l = _listings[listingId];
        if (l.status == Status.Cancelled) return RoomState.Cancelled;
        if (l.status == Status.Expired) return RoomState.Expired;
        // Ended but nobody has called expire() yet: already expired for every reader.
        if (block.timestamp >= l.end) return RoomState.Expired;
        if (isFrozen(listingId)) return RoomState.Frozen;
        return l.status == Status.Sold ? RoomState.Held : RoomState.Available;
    }

    /// The rule the tenant page relies on: a holder exists, not frozen, inside the period.
    function isValid(uint256 listingId) public view returns (bool) {
        if (listingId == 0 || listingId > listingCount) return false;
        Listing storage l = _listings[listingId];
        return l.status == Status.Sold && holderOf(listingId) != address(0) && !isFrozen(listingId)
            && block.timestamp >= l.start && block.timestamp < l.end;
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
