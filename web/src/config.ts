export const SEPOLIA_USDT =
  (import.meta.env.VITE_USDT_ADDRESS as `0x${string}` | undefined) ??
  '0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0'

export const SEPOLIA_CUSDT =
  (import.meta.env.VITE_CUSDT_ADDRESS as `0x${string}` | undefined) ??
  '0x4E7B06D78965594eB5EF5414c357ca21E1554491'

export const POOL_ADDRESS = (import.meta.env.VITE_POOL_ADDRESS ||
  '0x734D71C56731AFEF3c15791c3bAb92ad740de94E') as `0x${string}`

export const NFT_ADDRESS = (import.meta.env.VITE_NFT_ADDRESS ||
  '0x429eB02B06B5DD98deCE25899E49a17E0b6BB035') as `0x${string}`
export const HOOK_ADDRESS = (import.meta.env.VITE_HOOK_ADDRESS ||
  '0xCE94E26Eaf2895F32A80D8Cf455De61dC22634F8') as `0x${string}`
export const FORWARDER_ADDRESS = (import.meta.env.VITE_FORWARDER_ADDRESS ||
  '0x75E360fd3e87466d7f6e95A85688D3e8F5048921') as `0x${string}`

export const WRAPPERS_REGISTRY =
  '0x2f0750Bbb0A246059d80e94c454586a7F27a128e' as const

export const RPC_URL =
  import.meta.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

export const OPENFORT_PUBLISHABLE_KEY = import.meta.env.VITE_OPENFORT_PUBLISHABLE_KEY?.trim() || ''
export const OPENFORT_SHIELD_KEY = import.meta.env.VITE_OPENFORT_SHIELD_KEY?.trim() || ''
export const OPENFORT_POLICY_ID = import.meta.env.VITE_OPENFORT_FEE_SPONSORSHIP_ID?.trim() || ''
export const openfortConfigured = Boolean(OPENFORT_PUBLISHABLE_KEY && OPENFORT_SHIELD_KEY)
export const openfortGasless = Boolean(openfortConfigured && OPENFORT_POLICY_ID)

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

export const nftAbi = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
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

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  11155111: 'Sepolia',
  84532: 'Base Sepolia',
}

export function chainLabel(chainId?: number): string {
  if (!chainId) return 'Unknown'
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}

function errorBlob(err: unknown): string {
  if (err == null) return ''
  if (typeof err !== 'object') return String(err)
  const o = err as {
    shortMessage?: string
    message?: string
    details?: string
    reason?: string
    metaMessages?: unknown
    cause?: unknown
  }
  const meta = Array.isArray(o.metaMessages) ? o.metaMessages.map(String).join(' ') : ''
  return [o.shortMessage, o.message, o.details, o.reason, meta, errorBlob(o.cause)]
    .filter(Boolean)
    .join(' ')
}

const REVERT_FN_HELP: Record<string, string> = {
  approve:
    'Approve failed. If allowance is already non-zero, MetaMask may ask twice (reset to 0, then set the new amount). Confirm both, then Sponsor.',
  sponsor:
    'Sponsor failed. It pulls public USDT, not vault shares. Claim faucet or Unshield, Approve the amount, then Sponsor.',
  liquidateYield:
    'Liquidate failed. It pulls public USDT, not vault shares. Claim faucet or Unshield, Approve, then try again.',
  createTwabCampaign:
    'Could not create the campaign. The budget is public USDT. Claim faucet or Unshield, Approve, then Create. A draw in progress also blocks this.',
  claimTwabRewards:
    'Could not claim campaign rewards. Wait until the window ends, stay in the vault during the window, and claim each campaign only once.',
  startDraw:
    'Could not start the draw. Need prize liquidity, at least one depositor, and the 60s period to elapse.',
  finalizeDraw: 'Could not finish the draw. Start it first, then Finish (or Run draw).',
  mint: 'Could not mint test USDT. This faucet is one claim per stretch — wait or use another wallet.',
}

export function explainError(err: unknown): string {
  const raw = errorBlob(err)
  if (/user rejected|denied/i.test(raw)) return 'Wallet rejected the request.'
  if (/origin.*not allowed|is not allowed|allowed origins/i.test(raw))
    return 'Openfort rejected this site origin. In dashboard.openfort.io/security add https://laternpool.xyz and https://www.laternpool.xyz (and http://localhost:5173 for local). Then use email OTP again — not MetaMask SIWE.'
  if (/Passkey approval cancelled/i.test(raw)) return 'Passkey approval was dismissed. Click Claim again, wait for Approve passkey, then click it.'
  if (
    /Transaction creation failed|No transaction receipt received|Iframe signer did not respond|NotAllowedError|passkey/i.test(
      raw,
    )
  )
    return 'Openfort prepared the transaction. When the yellow card shows Approve passkey, click it — the browser needs that fresh click after the ~30s prepare. Nothing to change in the Openfort dashboard.'
  if (/expired|sign in again/i.test(raw))
    return 'Sign in again so Openfort can sponsor gas, or pay Sepolia ETH from this wallet.'
  if (/insufficient funds|insufficient.*gas|exceeds the balance of the account/i.test(raw))
    return 'Not enough Sepolia ETH for gas. Sign in with Openfort gasless, or fund the wallet.'
  if (/gas limit too high|MAX_GAS_LIMIT|exceeds allowance \(16777216\)/i.test(raw))
    return 'Sepolia rejected the gas limit (max 16.7M). You likely need public USDT — claim faucet and leave some unshielded, or Unshield first.'
  if (/insufficient.*balance|exceeds balance|ERC20InsufficientBalance/i.test(raw))
    return 'Not enough public USDT. This step uses the faucet token, not vault shares — claim or unshield first.'
  if (/CampaignNotEnded/i.test(raw)) return 'The campaign window is still open. Wait, then Claim latest.'
  if (/AlreadyClaimed/i.test(raw)) return 'You already claimed this campaign.'
  if (/InvalidCampaign/i.test(raw)) return 'No campaign to claim yet. Create one first.'
  if (/AmountZero/i.test(raw)) return 'Enter a non-zero amount.'
  if (/DrawInProgress/i.test(raw)) return 'A draw is in progress. Wait until it finishes.'
  if (/DrawIntervalNotElapsed/i.test(raw)) return 'The draw period has not elapsed yet.'
  if (/NoPrizeLiquidity/i.test(raw)) return 'Sponsor prize liquidity before awarding a draw.'
  if (/NoDepositors/i.test(raw)) return 'The pool needs at least one depositor.'
  if (/MaxDepositors/i.test(raw)) return 'Deposit was rejected.'
  const fn = raw.match(/contract function "(\w+)" reverted/i)?.[1]
  if (fn && REVERT_FN_HELP[fn]) return REVERT_FN_HELP[fn]
  if (/allowance|not been approved/i.test(raw))
    return 'The pool cannot pull that much public USDT yet. Click Approve for the prize amount, confirm MetaMask, then Sponsor.'
  if (fn) return `${fn} failed. Check public USDT, approval, and that you are on Sepolia.`
  if (/wrong network|wrong chain|unsupported chain|chain mismatch|switch (your )?(wallet|network)/i.test(raw))
    return 'Lantern only runs on Ethereum Sepolia. Email login is moved there automatically. If this is MetaMask, approve the switch.'
  if (/unsupported token|invalid token/i.test(raw)) return 'This token is not supported by the pool.'
  const cleaned = raw.split(/Request Arguments/i)[0]?.trim() || raw
  return cleaned.slice(0, 240)
}
