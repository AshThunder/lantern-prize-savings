# Encrypted TWAB

Lantern keeps a **running encrypted vault TWAB**, the same idea as the PoolTogether [TWAB controller](https://dev.pooltogether.com/protocol/design/twab-controller). `startDraw` freezes the vault total in one mul+add and samples onchain `FHE.randEuint64` targets. Each wallet’s weight is frozen during **selection** (`stepDraw`) from that wallet’s own handles.

Zama [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu) meters FHE **per transaction** (sequential depth 5,000,000, global 20,000,000). A draw that selected every depositor in one ciphertext would burn that budget. So the vault total is maintained as shares change, start only snapshots it, and selection walks the roster in batches of at most 8 (`MAX_STEP`).

`euint64` costs from that page: non-scalar `add`/`sub` 162,000, scalar `mul` 365,000.

[Loops](https://docs.zama.org/protocol/solidity-guides/smart-contract/logics/loop): fixed bounds, no unbounded encrypted walk. Vault freeze is O(1). Selection is O(depositors) across batched txs.

## What the contract does

On deposit / withdraw / accrue:

1. `_syncGlobalTwab` — `_twabCumulativeTotal += _totalShares × dt`
2. `_catchUpUser` — accrue that wallet to now; if a draw was awarded, freeze `_drawWeight` at `drawStartedAtOf[id]`

On `startDraw` / `forceDraw`:

1. Sync the vault total
2. Permissionless period: `_eligibleTwabTotal = _twabCumulativeTotal - _twabTotalSnap`
3. Force or period 0: `_eligibleTwabTotal = _totalShares` (current shares)
4. Snap `_twabTotalSnap = _twabCumulativeTotal`
5. Sample `_targetGrand` and `_targetDaily` with `mapTicket(FHE.randEuint64(), eligibleTwabTotal)` so each target is uniform in `[0, T)` without publishing `T`
6. Reset cumulative prefixes and `scanIndex = 0`

On `stepDraw(n)`:

1. For up to `n` depositors: accrue TWAB to `drawStartedAt`, read weight, add to encrypted cumulative prefixes
2. If `target < cum` and that tier is not yet awarded, credit the encrypted grand or daily prize into the recipient’s `_winnings`
3. Advance `scanIndex`

On `finalizeDraw`:

1. Require `scanIndex == depositorCount`
2. Reopen the pool. Unassigned prize cUSDT (if every weight was zero) stays in the pool balance

On `claim`:

1. Catch up / no-op accrue (selection already credited winners)
2. Confidential-transfer winnings

`remainingScan()` is `depositors.length - scanIndex` while drawing.

`snapshotPrizeRecipients` walks **plaintext** addresses for NFT hooks. No FHE in that loop. Call it after start and before step.

## Odds

75% / 25% is the **prize size split** (`lastGrandPrize` / `lastDailyPrize`). Each tier is an independent cumulative pick with odds `weight / eligibleTwabTotal`.

## minHold

Last-second deposits get **weight 0** (`lastActionAt + minHold > drawStartedAt`). They may still contribute a few share-seconds to the **vault total** if any time passed before start. That makes winning slightly harder, never easier. Same-block deposit + start adds `dt = 0`.

## Skipped draws

Catch-up walks `userSnapDrawId+1 … lastAwardedDrawId` and snaps at each `drawStartedAtOf[id]`. Claiming every draw stays cheap. Skipping many draws in one claim burns HCU on those accrues.

## Origin

- PoolTogether [TWAB controller](https://dev.pooltogether.com/protocol/design/twab-controller)
- Zama [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu)
- Zama [encrypted randomness](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random)
- Zama [branches and loops](https://docs.zama.org/protocol/solidity-guides/smart-contract/logics/loop)
