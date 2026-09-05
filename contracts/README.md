# Lantern contracts

FHEVM Hardhat project for `ConfidentialPrizePool`. Forked from [zama-ai/fhevm-hardhat-template](https://github.com/zama-ai/fhevm-hardhat-template). Design, winner math, and judge path: [root README](../README.md).

Solidity `0.8.27` · `@fhevm/solidity@0.11.1` · `@openzeppelin/confidential-contracts@0.5.3`

## Sepolia

| Contract | Address |
| --- | --- |
| **ConfidentialPrizePool** (claim-time `isWinner`) | [`0x734D71C56731AFEF3c15791c3bAb92ad740de94E`](https://sepolia.etherscan.io/address/0x734D71C56731AFEF3c15791c3bAb92ad740de94E) |
| PrizeToNftHolderHook | [`0xCE94E26Eaf2895F32A80D8Cf455De61dC22634F8`](https://sepolia.etherscan.io/address/0xCE94E26Eaf2895F32A80D8Cf455De61dC22634F8) |
| MockDuckNFT | [`0x429eB02B06B5DD98deCE25899E49a17E0b6BB035`](https://sepolia.etherscan.io/address/0x429eB02B06B5DD98deCE25899E49a17E0b6BB035) |
| LanternForwarder (onchain, unused by UI) | [`0x75E360fd3e87466d7f6e95A85688D3e8F5048921`](https://sepolia.etherscan.io/address/0x75E360fd3e87466d7f6e95A85688D3e8F5048921) |

Official Zama tokens (not custom): USDT [`0xa7dA…e9b0`](https://sepolia.etherscan.io/address/0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0) · cUSDT [`0x4E7B…4491`](https://sepolia.etherscan.io/address/0x4E7B06D78965594eB5EF5414c357ca21E1554491) · Wrappers Registry [`0x2f07…128e`](https://sepolia.etherscan.io/address/0x2f0750Bbb0A246059d80e94c454586a7F27a128e)

hardhat-deploy id: `deploy_lantern_running_twab_v1`. Sepolia draw period is **60 seconds**. Local Hardhat uses period `0` and mock tokens. Design: [TWAB.md](../TWAB.md).

## What is in here

| File | Role |
| --- | --- |
| `ConfidentialPrizePool.sol` | Vault, running encrypted TWAB, sponsor split, `startDraw` / `finalizeDraw`, claim-time `isWinner` |
| `PrizeToNftHolderHook.sol` | Redirects an encrypted prize to a random enumerable NFT holder |
| `LanternForwarder.sol` | Minimal ERC-2771 forwarder (UI uses Openfort 7702 instead) |
| `interfaces/IPrizeHooks.sol` | PoolTogether-style hook interface |
| `mocks/MockDuckNFT.sol` | Enumerable duck NFT for the hook demo |
| `mocks/MockUSDT.sol` / `MockConfidentialUSDT.sol` | Local Hardhat only |

## Commands

```bash
npm ci
npx hardhat test
npx hardhat compile
```

Deploy (Sepolia):

```bash
# contracts/.env
# SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# PRIVATE_KEY=0x…          # deployer, also used as pool owner
npx hardhat deploy --network sepolia --tags Lantern
```

After a new pool:

1. Put the addresses in `web/.env` and `web/.env.example`.
2. Update the Openfort Sepolia policy allowlist (pool, hook, USDT, cUSDT, NFT, Wrappers Registry).
3. Do not commit private keys.

`forceDraw` is owner-only and skips the hold cliff so a demo can award immediately.

## Tests

15 Hardhat tests in `test/ConfidentialPrizePool.ts`:

- Encrypted deposit credits shares 1:1
- Withdraw returns principal (no-loss)
- Full exit does not touch a second depositor
- Withdraw blocked while a draw is in progress
- `startDraw` blocked until the period elapses
- Awarded winnings sum to the public prize and can be claimed
- Vault helpers (`previewDeposit` etc.) stay 1:1
- NFT hook redirects encrypted winnings
- Last-second deposits get zero TWAB weight
- TWAB rewards pay by encrypted share-seconds
- Sponsor splits 90% prize liquidity / 10% reserve and pays the Start keeper
- Anyone can `claimFor` a winner
- Phase moves Closed then Finalized across a timed period
- `startDraw` freezes vault TWAB in one mul+add
- Multiple wallets can deposit and claim independently
