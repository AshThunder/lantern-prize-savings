import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function lanternSignPrelude(accountEnum: string, rejectCtor: string) {
  return `const __lanternPickHash = (t) => {
        const na = t?.nextAction;
        if (!na) return null;
        if (typeof na.hash === 'string' && na.hash.startsWith('0x')) return na.hash;
        const p = na.payload;
        if (typeof p === 'string' && p.startsWith('0x')) return p;
        if (p && typeof p === 'object') {
            for (const k of ['signableHash', 'hash', 'userOpHash', 'userOperationHash']) {
                const v = p[k];
                if (typeof v === 'string' && v.startsWith('0x') && v.length >= 66) return v;
            }
        }
        return null;
    };
    let lanternTx = openfortTransaction;
    let lanternSignHash = __lanternPickHash(lanternTx);
    if (!lanternSignHash && lanternTx.status === 'awaiting_signature' && lanternTx.id && backendClient?.transactionsApi?.getTransactionV2) {
        for (let lanternI = 0; lanternI < 12; lanternI++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
                const lanternAgain = await backendClient.transactionsApi.getTransactionV2({ id: lanternTx.id });
                lanternTx = lanternAgain.data;
                lanternSignHash = __lanternPickHash(lanternTx);
                if (lanternSignHash || lanternTx.receipt) break;
            }
            catch (e) { }
        }
        if (lanternTx.receipt?.error?.reason) {
            throw new ${rejectCtor}, lanternTx.receipt.error.reason);
        }
    }
    if (lanternTx.status === 'awaiting_signature' || lanternSignHash) {
        const lanternGate = globalThis.__lanternAwaitPasskey;
        if (typeof lanternGate === 'function') {
            await lanternGate();
        }
        if (!lanternSignHash) {
            throw new ${rejectCtor}, 'Openfort is awaiting a passkey signature but did not return a hash to sign.');
        }
        let signature;
        if (account.accountType === ${accountEnum}.DELEGATED_ACCOUNT) {
            signature = await signer.sign(lanternSignHash, false, false);
        }
        else {
            signature = await signer.sign(lanternSignHash);
        }`
}

function patchCreateTimeout(code: string, rejectCtor: string) {
  if (code.includes('__lanternCreateTimeout')) return code
  let next = code
  const createAt = next.indexOf('createTransactionV2({')
  if (createAt !== -1) {
    const headersAt = next.indexOf('headers:', createAt)
    const braceAt = next.lastIndexOf('{', headersAt)
    if (headersAt !== -1 && braceAt > createAt) {
      next = `${next.slice(0, braceAt + 1)}\n            timeout: 120000, // __lanternCreateTimeout${next.slice(braceAt + 1)}`
    }
  }

  const recover = `const openfortTransaction = await buildOpenfortTransactions(params, backendClient, account, authentication, policy, signedAuthorization).catch(async (error) => {
        const lanternMsg = error?.message || '';
        if (/timeout/i.test(lanternMsg) && backendClient?.transactionsApi?.listTransactionsV2 && account?.id) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
                const lanternList = await backendClient.transactionsApi.listTransactionsV2({ accountId: [account.id], limit: 5 });
                const lanternRows = lanternList.data?.data || lanternList.data || [];
                for (const lanternRow of lanternRows) {
                    if (!lanternRow?.id) continue;
                    const lanternGot = await backendClient.transactionsApi.getTransactionV2({ id: lanternRow.id });
                    const lanternFound = lanternGot.data;
                    if (lanternFound && (lanternFound.status === 'awaiting_signature' || lanternFound.nextAction)) {
                        return lanternFound;
                    }
                }
            }
            catch (e) { }
        }
        throw new ${rejectCtor}, error.message);
    });`

  return next.replace(
    /const openfortTransaction = await buildOpenfortTransactions\(params, backendClient, account, authentication, policy, signedAuthorization\)\.catch\(\(error\) => \{\s*throw new [^;]+;\s*\}\);/,
    recover,
  )
}

function patchOpenfortSendCallSync(code: string) {
  if (!code.includes('submitTransactionSignatureV2')) return null

  const accountEnum = code.includes('types.AccountTypeEnum') ? 'types.AccountTypeEnum' : 'AccountTypeEnum'
  const rejectCtor = code.includes('JsonRpcError.JsonRpcError')
    ? 'JsonRpcError.JsonRpcError(JsonRpcError.RpcErrorCode.TRANSACTION_REJECTED'
    : 'JsonRpcError(RpcErrorCode.TRANSACTION_REJECTED'

  let next = patchCreateTimeout(code, rejectCtor)
  if (next.includes('__lanternPickHash')) return next === code ? null : next

  const startMarkers = [
    'const lanternSignHash = openfortTransaction.nextAction',
    "if (openfortTransaction.nextAction?.type === 'sign_hash' && openfortTransaction.nextAction.hash)",
    'if (openfortTransaction.nextAction?.type === "sign_hash" && openfortTransaction.nextAction.hash)',
  ]
  let start = -1
  for (const marker of startMarkers) {
    const index = next.indexOf(marker)
    if (index !== -1) {
      start = index
      break
    }
  }
  if (start === -1) return next === code ? null : next

  const submitAt = next.indexOf('submitTransactionSignatureV2', start)
  const responseAt = next.lastIndexOf('const response = await', submitAt)
  if (submitAt === -1 || responseAt === -1 || responseAt < start) return next === code ? null : next

  next = `${next.slice(0, start)}${lanternSignPrelude(accountEnum, rejectCtor)}\n        ${next.slice(responseAt)}`

  next = next.replace(
    'const submitted = response.data;',
    `let submitted = response.data;
        if (!submitted.receipt && submitted.status !== 'reverted' && submitted.status !== 'failed' && backendClient?.transactionsApi?.getTransactionV2) {
            for (let lanternJ = 0; lanternJ < 15; lanternJ++) {
                await new Promise((r) => setTimeout(r, 2000));
                try {
                    const lanternPoll = await backendClient.transactionsApi.getTransactionV2({ id: openfortTransaction.id });
                    submitted = lanternPoll.data;
                    if (submitted.receipt || submitted.status === 'reverted' || submitted.status === 'failed' || submitted.status === 'succeeded') break;
                }
                catch (e) { }
            }
        }`,
  )

  next = next.replace(
    `throw new ${rejectCtor}, 'No transaction receipt received');\n    }\n    return {\n        id: openfortTransaction.id,\n        receipt: convertToTransactionReceipt(openfortTransaction),`,
    `throw new ${rejectCtor}, lanternTx.status === 'awaiting_signature' ? 'Openfort is awaiting a passkey signature but did not return a hash to sign.' : 'No transaction receipt received');\n    }\n    return {\n        id: openfortTransaction.id,\n        receipt: convertToTransactionReceipt(openfortTransaction),`,
  )

  return next
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
