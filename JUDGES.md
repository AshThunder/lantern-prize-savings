# Judges

Zama Developer Program Mainnet Season 4 · Sepolia

**Live:** [https://laternpool.xyz](https://laternpool.xyz)

**How (every button):** [laternpool.xyz/#guide](https://laternpool.xyz/#guide)

**Source:** [github.com/AshThunder/lantern-prize-savings](https://github.com/AshThunder/lantern-prize-savings)

Local: `cd web && npm ci && npm run dev` then [http://localhost:5173](http://localhost:5173). Not `127.0.0.1` (Openfort rejects it).

## What this is

A [PoolTogether V5](https://dev.pooltogether.com/protocol/design/) prize vault on the Zama Protocol. Deposit sizes stay encrypted. Draws run onchain with FHE. Winners are chosen with onchain `FHE.randEuint64` over encrypted TWAB. The winner address is never published. Principal always comes back.

Pool: [`0x96B98e6ae197bD7738af3ff85f503Cb09D077caC`](https://sepolia.etherscan.io/address/0x96B98e6ae197bD7738af3ff85f503Cb09D077caC)

Official Zama USDT / cUSDT. Not custom tokens.

## 3-minute click path

1. **Sign in** — email OTP (Openfort passkey, gasless) or MetaMask (needs Sepolia ETH). Stay on **Ethereum Sepolia**.
2. **Click a board → Save**
3. **Claim 100 USDT** (Zama mock faucet).
4. **Authorize** so this page can decrypt your numbers. Other wallets still cannot.
5. **Shield** only the vault amount (default 10). Leave public USDT unwrapped if you will feed the prize.
6. **Deposit** that cUSDT. Size stays encrypted.
7. **Draw → Approve + Sponsor** (public USDT). 90% wraps to encrypted prize liquidity. 10% stays public to pay whoever clicks Start or Finish (0.1 USDT each).
8. After **60s** (or owner **Force + finish**), **Run draw**. Freezes TWAB, samples onchain `FHE.rand` targets, selects winners in batches, finishes, checks this wallet.
9. **Save → Check prize / Claim my prize**. Yellow **claimable** if you won. **Claim** takes the prize only. **Withdraw some / Withdraw all** returns your deposit.

**Claim ≠ withdraw.** Two encrypted piles.

Optional **More:** mint a Duck, **Attach hook**, or create a TWAB rewards campaign (holding airdrop, not the lottery).

## Where to look next

| Surface | Why |
| --- | --- |
| Play → **PoolTogether V5 / replica map** | Each row is a live function + the origin doc |
| Play → **Public / private** | What the chain can see vs what stays hidden |
| How | Button map in the same labels as the UI |
| [TWAB.md](./TWAB.md) | Running encrypted vault TWAB and Zama HCU links |
| [PITCH.md](./PITCH.md) | Spoken 3-minute script, X thread, form answers |
| [README.md](./README.md) | `FHE.rand` selection math, replica table, 16 tests |
| [SECURITY.md](./SECURITY.md) | Residual leak and what is public on purpose |

16 Hardhat tests: `cd contracts && npm ci && npx hardhat test`
