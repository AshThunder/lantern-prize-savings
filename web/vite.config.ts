import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const SIGN_NEEDLE = `if (openfortTransaction.nextAction?.type === 'sign_hash' && openfortTransaction.nextAction.hash) {
        let signature;
        // EIP-7702 delegated accounts (Calibur, CaliburV9, …) sign the raw v0.8
        // typed-data hash — no EIP-191 hashMessage prefix.
        if (account.accountType === AccountTypeEnum.DELEGATED_ACCOUNT) {
            signature = await signer.sign(openfortTransaction.nextAction.hash, false, false);
        }
        else {
            signature = await signer.sign(openfortTransaction.nextAction.hash);
        }`

const SIGN_PATCH = `const lanternSignHash = openfortTransaction.nextAction?.hash || openfortTransaction.nextAction?.payload?.signableHash || openfortTransaction.nextAction?.payload?.hash;
    if (lanternSignHash) {
        const lanternGate = globalThis.__lanternAwaitPasskey;
        if (typeof lanternGate === 'function') {
            await lanternGate();
        }
        let signature;
        if (account.accountType === AccountTypeEnum.DELEGATED_ACCOUNT) {
            signature = await signer.sign(lanternSignHash, false, false);
        }
        else {
            signature = await signer.sign(lanternSignHash);
        }`

function patchOpenfortSendCallSync(code: string) {
  if (!code.includes("nextAction?.type === 'sign_hash'")) return null
  if (!code.includes(SIGN_NEEDLE)) return null
  return code.replace(SIGN_NEEDLE, SIGN_PATCH)
}

function openfortPasskeyGatePlugin(): Plugin {
  return {
    name: 'openfort-passkey-gate',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('sendCallSync')) return
      const next = patchOpenfortSendCallSync(code)
      return next ? { code: next, map: null } : undefined
    },
  }
}

export default defineConfig({
  plugins: [react(), openfortPasskeyGatePlugin()],
  optimizeDeps: {
    rolldownOptions: {
      plugins: [
        {
          name: 'openfort-passkey-gate',
          transform(code: string, id: string) {
            if (!id.includes('sendCallSync')) return null
            return patchOpenfortSendCallSync(code)
          },
        },
      ],
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
})
