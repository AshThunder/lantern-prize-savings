# Lantern — Confidential Prize Savings

A production-oriented [PoolTogether](https://dev.pooltogether.com/protocol/design/) prize vault on the [Zama Protocol](https://www.zama.org/post/zama-developer-program-mainnet-season-4): no-loss principal, encrypted deposit sizes, and **onchain FHE-weighted draws** using `FHE.randEuint64`.

**Live app (Sepolia):** [https://lantern-prize.pages.dev](https://lantern-prize.pages.dev)

**Pool:** [`0x38a7078996F0FCE4C4c858ae5B445fD6F420C3C8`](https://sepolia.etherscan.io/address/0x38a7078996F0FCE4C4c858ae5B445fD6F420C3C8)

## For judges

1. Open the live URL, connect a wallet, switch to **Ethereum Sepolia**.
2. Get Sepolia ETH from a public faucet if needed.
3. **Mint 100 USDT** (Zama mock, 1M cap per call) → **Shield** into cUSDT → **Deposit (encrypted)**.
4. **Authorize EIP-712 decrypt** to reveal your vault shares.
5. **Approve pool** + **Sponsor / contribute** a prize (mock yield).
6. After the 60s draw period (or the owner **Force draw**), **Start draw** → **Step draw** until the scan finishes → **Finalize**.
7. Decrypt **winnings**, **Claim**, then **Withdraw** / **Redeem all**. Principal is never slashed.

SDK: [`@zama-fhe/sdk@3.5.1`](https://www.npmjs.com/package/@zama-fhe/sdk) and [`@zama-fhe/react-sdk@3.5.1`](https://www.npmjs.com/package/@zama-fhe/react-sdk). Contracts use `@fhevm/solidity@0.11.1` + `@openzeppelin/confidential-contracts@0.5.3` (the versions OpenZeppelin and the FHEVM Hardhat plugin pin together).

## How the pool works

Lantern maps the PoolTogether V5 user/vault/prize-pool surface onto confidential tokens:

| PoolTogether | Lantern |
| --- | --- |
| ERC-4626 `deposit` / `mint` | `confidentialTransferAndCall` of cUSDT with `data = 0x01` credits encrypted shares 1:1 |
| `withdraw` / `redeem` | Encrypted `withdraw` / `redeem`; `redeemAll` / `withdrawAll` exits the draw set |
| Share price | Always 1:1 — yield never inflates shares (same as PT) |
| `sponsor` / `contributePrizeTokens` / liquidate | `sponsor` pulls USDT, wraps to cUSDT, adds **public** prize liquidity |
| TWAB | Snapshot of current encrypted shares at draw start; optional `minHoldSeconds` |
| `delegate` | Chance (not tokens) can be delegated; winnings credit the delegatee |
| Prize tiers | Two independent FHE tickets: **grand 75%** and **daily 25%** |
| Draw manager | Permissionless `startDraw` after `drawPeriodSeconds` (60s on Sepolia); owner `forceDraw` |
| Claimer | `claim`, `claimTo`, `claimFor` (claimer/owner/self) |
| RNG | `FHE.randEuint64` onchain — no offchain RNG |

### Winner selection

```solidity
euint128 prod = FHE.mul(FHE.asEuint128(rand), FHE.asEuint128(totalShares));
euint64 ticket = FHE.asEuint64(FHE.shr(prod, 64)); // ~U[0, totalShares)
```

Keepers walk depositors in chunks of **8** (`stepDraw`) so sequential HCU stays under the 5M depth limit. For each user:

```solidity
cursor += share;
hit = (ticket < cursor) && !found;
winnings[delegatee] += select(hit, tierPrize, 0);
```

The winner address is **never** decrypted onchain. Users learn the outcome by EIP-712 user-decrypt of `confidentialWinningsOf`.

Sepolia is limited to **32 depositors** so a draw finishes in four keeper transactions.

## Confidentiality design

| Encrypted | Public |
| --- | --- |
| Individual deposits, vault shares, odds | Depositor addresses (needed to iterate the draw) |
| FHE random tickets | Wrap / unwrap ERC-20 amounts (inherent to ERC-20) |
| Per-user winnings | Prize size this draw (PoolTogether-style UX) |
| | Draw timestamps, that a claim tx occurred |

Residual leak: if only one address claims a non-zero prize, observers may infer the winner. Anyone can call `claim` (including losers, who transfer encrypted 0) to pad that signal.

## Yield source mock

`sponsor(uint64 amount)` is the mock harvest:

1. Caller transfers public USDT to the pool.
2. Pool `wrap`s it to official Sepolia **cUSDTMock**.
3. `prizeLiquidity` increases (plaintext, shown in the UI).

**Production plug-in:** replace `sponsor` with harvest from an ERC-4626 (Aave/Morpho) via Zama’s [confidential vault batcher](https://docs.zama.org/protocol/confidential-vault), contributing only yield, never principal.

Tokens (Sepolia):

- USDT mock (mintable): [`0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0`](https://sepolia.etherscan.io/address/0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0)
- cUSDTMock wrapper: [`0x4E7B06D78965594eB5EF5414c357ca21E1554491`](https://sepolia.etherscan.io/address/0x4E7B06D78965594eB5EF5414c357ca21E1554491)

## Repo layout

```
contracts/   FHEVM Hardhat app (from zama-ai/fhevm-hardhat-template)
web/         Vite + React dApp (@zama-fhe/react-sdk 3.5.1)
```

### Contracts

```bash
cd contracts
cp ../web/.env.example .env   # add PRIVATE_KEY + SEPOLIA_RPC_URL
npm ci
npx hardhat test
npx hardhat deploy --network sepolia --tags Lantern
```

### Frontend

```bash
cd web
cp .env.example .env          # set VITE_POOL_ADDRESS
npm ci
npm run dev                   # http://localhost:5173
npm run build
```

## Demo video (you record)

Max 3 minutes, real person, normal speed, no AI voice.

1. Open [lantern-prize.pages.dev](https://lantern-prize.pages.dev), connect wallet, Sepolia.
2. Mint → Shield → Deposit. Authorize decrypt; show encrypted shares becoming a number.
3. Sponsor a prize. Start/force draw, step, finalize. Explain: random ticket is encrypted, walk is weighted by encrypted shares, winner is not published.
4. Decrypt winnings → Claim → Redeem all (principal back).

X thread: tag [@zama](https://x.com/zama) with `#ZamaDeveloperProgram`.
