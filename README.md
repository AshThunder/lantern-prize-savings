# Lantern — Confidential Prize Savings

A [PoolTogether V5](https://dev.pooltogether.com/protocol/design/) prize vault on the [Zama Protocol](https://www.zama.org/post/zama-developer-program-mainnet-season-4): no-loss principal, encrypted deposit sizes, and **onchain FHE-weighted draws**. Winners are chosen with onchain `FHE.randEuint64` over encrypted TWAB — the winner address is never published.

**Track:** Zama Developer Program Mainnet Season 4 · Sepolia

**Live app:** [https://laternpool.xyz](https://laternpool.xyz)

**Source:** [github.com/AshThunder/lantern-prize-savings](https://github.com/AshThunder/lantern-prize-savings)

**How (button map):** [laternpool.xyz/#guide](https://laternpool.xyz/#guide)

**Docs:** · [JUDGES.md](./JUDGES.md) · [TWAB.md](./TWAB.md) · [SECURITY.md](./SECURITY.md) · [CONTRIBUTING.md](./CONTRIBUTING.md) · [LICENSE.md](./LICENSE.md) · [web/README.md](./web/README.md) · [contracts/README.md](./contracts/README.md)


| Contract                                         | Sepolia                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **ConfidentialPrizePool** (`FHE.rand` selection) | `[0x96B98e6ae197bD7738af3ff85f503Cb09D077caC](https://sepolia.etherscan.io/address/0x96B98e6ae197bD7738af3ff85f503Cb09D077caC)` |
| PrizeToNftHolderHook                             | `[0x400382Ea48EfC27a6976E50471438A5dF1730A75](https://sepolia.etherscan.io/address/0x400382Ea48EfC27a6976E50471438A5dF1730A75)` |
| MockDuckNFT                                      | `[0x429eB02B06B5DD98deCE25899E49a17E0b6BB035](https://sepolia.etherscan.io/address/0x429eB02B06B5DD98deCE25899E49a17E0b6BB035)` |
| LanternForwarder (onchain, unused by UI)         | `[0x75E360fd3e87466d7f6e95A85688D3e8F5048921](https://sepolia.etherscan.io/address/0x75E360fd3e87466d7f6e95A85688D3e8F5048921)` |


Official Zama tokens (not custom): USDT `[0xa7dA…e9b0](https://sepolia.etherscan.io/address/0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0)` · cUSDT `[0x4E7B…4491](https://sepolia.etherscan.io/address/0x4E7B06D78965594eB5EF5414c357ca21E1554491)` · Wrappers Registry `[0x2f07…128e](https://sepolia.etherscan.io/address/0x2f0750Bbb0A246059d80e94c454586a7F27a128e)`

SDK: `[@zama-fhe/sdk@3.5.1](https://www.npmjs.com/package/@zama-fhe/sdk)` + `[@zama-fhe/react-sdk@3.5.1](https://www.npmjs.com/package/@zama-fhe/react-sdk)`. Contracts: `@fhevm/solidity@0.11.1` + `@openzeppelin/confidential-contracts@0.5.3`.

## For judges (3 minutes)

Use **[http://localhost:5173](http://localhost:5173)** or the live URL. Not `127.0.0.1` (Openfort rejects it).

1. **Sign in** — email OTP (Openfort passkey, **gasless** on Sepolia) or MetaMask (needs Sepolia ETH). Switch to **Ethereum Sepolia**.
2. **Save → Claim 100 USDT** (Zama mock faucet).
3. **Authorize** so this page can decrypt your numbers. Other wallets still cannot.
4. **Shield** only the vault amount (default 10). Leave public USDT unwrapped if you will feed the prize.
5. **Deposit** that cUSDT. Amount stays encrypted. Shares are 1:1.
6. **Draw → Approve + Sponsor** (public USDT, not vault shares). 90% wraps to encrypted prize liquidity; 10% stays public to pay whoever runs Start / Finish (0.1 USDT each).
7. After **60s** (or owner **Force + finish**), **Run draw**. That freezes TWAB, samples onchain `FHE.rand` targets, selects winners in batches, finishes, and checks this wallet. **Start only** closes the period and leaves selection / Finish for later txs.
8. **Save → Check prize / Claim my prize**. Yellow **claimable** stamp if you won. **Claim** takes the prize only. **Your deposit** is a different pile — **Withdraw some / Withdraw all** returns principal. No-loss.
9. Optional **More:** Duck NFT hook, chance delegate, TWAB rewards campaign (holding airdrop, not the lottery).

Scroll to **PoolTogether V5 / replica map** on Play — each row links the origin doc. **Public / private** is what the chain can see vs what stays hidden. **How** is the button map. One-pager: [JUDGES.md](./JUDGES.md).

## What the boards are

Play says **Click a board**. Three stamp buttons, not a header.


| Tab      | What you do                                                           |
| -------- | --------------------------------------------------------------------- |
| **Save** | Faucet, shield, deposit, claim a **prize**, withdraw **your deposit** |
| **Draw** | Feed public USDT into the pot, run or finish the 60s draw             |
| **More** | Unshield, claim-for, delegate, NFT hook, TWAB campaign                |


**Claim ≠ withdraw.** Claim moves lottery winnings. Withdraw moves the money you deposited. They are separate encrypted balances.

## How the pool works

Lantern is a **confidential replica of [PoolTogether V5](https://dev.pooltogether.com/)**. Each row is a live function plus the origin doc.


| PoolTogether V5                                                                                                       | Lantern                                                                                                                                                        | Origin                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Prize Vault](https://dev.pooltogether.com/protocol/design/vaults) `deposit` / `mint`                                 | `confidentialTransferAndCall` of cUSDT with `data = 0x01` credits encrypted shares 1:1                                                                         | [Vaults](https://dev.pooltogether.com/protocol/design/vaults)                                                                                                                 |
| Prize Vault `withdraw` / `redeem`                                                                                     | Encrypted `withdraw` / `redeem`; `redeemAll` / `withdrawAll` exits the draw set                                                                                | [Vaults](https://dev.pooltogether.com/protocol/design/vaults)                                                                                                                 |
| Share price (yield never inflates shares)                                                                             | Always 1:1 — yield is diverted to prizes                                                                                                                       | [Vaults](https://dev.pooltogether.com/protocol/design/vaults)                                                                                                                 |
| [Prize Pool](https://dev.pooltogether.com/protocol/design/prize-pool) `contributePrizeTokens`                         | `sponsor` / `contributePrizeTokens` / `liquidateYield` pull public USDT, wrap 90% to cUSDT prize liquidity                                                     | [Contribute](https://dev.pooltogether.com/protocol/design/prize-pool#vaults-contribute-the-prize-token)                                                                       |
| Prize Pool [reserve](https://dev.pooltogether.com/protocol/design/prize-pool#reserve) (10%)                           | `reserve` stays unwrapped USDT; pays whoever sends `startDraw` / `finalizeDraw`                                                                                | [Reserve](https://dev.pooltogether.com/protocol/design/prize-pool#reserve)                                                                                                    |
| [Liquidator](https://dev.pooltogether.com/protocol/design/#liquidation) / TPDA                                        | `liquidateYield` is the named entrypoint (same as `sponsor`; no Dutch auction on FHE amounts)                                                                  | [Liquidation](https://dev.pooltogether.com/protocol/design/#liquidation)                                                                                                      |
| [Twab Controller](https://dev.pooltogether.com/protocol/design/twab-controller)                                       | Running encrypted vault TWAB. `startDraw` freezes the total in one mul+add. User weight freezes during `stepDraw`. `minHoldSeconds` zeros last-second deposits | [TWAB](https://dev.pooltogether.com/protocol/design/twab-controller) · [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu) · [TWAB.md](./TWAB.md)     |
| Twab Controller `delegate`                                                                                            | `delegate` / `delegateOf` — chance (not tokens) can be pointed at someone else                                                                                 | [Delegation](https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#delegation-sweepstakes)                                                                  |
| [Prize hooks](https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives) / NFT sweepstakes              | `setHooks` + `PrizeToNftHolderHook` redirects encrypted winnings to a random enumerable NFT holder                                                             | [NFT sweepstakes](https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#nft-prize-sweepstakes)                                                              |
| [Twab Rewards](https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#twab-rewards)                  | `createTwabCampaign` / `claimTwabRewards` airdrop cUSDT by encrypted share-seconds                                                                             | [TWAB Rewards](https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#twab-rewards)                                                                          |
| Prize tiers (grand + daily)                                                                                           | **Grand 75%** and **daily 25%** of prize liquidity (size split); each tier is an independent encrypted cumulative pick                                         | [Prize structure](https://dev.pooltogether.com/protocol/design/#prize-structure)                                                                                              |
| Draw lifecycle Open / Closed / Awarded / Finalized                                                                    | `getDrawPhase()` returns 0–3                                                                                                                                   | [Draws](https://dev.pooltogether.com/protocol/design/#draws)                                                                                                                  |
| [Draw Manager](https://dev.pooltogether.com/protocol/design/prize-pool#incentivized-draws) `startDraw` / `finishDraw` | Permissionless `startDraw` after 60s (freezes vault TWAB + samples `FHE.rand`) → `stepDraw` batches → `finalizeDraw`; `claim` pays credited winnings           | [Incentivized draws](https://dev.pooltogether.com/protocol/design/prize-pool#incentivized-draws)                                                                              |
| [Prize Claimer](https://dev.pooltogether.com/protocol/design/prize-claimer)                                           | `claim`, `claimTo`, permissionless `claimFor`                                                                                                                  | [Prize Claimer](https://dev.pooltogether.com/protocol/design/prize-claimer)                                                                                                   |
| RNG auction (Witnet / VRF)                                                                                            | Onchain `FHE.randEuint64` targets mapped onto encrypted TWAB (`mapTicket`); cumulative selection in `stepDraw`. No offchain RNG                                | [RNG auction](https://dev.pooltogether.com/protocol/design/#rng-auction) · [Zama randomness](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random) |
| Gasless (ERC-4337)                                                                                                    | Openfort email/passkey EOA + EIP-7702 paymaster (same key signs Zama decrypt permits)                                                                          | [PT gasless](https://paragraph.com/@pooltogether-2/pooltogether-has-gone-gasless) · [Openfort × Zama](https://www.openfort.io/docs/recipes/earn-private-yield-zama)           |


Owner `forceDraw` uses current shares (no hold cliff) so a demo can award immediately.

### Winner selection

`startDraw` freezes the encrypted vault TWAB and samples two onchain `FHE.randEuint64` values. Each is mapped into `[0, eligibleTwabTotal)` with `mapTicket` (no public decrypt of the total). `stepDraw` walks depositors in batches of at most 8, builds encrypted cumulative weight prefixes, and credits the grand and daily prizes when the target falls in a wallet’s interval. `finalizeDraw` requires a complete scan. Design: [TWAB.md](./TWAB.md).

```solidity
euint64 target = mapTicket(FHE.randEuint64(), eligibleTwabTotal); // (rand * total) >> 64
// per depositor in stepDraw:
cum = cum + weight;
hit = !awarded && (target < cum);
pay = select(hit, remainingTierPrize, 0); // at most one payout per tier
```

Odds per tier are `weight / eligibleTwabTotal`. Grand 75% and daily 25% are the **prize size** split. The winner address is never decrypted onchain.

Users learn the outcome by **Check prize** then EIP-712 decrypt of `confidentialWinningsOf`, or by **Claim**. Losers can claim too (encrypted 0) so a lone claim tx does not leak.

Zama [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu) limits FHE ops **per transaction** (5M sequential depth, 20M global). Vault TWAB is updated as shares change; selection is batched. See [TWAB.md](./TWAB.md).

### Optional PT names (skip for a first demo)

**Liquidate** is Sponsor under the [liquidator](https://dev.pooltogether.com/protocol/design/#liquidation) name. V5 harvests Aave yield via a TPDA auction. Lantern has no Aave — `liquidateYield` calls `sponsor`. Approve, then Sponsor. Do not click both for the same tokens.

**TWAB rewards** is not the lottery. Someone funds a public-USDT budget and a window; after the window, depositors claim a slice `shares × secondsHeld × budget / scale`. Optional. Default window 120s.

**Deliberate gaps** (not faked as 1:1): V5 [auto-credits prizes](https://dev.pooltogether.com/protocol/design/) — we keep `claim` because the winner handle is encrypted. Adaptive canary tiers, TPDA Dutch liquidator, parabolic RNG auction, VRGDA claim fees, partial TWAB delegator, vault factory, and vault booster are named or mocked, not reimplemented as plaintext copies.

## Public / private

What the Play table calls **Public / private**. Encrypted values stay FHE handles. Public values are on the chain on purpose.


| Private (encrypted)                     | Public                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| Individual deposits, vault shares, odds | Depositor addresses (needed to snapshot TWAB / select) |
| FHE.rand targets / selection compares   | Wrap / unwrap ERC-20 amounts                           |
| Per-user winnings                       | Prize **size** this draw (grand / daily tiles)         |
|                                         | Draw timestamps, that a claim tx occurred              |


Residual leak: if only one address claims a non-zero prize, observers may infer the winner. Anyone can call `claim` (including losers, encrypted 0) to pad that signal.

## Yield mock

`sponsor(uint64 amount)`:

1. Caller transfers **public USDT** to the pool.
2. **10%** stays unwrapped in `reserve` (0.1 USDT paid to whoever runs Start and Finish).
3. The rest `wrap`s to official Sepolia **cUSDTMock** as `prizeLiquidity` (size is public; who wins is not).

Production: replace `sponsor` with harvest from an ERC-4626 via Zama’s [confidential vault batcher](https://docs.zama.org/protocol/confidential-vault). Contribute yield only, never principal.

USDT mock has a public `mint` (1M cap). The UI claims a fixed 100, no amount picker.

## Repo

```
PITCH.md          3-minute spoken script, X thread, form answers
JUDGES.md         3-minute click path
TWAB.md           Running encrypted vault TWAB
SECURITY.md       What stays hidden, residual leak
CONTRIBUTING.md   Test and deploy
contracts/        FHEVM Hardhat (from zama-ai/fhevm-hardhat-template)
web/              Vite + React (@zama-fhe/react-sdk 3.5.1)
```

```bash
# contracts
cd contracts && npm ci && npx hardhat test
# SEPOLIA_RPC_URL + PRIVATE_KEY in contracts/.env
npx hardhat deploy --network sepolia --tags Lantern

# frontend
cd web && cp .env.example .env   # pool + Openfort keys
npm ci && npm run dev            # http://localhost:5173
```

16 Hardhat tests cover deposit, sponsor split, `FHE.rand` selection, running TWAB, keeper pay. List: [contracts/README.md](./contracts/README.md).

Production is Vercel (`web/` as root). FHE WASM is `runtime.singleThread` so the app does not need COOP/COEP headers.

## Gasless (Openfort + EIP-7702)

Email OTP creates a self-custodial passkey EOA that can sign Zama EIP-712 decrypt permits. That EOA is EIP-7702-delegated; the Openfort paymaster pays Sepolia gas for pool writes **and** shield/deposit (official cUSDT is not ERC-2771). MetaMask / injected wallets pay their own ETH.

Same recipe as [Openfort × Zama confidential yield](https://www.openfort.io/docs/recipes/earn-private-yield-zama). Frontend only.

Sepolia gas policy must allowlist the **current** pool, hook, USDT, cUSDT, Duck NFT, and Wrappers Registry. Update the allowlist after each redeploy.

```bash
VITE_OPENFORT_PUBLISHABLE_KEY=pk_test_...
VITE_OPENFORT_SHIELD_KEY=...
VITE_OPENFORT_FEE_SPONSORSHIP_ID=pol_...
```

Without those keys, injected wallet still works.

## Demo video

Spoken script, X thread, and form answers: [PITCH.md](./PITCH.md).

Max 3 minutes, real person, normal speed, no AI voice.

1. Open the live URL. Sign in (email OTP for gasless). Sepolia.
2. Claim 100 USDT → Shield 10 → Deposit 10. Authorize. Show encrypted shares becoming a number.
3. Draw: Approve + Sponsor public USDT. **Run draw**.
4. Save: Check prize. Yellow **claimable** if you won. **Claim my prize** (prize only). **Withdraw all** (deposit back).
5. Optional 15s: More → mint Duck → Attach hook.

X: tag [@zama](https://x.com/zama) · `#ZamaDeveloperProgram`