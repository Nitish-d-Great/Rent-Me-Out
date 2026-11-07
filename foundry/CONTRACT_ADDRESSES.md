# Contract addresses

Hedera Testnet · chain ID `296`. These addresses are also recorded in
[`deployments/296.json`](deployments/296.json). Select the HashScan link to open a
contract in the testnet explorer.

## Rent Me Out contracts

| Contract | Address | HashScan | Sourcify |
|---|---|---|---|
| RentalRegistry (current) | `0xCB63F343D4b4151bfe75E8617144e72E99D7667B` | [Open](https://hashscan.io/testnet/contract/0xCB63F343D4b4151bfe75E8617144e72E99D7667B) | `exact_match` |
| RentalRegistry (legacy) | `0xb7Bd37F38129A93f49CeF030E63Cfb48D6F52e9E` | [Open](https://hashscan.io/testnet/contract/0xb7Bd37F38129A93f49CeF030E63Cfb48D6F52e9E) | `exact_match` |
| BrokerIdentityRegistry | `0x87081bAA3a6F0518f16d787e53754c5fD6a6Dac9` | [Open](https://hashscan.io/testnet/contract/0x87081bAA3a6F0518f16d787e53754c5fD6a6Dac9) | `exact_match` |
| DemoUSDC (`USDC` in the deployment file) | `0xDf44cFf3dD65135b2d7Ec45b77BE85ae8dAa2876` | [Open](https://hashscan.io/testnet/contract/0xDf44cFf3dD65135b2d7Ec45b77BE85ae8dAa2876) | `exact_match` |

## Semaphore contracts

| Contract | Address | HashScan | Sourcify |
|---|---|---|---|
| Semaphore | `0xA9bdBf426F52dC24ced44aEb36Bd8F6bd580C067` | [Open](https://hashscan.io/testnet/contract/0xA9bdBf426F52dC24ced44aEb36Bd8F6bd580C067) | `exact_match` |
| SemaphoreVerifier | `0xf79A9b157b8DbafEf8720A1280d1d28291Df0cC9` | [Open](https://hashscan.io/testnet/contract/0xf79A9b157b8DbafEf8720A1280d1d28291Df0cC9) | `match` |
| PoseidonT3 | `0x80B5F0596952ccAF71da284914488CF0A66FD1cA` | [Open](https://hashscan.io/testnet/contract/0x80B5F0596952ccAF71da284914488CF0A66FD1cA) | `match` |

## Existing ATS contracts

These ATS contracts were already deployed on Hedera testnet and are configured in the
deployment script; Rent Me Out does not deploy them.

| Contract | Address | HashScan |
|---|---|---|
| ATS Factory | `0xd1F118A40f3b02883D35909eF2517e7EDd78379d` | [Open](https://hashscan.io/testnet/contract/0xd1F118A40f3b02883D35909eF2517e7EDd78379d) |
| ATS Resolver | `0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a` | [Open](https://hashscan.io/testnet/contract/0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a) |

Room tokens are issued through the ATS Factory when listings are created, so there is no
single room-token address to list here. The token address is specific to each listing.
