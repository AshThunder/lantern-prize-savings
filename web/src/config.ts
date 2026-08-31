export const SEPOLIA_USDT =
  (import.meta.env.VITE_USDT_ADDRESS as `0x${string}` | undefined) ??
  '0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0'

export const SEPOLIA_CUSDT =
  (import.meta.env.VITE_CUSDT_ADDRESS as `0x${string}` | undefined) ??
  '0x4E7B06D78965594eB5EF5414c357ca21E1554491'

export const POOL_ADDRESS = (import.meta.env.VITE_POOL_ADDRESS || '') as `0x${string}`

export const RPC_URL =
  import.meta.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

export const DEPOSIT_DATA = '0x01' as const
export const DECIMALS = 6
export const FAUCET_AMOUNT = 100n * 10n ** BigInt(DECIMALS)
export const ZERO_HANDLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const

export const erc20Abi = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

export function formatUnits(value: bigint, decimals = DECIMALS): string {
  const n = 10n ** BigInt(decimals)
  const whole = value / n
  const frac = value % n
  if (frac === 0n) return whole.toString()
  const padded = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}.${padded}`
}

export function parseUnits(input: string, decimals = DECIMALS): bigint {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Enter an amount')
  const [w, f = ''] = trimmed.split('.')
  if (!/^\d+$/.test(w) || (f && !/^\d+$/.test(f))) throw new Error('Invalid amount')
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt(frac)
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function explainError(err: unknown): string {
  const raw =
    err && typeof err === 'object' && 'shortMessage' in err
      ? String((err as { shortMessage: string }).shortMessage)
      : err instanceof Error
        ? err.message
        : String(err)
  if (/user rejected|denied/i.test(raw)) return 'Wallet rejected the request.'
  if (/insufficient.*balance|exceeds balance/i.test(raw))
    return 'Insufficient balance. Mint from the faucet or shield more tokens.'
  if (/allowance|not been approved/i.test(raw)) return 'Missing ERC-20 approval. Approve and retry.'
  if (/network|chain|wrong chain/i.test(raw)) return 'Switch your wallet to Ethereum Sepolia.'
  if (/unsupported token|invalid token/i.test(raw)) return 'This token is not supported by the pool.'
  if (/DrawInProgress/i.test(raw)) return 'A draw is in progress. Wait until it finalizes to withdraw.'
  if (/DrawIntervalNotElapsed/i.test(raw)) return 'The draw period has not elapsed yet.'
  if (/NoPrizeLiquidity/i.test(raw)) return 'Sponsor prize liquidity before awarding a draw.'
  if (/NoDepositors/i.test(raw)) return 'The pool needs at least one depositor.'
  return raw.slice(0, 240)
}
