# Lantern web

Vite + React frontend for the confidential prize vault. Talks to Sepolia with [`@zama-fhe/sdk@3.5.1`](https://www.npmjs.com/package/@zama-fhe/sdk) and Openfort for email / passkey login.

Live: [laternpool.xyz](https://laternpool.xyz) · How: [/#guide](https://laternpool.xyz/#guide)

Design, replica map, and Sepolia addresses live in the [root README](../README.md). Judge click path: [JUDGES.md](../JUDGES.md).

## Run

```bash
cp .env.example .env   # already points at the current Sepolia pool
npm ci
npm run dev            # http://localhost:5173
```

Use **localhost**, not `127.0.0.1`. Openfort rejects the loopback IP.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite on port 5173 |
| `npm run build` | `tsc -b` then production bundle |
| `npm run preview` | Serve the build |
| `npm run lint` | Oxlint |

Vercel treats `web/` as the project root. `vercel.json` rewrites all routes to `index.html`. FHE WASM is `runtime.singleThread`, so the host does not need COOP/COEP headers.

## Env

Copy [`.env.example`](./.env.example). Defaults match the current Sepolia deploy.

| Variable | Role |
| --- | --- |
| `VITE_POOL_ADDRESS` | `ConfidentialPrizePool` |
| `VITE_USDT_ADDRESS` / `VITE_CUSDT_ADDRESS` | Official Zama mocks |
| `VITE_NFT_ADDRESS` / `VITE_HOOK_ADDRESS` | Duck NFT + prize hook |
| `VITE_RPC_URL` | Sepolia RPC |
| `VITE_OPENFORT_PUBLISHABLE_KEY` | Openfort app |
| `VITE_OPENFORT_SHIELD_KEY` | Openfort encryption |
| `VITE_OPENFORT_FEE_SPONSORSHIP_ID` | Paymaster policy (`pol_…`) |

Leave the Openfort keys blank to run with an injected wallet only. That wallet needs Sepolia ETH. Email OTP is the gasless path.

After a pool redeploy, update `VITE_POOL_ADDRESS` (and hook if it changed) here, in Vercel env, and on the Openfort Sepolia allowlist. Do not commit `.env`.

## Boards

Play is three stamp buttons under **Click a board**:

| Board | What you do |
| --- | --- |
| **Save** | Faucet, shield, deposit, claim a prize, withdraw your deposit |
| **Draw** | Feed public USDT, run or finish the 60s draw |
| **More** | Unshield, claim-for, delegate, NFT hook, TWAB campaign |

**Claim** takes lottery winnings. **Withdraw** returns the money you deposited. They are different encrypted piles.

Hero **Public vs private** jumps to what the chain can see vs what stays hidden.

## Auth and gas

- Email OTP creates a passkey EOA. The Openfort paymaster can cover Sepolia gas for pool writes and shield / deposit.
- MetaMask is optional SIWE. It still needs Sepolia ETH.
- Authorize is one EIP-712 signature so this page can decrypt your cUSDT, shares, and winnings. Other wallets still cannot.
