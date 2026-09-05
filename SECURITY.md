# Security

Lantern is a Sepolia demo for Zama S4. Treat it as a testnet vault, not production custody.

## Report a problem

Open a private GitHub security advisory on [AshThunder/lantern-prize-savings](https://github.com/AshThunder/lantern-prize-savings), or email the maintainer listed on the repo. Do not file a public issue for a live leak of encrypted amounts or a way to drain prize liquidity.

## What stays hidden

These values are FHE handles. The chain does not publish the plaintext:

- How much you deposited
- Vault shares and share-seconds
- Per-user odds and FHE tickets
- Per-user winnings (including encrypted 0)

EIP-712 user decrypt is for the connected wallet only. Authorize does not give other visitors your numbers.

## What is public on purpose

Needed to run the protocol or to keep prize size honest:

- Depositor addresses (TWAB snapshot walks the set)
- Wrap / unwrap ERC-20 amounts
- Prize **size** this draw (grand / daily)
- Draw timestamps
- That a claim transaction occurred

Winner selection uses PoolTogether `isWinner` in FHE at claim time. `userSeed` is public (`keccak256(lastDrawEntropy, account, tier)`). Weight and TWAB total stay encrypted. The winner address is never decrypted onchain.

## Residual leak

If only one address claims a non-zero prize, observers may infer the winner. Anyone can call `claim` (including losers, encrypted 0) so a lone claim tx does not leak. The UI tells losers to claim 0 for that reason.

Vault TWAB is a running encrypted total, frozen in `startDraw` ([TWAB.md](./TWAB.md)). Zama [HCU](https://docs.zama.org/protocol/solidity-guides/development-guide/hcu) caps FHE work per transaction (5M sequential / 20M global).

## Keys and policy

Never commit:

- `PRIVATE_KEY` / `SEPOLIA_PRIVATE_KEY`
- Openfort secret / shield material beyond the public `VITE_*` publishable pair you intend to ship
- Paymaster policy ids in write-ups if they are not already in the public frontend env

The Openfort Sepolia gas policy must allowlist only the current pool, hook, official USDT / cUSDT, Duck NFT, and Wrappers Registry. Update that list after every redeploy.

MetaMask and other injected wallets pay their own ETH. Email OTP is the sponsored path.

## Not in scope (deliberate)

No adaptive canary, no TPDA Dutch liquidator, no VRF auction, no VRGDA claim fees, no real ERC-4626 yield harvest. `sponsor` is a public-USDT mock. `forceDraw` is owner-only for demos.
