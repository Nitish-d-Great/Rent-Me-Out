// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// The parts of Asset Tokenization Studio that RentalRegistry drives.
///
/// Pinned to asset-tokenization-contracts 8.0.0, the version deployed on Hedera
/// testnet. Later versions changed these structs, which shifts the deployEquity selector
/// and makes the call unroutable, so do not update them from the package's main branch.
interface IATSFactory {
    struct ResolverProxyConfiguration {
        bytes32 key;
        uint256 version;
    }

    struct ERC20MetadataInfo {
        string name;
        string symbol;
        string isin;
        uint8 decimals;
    }

    struct Rbac {
        bytes32 role;
        address[] members;
    }

    struct SecurityData {
        address resolver;
        uint256 maxSupply;
        ResolverProxyConfiguration resolverProxyConfiguration;
        ERC20MetadataInfo erc20MetadataInfo;
        Rbac[] rbacs;
        address[] externalPauses;
        address[] externalControlLists;
        address[] externalKycLists;
        address compliance;
        address identityRegistry;
        bool arePartitionsProtected;
        bool isMultiPartition;
        bool isControllable;
        bool isWhiteList;
        bool clearingActive;
        bool internalKycActivated;
        bool erc20VotesActivated;
    }

    struct EquityDetailsData {
        bool votingRight;
        bool informationRight;
        bool liquidationRight;
        bool subscriptionRight;
        bool conversionRight;
        bool redemptionRight;
        bool putRight;
        uint8 dividendRight;
        bytes3 currency;
        uint256 nominalValue;
        uint8 nominalValueDecimals;
    }

    struct EquityData {
        SecurityData security;
        EquityDetailsData equityDetails;
    }

    struct AdditionalSecurityData {
        bool countriesControlListType;
        string listOfCountries;
        string info;
    }

    struct RegulationData {
        uint8 regulationType;
        uint8 regulationSubType;
        AdditionalSecurityData additionalSecurityData;
    }

    function deployEquity(EquityData calldata equityData, RegulationData calldata regulationData)
        external
        returns (address token);
}

interface IATSToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function forcedTransfer(address from, address to, uint256 amount) external returns (bool);
    function addToControlList(address account) external returns (bool);
    function removeFromControlList(address account) external returns (bool);
    function setAddressFrozen(address account, bool frozen) external;
    function isFrozen(address account) external view returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
