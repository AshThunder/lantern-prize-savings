# Encrypted TWAB

Lantern keeps a **running encrypted vault TWAB**, the same idea as the PoolTogether [TWAB controller](https://dev.pooltogether.com/protocol/design/twab-controller). `startDraw` freezes the vault total in one mul+add. Each wallet’s weight is computed at **claim** from that wallet’s own handles.

Zama [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu) meters FHE **per transaction** (sequential depth 5,000,000, global 20,000,000). A draw that added every depositor into one ciphertext would burn that budget. So the vault total is maintained as shares change, and start only snapshots it.

`euint64` costs from that page: non-scalar `add`/`sub` 162,000, scalar `mul` 365,000.

[Loops](https://docs.zama.org/protocol/solidity-guides/smart-contract/logics/loop): fixed bounds, no unbounded encrypted walk. Vault freeze is O(1). Claim is O(1) plus one accrue per skipped draw.

## What the contract does

On deposit / withdraw / accrue:

1. `_syncGlobalTwab` — `_twabCumulativeTotal += _totalShares × dt`
2. `_catchUpUser` — accrue that wallet to now; if a draw was awarded, freeze `_drawWeight` at `drawStartedAtOf[id]`

On `startDraw` / `forceDraw`:

1. Sync the vault total
2. Permissionless period: `_eligibleTwabTotal = _twabCumulativeTotal - _twabTotalSnap`
3. Force or period 0: `_eligibleTwabTotal = _totalShares` (current shares)
4. Snap `_twabTotalSnap = _twabCumulativeTotal`

On `accruePrize` / `claim`:

1. Catch up that account
2. `isWinner(userSeed, weight, eligibleTotal)`

`stepDraw` is on the ABI and completes immediately. `remainingScan()` is 0. `finalizeDraw` does not wait on a scan.

`snapshotPrizeRecipients` walks **plaintext** addresses for NFT hooks. No FHE in that loop.

## minHold

Last-second deposits get **weight 0** (`lastActionAt + minHold > drawStartedAt`). They may still contribute a few share-seconds to the **vault total** if any time passed before start. That makes winning slightly harder, never easier. Same-block deposit + start adds `dt = 0`.

## Skipped draws

Catch-up walks `userSnapDrawId+1 … lastAwardedDrawId` and snaps at each `drawStartedAtOf[id]`. Claiming every draw stays O(1). Skipping many draws in one claim burns HCU on those accrues.

## Origin

- PoolTogether [TWAB controller](https://dev.pooltogether.com/protocol/design/twab-controller)
- Zama [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu)
- Zama [branches and loops](https://docs.zama.org/protocol/solidity-guides/smart-contract/logics/loop)
