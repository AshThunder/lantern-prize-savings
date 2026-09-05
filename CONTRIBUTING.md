# Contributing

## Layout

```
contracts/    FHEVM Hardhat — pool, hook, tests
web/          Vite + React — Play, How, Openfort
```

Docs: [README.md](./README.md) (design), [TWAB.md](./TWAB.md) (running vault TWAB), [PITCH.md](./PITCH.md) (video + X), [JUDGES.md](./JUDGES.md) (click path), [SECURITY.md](./SECURITY.md), [web/README.md](./web/README.md), [contracts/README.md](./contracts/README.md).

## Contracts

```bash
cd contracts
npm ci
npx hardhat test
npx hardhat compile
```

Sepolia deploy: `SEPOLIA_RPC_URL` + `PRIVATE_KEY` in `contracts/.env`, then `npx hardhat deploy --network sepolia --tags Lantern`. Afterward update `web/.env`, `web/.env.example`, and the Openfort allowlist. Do not commit keys.

Do not shrink a requested contract or UI change because of a hackathon date. Build the real thing, then note deploy follow-up.

## Web

```bash
cd web
cp .env.example .env
npm ci
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

Use `localhost`, not `127.0.0.1`. Keep Play labels plain. PoolTogether names belong in the replica map, README, and How.

**Claim** and **Withdraw** must stay separate actions and copy. Public vs private (not “tape”) is the leak table heading.

Do not put `pol_…` paymaster ids or secrets in markdown.

## Pull requests

1. Say what a judge or depositor can do after the change.
2. Include Hardhat tests for pool behavior.
3. For UI, exercise Save / Draw / More and How if those boards changed.
