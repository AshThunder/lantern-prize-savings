# Pitch

Zama Developer Program Mainnet Season 4 · Bounty: confidential PoolTogether.

**Live:** https://lantern-prize.vercel.app  
**How:** https://lantern-prize.vercel.app/#guide  
**Source:** https://github.com/AshThunder/lantern-prize-savings  
**Pool:** [`0x734D71C56731AFEF3c15791c3bAb92ad740de94E`](https://sepolia.etherscan.io/address/0x734D71C56731AFEF3c15791c3bAb92ad740de94E)

Video: real person, normal speed, no AI voice, max 3 minutes. X: tag [@zama](https://x.com/zama) · `#ZamaDeveloperProgram`.

---

## One line

Lantern is PoolTogether V5 with encrypted deposits, onchain FHE draws, and no-loss principal. The winner address is never published.

Tagline on the site: **Made to save · Ready to win.**

---

## What Zama asked for (hit these out loud)

| Brief | Lantern |
| --- | --- |
| Deposit into a shared pool | Save → Shield → Deposit (official cUSDT) |
| Yield paid as prizes | Draw → Sponsor public USDT; 90% wraps to encrypted prize liquidity |
| Withdraw principal anytime | Save → Withdraw some / Withdraw all (not the prize) |
| Deposits, balances, winnings encrypted | FHE handles + EIP-712 user decrypt |
| Winner selection over encrypted balances, verifiable onchain | Onchain Zama FHE ticket + claim-time PoolTogether `isWinner` |
| Only winners learn they won | Check prize / Claim. Chain never decrypts the winner |
| Production UX | Openfort email OTP, gasless passkey, three boards, How map |
| Sepolia | Official Zama USDT / cUSDT, not custom tokens |

Say **claim-time `isWinner`**. Do not say the contract walks the list and picks a name.

---

## 30 seconds (if they cut you off)

Lantern is a no-loss prize vault on the Zama Protocol. You put encrypted USDT in. Draws run onchain with FHE. Winners are chosen with Zama randomness: a public block seed mapped in FHE onto encrypted TWAB, then PoolTogether isWinner at claim. Your deposit always comes back. Who won, and how much you put in, stay hidden. This is PoolTogether V5 rebuilt on FHE, not a raffle with a privacy sticker. Live on Sepolia. Email sign-in is gasless.

---

## 3-minute video script

Record the live app (or `http://localhost:5173`). Stay on **localhost**, not `127.0.0.1`. Use **email OTP** so gas is sponsored. Have 100 USDT claimed, or do it on camera. If the 60s clock is tight, be owner and use **Force + finish**, or sponsor first and let the clock run while you talk.

Speak this. Do not read the replica table.

### 0:00–0:20 · Hook (hero)

**Show:** lantern-prize.vercel.app hero.

> This is Lantern. A confidential prize savings vault on the Zama Protocol. You deposit encrypted USDT. Draws run onchain with FHE. Winners are picked with Zama randomness over encrypted TWAB, not an offchain oracle. Principal always comes back. The chain never publishes who won, or how much you put in.

### 0:20–0:40 · Sign in

**Click:** Sign in → email OTP → Sepolia. Point at **Gasless**.

> Sign in with email. That creates a passkey wallet. Openfort pays Sepolia gas. Same key signs the Zama decrypt permit. MetaMask still works if you have test ETH.

### 0:40–1:15 · Save: faucet, authorize, shield, deposit

**Click a board → Save.** Claim 100 USDT → Authorize → Shield 10 → Deposit 10.

> Save is your money. Claim one hundred official Zama test USDT. Authorize so this page can decrypt my numbers. Other wallets still cannot. Shield wraps public USDT into confidential cUSDT. I leave some unwrapped to feed the prize. Deposit. Size stays encrypted. Shares are one to one.

**On screen:** encrypted handle becomes a number after Authorize.

### 1:15–1:50 · Draw: sponsor and run

**Click Draw.** Approve → Sponsor a few public USDT → Run draw (or Force + finish if you are owner).

> Draw is the round. Sponsor is public USDT, not vault shares. Ninety percent wraps to encrypted prize liquidity so claims stay private. Prize size stays public. Ten percent stays unwrapped to pay whoever clicks Start or Finish. Start stamps onchain entropy from the block. At claim, Zama FHE turns that seed plus your address into a ticket on the encrypted vault TWAB. You win if the ticket is under your weight times seventy-five percent grand or twenty-five percent daily. It does not walk a list and name a winner.

If you wait 60s, say that out loud. If you Force, say:

> Force is owner-only so a demo can award without waiting the sixty second period.

### 1:50–2:25 · Claim is not withdraw

**Click Save.** Check prize. If yellow **claimable**, Claim my prize. Then point at **Your deposit** and Withdraw all (or say you will leave it in).

> Two piles. Yellow is the prize. White is my deposit. Claim takes lottery winnings only. Withdraw returns the money I put in. No-loss. If I lost, Check prize shows encrypted zero. I should still claim zero so a lone claim transaction does not leak the winner.

### 2:25–2:50 · Why it is PoolTogether (scroll, do not click every row)

**Scroll** to **PoolTogether V5 / replica map**, then **Public / private**.

> This is a confidential replica of PoolTogether V5. Vault, TWAB, reserve, prize claimer, NFT hook, TWAB rewards. Randomness is Zama onchain FHE: public prevrandao seed, encrypted ticket, PoolTogether isWinner at claim. No offchain RNG. Public versus private: addresses and prize size are on the chain. Deposit sizes, odds, tickets, and winnings are not.

Optional 10s: **More → Mint duck → Attach hook.**

> Optional hook: if I would have won, the prize goes to a random Duck holder. Encrypted the whole way.

### 2:50–3:00 · Close

> Thirteen Hardhat tests. Source on GitHub. How is every button. Lantern: made to save, ready to win.

End on the hero or the GitHub tab.

---

## Do not say

- “On tape / off tape.” The heading is **Public / private**.
- “The contract picks a winner and writes the address.”
- “Withdraw your winnings” for the deposit row.
- “This is live yield from Aave.” Sponsor is a public-USDT mock. Production path is Zama’s confidential vault batcher.
- `127.0.0.1`, paymaster `pol_…` ids, or private keys.
- Jargon dump (HCU, EIP-7702) unless a judge asks. Gasless and encrypted are enough.

---

## Judge Q&A (keep these short)

**How is the winner chosen?**  
Zama onchain randomness, not an offchain oracle. `startDraw` records public entropy (`block.prevrandao` + draw id). At claim, that plus the wallet and tier is a public seed. Zama FHE maps it to a uniform ticket on the encrypted vault TWAB (`(seed × total) >> 64`). PoolTogether `isWinner`: ticket < encrypted weight × 75% grand or 25% daily. The comparison stays encrypted. `startDraw` freezes the vault TWAB in one mul+add.

**Why not auto-credit like V5?**  
The winner handle is encrypted. The user (or a claimer) must claim. Losers can claim encrypted 0.

**What is public?**  
Depositor addresses, wrap amounts, prize size, draw time, that a claim tx happened.

**What is the residual leak?**  
If only one address claims a non-zero prize, observers may infer the winner. Claim 0 to pad that.

**How does encrypted TWAB work?**  
Running vault total, frozen in `startDraw` with one mul+add. Each wallet’s weight is computed at claim. See [TWAB.md](./TWAB.md) and [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu).

**Is Liquidate different from Sponsor?**  
Same tokens. Liquidate is the PoolTogether name. Do not click both for the same amount.

**TWAB campaign?**  
Holding airdrop, not the lottery.

---

## X thread (copy, then add video + screenshots)

Post as a thread. First tweet must stand alone.

**1**  
Lantern is confidential prize savings on the @zama Protocol.

Deposit encrypted USDT. Draws run onchain with FHE. Principal always comes back. The winner address is never published.

A PoolTogether V5 replica, not a raffle with a privacy sticker.

#ZamaDeveloperProgram

https://lantern-prize.vercel.app

**2**  
Save: claim official Zama test USDT, shield, deposit. Size stays encrypted.

Draw: sponsor public USDT. 90% becomes encrypted prize liquidity. 10% pays whoever runs Start or Finish.

Claim takes the prize. Withdraw takes your deposit. Two piles.

**3**  
Winners are chosen with Zama randomness: a public block seed, an FHE ticket over encrypted TWAB, then PoolTogether isWinner at claim.

No offchain RNG. No published winner.

How every button works: https://lantern-prize.vercel.app/#guide

**4**  
Email OTP is gasless (Openfort passkey). Authorize is one EIP-712 decrypt for your wallet only.

Sepolia pool: 0x734D71C56731AFEF3c15791c3bAb92ad740de94E

Source: https://github.com/AshThunder/lantern-prize-savings

**5** (after the video is up)  
3-minute demo (real walkthrough, no AI voice): [link]

Made to save. Ready to win.

---

## X article (if you post one piece instead of a thread)

**Title:** Lantern: confidential PoolTogether on the Zama Protocol

PoolTogether is a no-loss lottery. You deposit, yield becomes prizes, you can leave with your principal. On a public chain, everyone sees how much you put in, your odds, and who won.

Lantern is that product with the Zama Protocol. Deposit sizes, shares, odds, tickets, and winnings stay encrypted. Winners are chosen with Zama onchain randomness: `startDraw` stamps `block.prevrandao`, FHE maps that seed onto the encrypted vault TWAB, and PoolTogether `isWinner` runs at claim (ticket < weight × 75% / 25%). The winner address is never decrypted onchain.

It is a replica, not a sketch. Vault deposit and withdraw, encrypted TWAB, 10% reserve for keepers, permissionless start and finish, prize claimer (`claim` / `claimTo` / `claimFor`), chance delegate, NFT prize hook, TWAB rewards campaign. Grand 75 / daily 25. Official Sepolia USDT and cUSDT.

Yield on this demo is a sponsor mock: public USDT in, 90% wrapped to confidential prize liquidity. Production would harvest from a confidential ERC-4626, yield only, never principal.

Play it: https://lantern-prize.vercel.app  
How: https://lantern-prize.vercel.app/#guide  
Code: https://github.com/AshThunder/lantern-prize-savings

#ZamaDeveloperProgram @zama

---

## Form answers

Paste into the bounty form. Replace the video and X URLs after you publish them.

| Field | Answer |
| --- | --- |
| Project name | Lantern |
| One-sentence description | Confidential PoolTogether V5 on the Zama Protocol: encrypted deposits, onchain FHE draws, no-loss principal, winner address never published. |
| Live demo | https://lantern-prize.vercel.app |
| How / button map | https://lantern-prize.vercel.app/#guide |
| GitHub | https://github.com/AshThunder/lantern-prize-savings |
| Network | Ethereum Sepolia |
| Pool | 0x734D71C56731AFEF3c15791c3bAb92ad740de94E |
| Hook | 0xCE94E26Eaf2895F32A80D8Cf455De61dC22634F8 |
| Tokens | Official Zama USDT 0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0, cUSDT 0x4E7B06D78965594eB5EF5414c357ca21E1554491 |
| Video | [add after upload] |
| X post | [add after publish] |
| How FHE is used | Encrypted shares and running vault TWAB; `startDraw` freezes the total and stamps onchain entropy; `accruePrize` / `claim` map that Zama FHE ticket onto encrypted TWAB and run `isWinner`; winnings stay encrypted until the user decrypts or claims. |
| How fairness stays public | Prize size, draw time, depositor set, and the public seed (`prevrandao` + address + tier) are onchain. The ticket, weight, and totals stay encrypted. |
| Tests | 15 Hardhat tests (`cd contracts && npx hardhat test`) |
| SDKs | `@zama-fhe/sdk@3.5.1`, `@zama-fhe/react-sdk@3.5.1`, `@fhevm/solidity@0.11.1`, `@openzeppelin/confidential-contracts@0.5.3` |

---

## Record checklist

1. Deployed site matches pool `0x734D71…`. If Vercel is still on the old raffle pool, record `localhost:5173` or ship the frontend first.
2. Email OTP works. Gasless pill shows.
3. Wallet has public USDT (or Claim 100 on camera).
4. Enough unwrapped USDT to Sponsor after Shield 10.
5. Either wait 60s or be ready to Force + finish.
6. Face or voice is you. No AI voice, no slideshow-only pitch.
7. Cursor is large. Click Save / Draw / More so they read as buttons.
8. End before 3:00. Leave the last 5 seconds silent if you overrun the close.

After publish: put the video URL and X URL back into this file and the bounty form.
