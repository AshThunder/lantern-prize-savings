import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useConfidentialBalance,
  useConfidentialTokenAddress,
  useConfidentialTransferAndCall,
  useDecryptValues,
  useEncrypt,
  useGrantPermit,
  useHasPermit,
  useIsConfidentialTokenValid,
  useShield,
  useUnshieldAll,
  useWrappersRegistryAddress,
} from '@zama-fhe/react-sdk'
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { injected } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { isAddress, type Hex } from 'viem'
import { poolAbi } from './poolAbi'
import {
  DEPOSIT_DATA,
  FAUCET_AMOUNT,
  HOOK_ADDRESS,
  NFT_ADDRESS,
  POOL_ADDRESS,
  SEPOLIA_CUSDT,
  SEPOLIA_USDT,
  WRAPPERS_REGISTRY,
  ZERO_HANDLE,
  erc20Abi,
  explainError,
  formatUnits,
  nftAbi,
  chainLabel,
  openfortConfigured,
  openfortGasless,
  parseUnits,
  shortAddr,
} from './config'
import { OpenfortWalletChip, SignInButton, SignOutButton } from './OpenfortAuth'
import { TxDock, WalletChip } from './WalletPanel'
import { cancelPasskeyGate, confirmPasskeyGate, subscribePasskeyGate } from './openfortPasskeyGate'
import { useSponsoredWrite } from './useSponsoredWrite'
import { Guide } from './Guide'

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

function Val({ children }: { children: ReactNode }) {
  return <b className="val">{children}</b>
}

function DashStat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  const showUnit = unit && value !== '-'
  return (
    <div className="dash-stat">
      <span>{label}</span>
      <strong>
        {value}
        {showUnit ? <small>{unit}</small> : null}
      </strong>
    </div>
  )
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

function secsLeft(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  return formatClock(s)
}

function ticketLine(args: {
  connected: boolean
  inVault: boolean
  drawing: boolean
  lastActionAt?: bigint | number
  minHold?: bigint | number
  drawStartedAt?: bigint | number
  nowSec: number
}) {
  if (!args.connected) return 'sign in'
  if (!args.inVault) return 'not in vault'
  const hold = Number(args.minHold ?? 0)
  const last = Number(args.lastActionAt ?? 0)
  const started = Number(args.drawStartedAt ?? 0)
  if (args.drawing && hold > 0 && last + hold > started) return '0 tickets this draw'
  if (hold > 0 && last > 0) {
    const left = last + hold - args.nowSec
    if (left > 0) return `eligible in ${secsLeft(left)}`
  }
  return args.drawing ? 'in this draw' : 'eligible next draw'
}

function NetworkSwitcher({
  wrong,
  switching,
  onSwitch,
}: {
  wrong: boolean
  switching: boolean
  onSwitch: () => void
}) {
  if (!wrong) return <span className="pill chain-ok">Sepolia</span>
  return (
    <button type="button" className="btn yellow chain-switch" disabled={switching} onClick={onSwitch}>
      {switching ? 'Switching to Sepolia…' : 'Use Sepolia'}
    </button>
  )
}

function PrizeTag({ tag }: { tag?: string }) {
  if (!tag) return null
  return <span className={`prize-tag${tag === 'claimable' ? ' hot' : ''}`}>{tag}</span>
}

function ActionRow({
  title,
  mark,
  does,
  extra,
  active,
  done,
  children,
}: {
  title: string
  mark?: string
  does: string
  extra?: ReactNode
  active?: boolean
  done?: boolean
  children: ReactNode
}) {
  return (
    <div className={`action${active ? ' now' : ''}${done ? ' done' : ''}`}>
      <div className="action-copy">
        <h3>
          {title}
          {mark ? <span className="action-mark">{mark}</span> : null}
        </h3>
        <p>{does}</p>
        {extra}
      </div>
      <div className="action-go">{children}</div>
    </div>
  )
}

function useLocationHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return hash
}

export default function App() {
  const hash = useLocationHash()
  const onGuide = hash === '#guide' || hash.startsWith('#guide-')
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: connecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const wrongNetwork = isConnected && chainId !== sepolia.id

  async function goSepolia() {
    try {
      await switchChainAsync({ chainId: sepolia.id })
    } catch (err) {
      setError(explainError(err))
    }
  }

  const poolReady = Boolean(POOL_ADDRESS)

  const [amount, setAmount] = useState('10')
  const [shieldAmount, setShieldAmount] = useState('10')
  const [prizeAmount, setPrizeAmount] = useState('5')
  const [delegateTo, setDelegateTo] = useState('')
  const [claimTarget, setClaimTarget] = useState('')
  const [prizeTo, setPrizeTo] = useState('')
  const [twabBudget, setTwabBudget] = useState('10')
  const [twabDuration, setTwabDuration] = useState('120')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [txPhase, setTxPhase] = useState<'idle' | 'working' | 'confirming' | 'done' | 'error'>('idle')
  const [passkeyReady, setPasskeyReady] = useState(false)
  const [board, setBoard] = useState<'save' | 'draw' | 'more'>('save')
  const [drawBusy, setDrawBusy] = useState(false)

  const publicClient = usePublicClient()
  const { write, faucet, isPending: writing } = useSponsoredWrite()

  function connectWallet() {
    connect({ connector: injected() })
  }

  function disconnectWallet() {
    disconnect()
  }
  const queryClient = useQueryClient()
  const {
    isLoading: waiting,
    isSuccess: mined,
    isError: txFailed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    timeout: 180_000,
    pollingInterval: 4_000,
  })
  const encrypt = useEncrypt()
  const shield = useShield({ address: SEPOLIA_CUSDT })
  const unshieldAll = useUnshieldAll(SEPOLIA_CUSDT)
  const registryAddress = useWrappersRegistryAddress()
  const { data: registryPair } = useConfidentialTokenAddress({ tokenAddress: SEPOLIA_USDT })
  const { data: cUsdtValid } = useIsConfidentialTokenValid({
    confidentialTokenAddress: SEPOLIA_CUSDT,
  })
  const depositCall = useConfidentialTransferAndCall({ address: SEPOLIA_CUSDT })
  const grantPermit = useGrantPermit()

  const contracts = useMemo(
    () => (poolReady ? [POOL_ADDRESS, SEPOLIA_CUSDT] : [SEPOLIA_CUSDT]),
    [poolReady],
  )
  const { data: hasPermit } = useHasPermit({ contractAddresses: contracts })

  const { data: usdtBal, refetch: refetchUsdt } = useReadContract({
    address: SEPOLIA_USDT,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  })
  const { data: allowance, refetch: refetchAllow } = useReadContract({
    address: SEPOLIA_USDT,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && poolReady ? [address, POOL_ADDRESS] : undefined,
    query: { enabled: !!address && poolReady, refetchInterval: 8000 },
  })
  const { data: cUsdtBal, refetch: refetchCusdt } = useConfidentialBalance({
    address: SEPOLIA_CUSDT,
    account: address,
  })

  const poolReads = {
    address: POOL_ADDRESS,
    abi: poolAbi,
    query: { enabled: poolReady, refetchInterval: 8000 },
  } as const

  const { data: lastDrawClose } = useReadContract({
    ...poolReads,
    functionName: 'lastDrawClose',
    query: { enabled: poolReady, refetchInterval: 2000 },
  })
  const { data: prizeLiq, refetch: refetchPool } = useReadContract({
    ...poolReads,
    functionName: 'prizeLiquidity',
  })
  const { data: reserve } = useReadContract({ ...poolReads, functionName: 'reserve' })
  const { data: keeperReward } = useReadContract({ ...poolReads, functionName: 'keeperReward' })
  const { data: drawPhase } = useReadContract({
    ...poolReads,
    functionName: 'getDrawPhase',
    query: { enabled: poolReady, refetchInterval: 4000 },
  })
  const { data: drawing } = useReadContract({
    ...poolReads,
    functionName: 'drawing',
    query: { enabled: poolReady, refetchInterval: 4000 },
  })
  const { data: canStart } = useReadContract({
    ...poolReads,
    functionName: 'canStartDraw',
    query: { enabled: poolReady, refetchInterval: 4000 },
  })
  const { data: remaining } = useReadContract({
    ...poolReads,
    functionName: 'remainingScan',
    query: { enabled: poolReady && Boolean(drawing), refetchInterval: 2000 },
  })
  const { data: depositorCount } = useReadContract({ ...poolReads, functionName: 'depositorCount' })
  const { data: openDraw } = useReadContract({ ...poolReads, functionName: 'getOpenDrawId' })
  const { data: lastDraw } = useReadContract({ ...poolReads, functionName: 'getLastAwardedDrawId' })
  const { data: prizeSettled } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'prizeSettled',
    args: address && lastDraw ? [lastDraw, address] : undefined,
    query: { enabled: poolReady && !!address && Boolean(lastDraw), refetchInterval: 4000 },
  })
  const { data: lastPrize } = useReadContract({ ...poolReads, functionName: 'lastDrawPrize' })
  const { data: grandPrize } = useReadContract({ ...poolReads, functionName: 'lastGrandPrize' })
  const { data: dailyPrize } = useReadContract({ ...poolReads, functionName: 'lastDailyPrize' })
  const { data: period } = useReadContract({ ...poolReads, functionName: 'drawPeriodSeconds' })
  const { data: minHold } = useReadContract({ ...poolReads, functionName: 'minHoldSeconds' })
  const { data: drawStartedAt } = useReadContract({
    ...poolReads,
    functionName: 'drawStartedAt',
    query: { enabled: poolReady, refetchInterval: 4000 },
  })
  const { data: lastActionAt } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'lastActionAt',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address, refetchInterval: 4000 },
  })
  const { data: twabHandle, refetch: refetchTwabHandle } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'confidentialTwabOf',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address, refetchInterval: 8000 },
  })
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [])
  const waitLeft =
    lastDrawClose !== undefined && period !== undefined
      ? Math.max(0, Number(lastDrawClose) + Number(period) - nowSec)
      : undefined
  const waitFrac =
    period && period > 0n && waitLeft !== undefined
      ? Math.min(1, Math.max(0, 1 - waitLeft / Number(period)))
      : 0
  const scanLeft = remaining !== undefined ? Number(remaining) : 0
  const scanPeople = depositorCount !== undefined ? Number(depositorCount) : 0
  const scanWork = scanPeople
  const scanFrac = drawing && scanWork > 0 ? Math.min(1, Math.max(0, 1 - scanLeft / scanWork)) : 0
  const { data: owner } = useReadContract({ ...poolReads, functionName: 'owner' })
  const { data: shareHandle, refetch: refetchShareHandle } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address, refetchInterval: 8000 },
  })
  const { data: winHandle, refetch: refetchWinHandle } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'confidentialWinningsOf',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address, refetchInterval: 8000 },
  })
  const { data: chanceOf } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'delegateOf',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address },
  })
  const { data: hooks } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'getHooks',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address },
  })
  const { data: twabCampaigns } = useReadContract({
    ...poolReads,
    functionName: 'twabCampaignCount',
    query: { enabled: poolReady, refetchInterval: 4000 },
  })
  const twabId = twabCampaigns && twabCampaigns > 0n ? twabCampaigns : undefined
  const { data: twabEndsAt } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'twabEnd',
    args: twabId !== undefined ? [twabId] : undefined,
    query: { enabled: poolReady && twabId !== undefined, refetchInterval: 2000 },
  })
  const { data: twabBudgetOnchain } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'twabBudget',
    args: twabId !== undefined ? [twabId] : undefined,
    query: { enabled: poolReady && twabId !== undefined },
  })
  const { data: twabClaimed } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'twabClaimed',
    args: address && twabId !== undefined ? [twabId, address] : undefined,
    query: { enabled: poolReady && !!address && twabId !== undefined, refetchInterval: 4000 },
  })
  const { data: nftBal } = useReadContract({
    address: NFT_ADDRESS,
    abi: nftAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(NFT_ADDRESS) && !!address, refetchInterval: 8000 },
  })
  const { data: nftSupply } = useReadContract({
    address: NFT_ADDRESS,
    abi: nftAbi,
    functionName: 'totalSupply',
    query: { enabled: Boolean(NFT_ADDRESS) },
  })

  const decryptInputs = useMemo(() => {
    const items: { encryptedValue: string; contractAddress: `0x${string}` }[] = []
    if (poolReady && shareHandle && shareHandle !== ZERO_HANDLE) {
      items.push({ encryptedValue: shareHandle, contractAddress: POOL_ADDRESS })
    }
    if (poolReady && winHandle && winHandle !== ZERO_HANDLE) {
      items.push({ encryptedValue: winHandle, contractAddress: POOL_ADDRESS })
    }
    if (poolReady && twabHandle && twabHandle !== ZERO_HANDLE) {
      items.push({ encryptedValue: twabHandle, contractAddress: POOL_ADDRESS })
    }
    return items
  }, [shareHandle, winHandle, twabHandle, poolReady])

  const { data: decrypted, refetch: refetchDecrypt } = useDecryptValues(decryptInputs, {
    enabled: !!hasPermit && decryptInputs.length > 0,
  })

  const shares =
    shareHandle && decrypted ? (decrypted[shareHandle] as bigint | undefined) : undefined
  const winnings =
    winHandle && decrypted ? (decrypted[winHandle] as bigint | undefined) : undefined
  const shareSeconds =
    twabHandle && decrypted ? (decrypted[twabHandle] as bigint | undefined) : undefined

  useEffect(() => {
    if (mined && txHash && txPhase === 'confirming') {
      setTxPhase('done')
      setStatus((s) => (s ? `${s} confirmed` : 'Confirmed'))
    }
  }, [mined, txHash, txPhase])

  useEffect(() => {
    if (!txFailed || !receiptError) return
    setTxPhase('error')
    setError(explainError(receiptError))
  }, [txFailed, receiptError])

  useEffect(() => subscribePasskeyGate(setPasskeyReady), [])

  useEffect(() => {
    if (txPhase !== 'done') return
    const id = window.setTimeout(() => {
      setTxPhase('idle')
      setStatus('')
    }, 10_000)
    return () => window.clearTimeout(id)
  }, [txPhase])

  useEffect(() => {
    if (!mined || !txHash) return
    const refresh = () => {
      void queryClient.invalidateQueries()
      void refetchUsdt()
      void refetchAllow()
      void refetchCusdt()
      void refetchPool()
      void refetchShareHandle()
      void refetchWinHandle()
      void refetchTwabHandle()
      void refetchDecrypt()
    }
    refresh()
    // FHE handles often land a beat after the receipt.
    const again = window.setTimeout(refresh, 2500)
    return () => window.clearTimeout(again)
  }, [
    mined,
    txHash,
    queryClient,
    refetchUsdt,
    refetchAllow,
    refetchCusdt,
    refetchPool,
    refetchShareHandle,
    refetchWinHandle,
    refetchTwabHandle,
    refetchDecrypt,
  ])

  useEffect(() => {
    const id = window.setInterval(() => {
      void refetchCusdt()
      void refetchDecrypt()
    }, 8000)
    return () => window.clearInterval(id)
  }, [refetchCusdt, refetchDecrypt])

  function requirePublicUsdt(need: bigint, action: string, have = usdtBal ?? 0n) {
    if (need === 0n) throw new Error(`Enter a ${action} amount.`)
    if (have < need) {
      throw new Error(
        `${action} needs ${formatUnits(need)} public USDT. This wallet has ${formatUnits(have)}. Vault shares and cUSDT do not count. Claim faucet or Unshield, then ${action}.`,
      )
    }
  }

  function requireAllowance(need: bigint, action: string, have = allowance ?? 0n) {
    if (have < need) {
      throw new Error(
        `${action} needs the pool approved for ${formatUnits(need)} public USDT. Current allowance is ${formatUnits(have)}. Click Approve, confirm MetaMask, then ${action}.`,
      )
    }
  }

  async function approvePoolUsdt(need: bigint): Promise<Hex | void> {
    const [{ data: haveBal }, { data: haveAllow }] = await Promise.all([refetchUsdt(), refetchAllow()])
    const have = haveBal ?? usdtBal ?? 0n
    const current = haveAllow ?? allowance ?? 0n
    requirePublicUsdt(need, 'Approve', have)
    if (current >= need) {
      setStatus(`Already approved ${formatUnits(current)}. Click Sponsor.`)
      return
    }
    // Official Zama token is Tether USD (Mock). It reverts unless you zero first.
    if (current > 0n) {
      setStatus('USDT reset — confirm 0 in MetaMask, then the real amount')
      const reset = await write({
        address: SEPOLIA_USDT,
        abi: erc20Abi,
        functionName: 'approve',
        args: [POOL_ADDRESS, 0n],
      })
      await waitReceipt(reset)
    }
    setStatus('Approve USDT')
    return write({
      address: SEPOLIA_USDT,
      abi: erc20Abi,
      functionName: 'approve',
      args: [POOL_ADDRESS, need],
    })
  }

  async function run(label: string, fn: () => Promise<`0x${string}` | void>) {
    setError('')
    setTxHash(undefined)
    setTxPhase('working')
    setStatus(label)
    try {
      const hash = await fn()
      if (hash) {
        setTxHash(hash)
        setTxPhase('confirming')
      } else {
        setTxPhase('done')
        setStatus(`${label} done`)
      }
    } catch (e) {
      cancelPasskeyGate()
      setPasskeyReady(false)
      setError(explainError(e))
      setTxPhase('error')
      setStatus('')
    }
  }

  async function waitReceipt(hash: Hex) {
    if (!publicClient) throw new Error('RPC not ready')
    setTxHash(hash)
    setTxPhase('confirming')
    await publicClient.waitForTransactionReceipt({ hash })
  }

  async function scanLeftOnchain(): Promise<bigint> {
    if (!publicClient) throw new Error('RPC not ready')
    return publicClient.readContract({
      address: POOL_ADDRESS,
      abi: poolAbi,
      functionName: 'remainingScan',
    })
  }

  async function finishOpenDraw(): Promise<Hex> {
    let last: Hex | undefined
    for (let i = 0; i < 16; i++) {
      const left = await scanLeftOnchain()
      if (left === 0n) break
      setStatus(`Snapshot TWAB · ${left.toString()} left`)
      last = await write({
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: 'stepDraw',
        args: [8],
      })
      await waitReceipt(last)
      setTxHash(last)
    }
    if ((await scanLeftOnchain()) !== 0n) throw new Error('Draw snapshot did not finish.')
    setStatus('Finish draw')
    last = await write({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'finalizeDraw' })
    await waitReceipt(last)
    if (address) {
      setStatus('Check prize')
      last = await write({
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: 'accruePrize',
        args: [address],
      })
      await waitReceipt(last)
    }
    return last
  }

  async function runOpenDraw(force: boolean): Promise<Hex> {
    setStatus(force ? 'Force draw' : 'Start draw')
    const startHash = await write({
      address: POOL_ADDRESS,
      abi: poolAbi,
      functionName: force ? 'forceDraw' : 'startDraw',
    })
    await waitReceipt(startHash)
    setTxHash(startHash)
    const snap = await write({
      address: POOL_ADDRESS,
      abi: poolAbi,
      functionName: 'snapshotPrizeRecipients',
    })
    await waitReceipt(snap)
    return finishOpenDraw()
  }

  async function runDrawJob(label: string, fn: () => Promise<Hex>) {
    setDrawBusy(true)
    try {
      await run(label, fn)
    } finally {
      setDrawBusy(false)
    }
  }

  const busy =
    wrongNetwork ||
    drawBusy ||
    writing ||
    waiting ||
    encrypt.isPending ||
    shield.isPending ||
    unshieldAll.isPending ||
    depositCall.isPending

  const hasUsdt = Boolean(usdtBal && usdtBal > 0n)
  const hasCusdt = Boolean(cUsdtBal && cUsdtBal > 0n)
  const inVault = Boolean(
    (shares && shares > 0n) || (!hasPermit && shareHandle && shareHandle !== ZERO_HANDLE),
  )
  const hookOn = Boolean(hooks?.useBeforeClaimPrize)
  const winAmt = winnings ?? 0n
  const prizeTag =
    !hasPermit
      ? undefined
      : winAmt > 0n
        ? 'claimable'
        : lastDraw && lastDraw > 0n
          ? prizeSettled
            ? 'nothing to claim'
            : 'check prize'
          : 'no draw yet'
  const tickets = ticketLine({
    connected: isConnected,
    inVault,
    drawing: Boolean(drawing),
    lastActionAt,
    minHold,
    drawStartedAt,
    nowSec,
  })
  const holdLeft =
    lastActionAt !== undefined && minHold !== undefined
      ? Math.max(0, Number(lastActionAt) + Number(minHold) - nowSec)
      : 0
  const twabCampaignLine = (() => {
    if (!twabId) return 'none'
    if (twabClaimed) return `#${twabId.toString()} claimed`
    if (twabEndsAt === undefined) return `#${twabId.toString()}`
    const left = Number(twabEndsAt) - nowSec
    if (left > 0) {
      const pot = twabBudgetOnchain !== undefined ? `${formatUnits(BigInt(twabBudgetOnchain))} USDT · ` : ''
      return `#${twabId.toString()} ends in ${secsLeft(left)} · ${pot}hold to earn`
    }
    return `#${twabId.toString()} ended · claim`
  })()
  const twabClaimReady = Boolean(
    twabId && twabEndsAt !== undefined && nowSec >= Number(twabEndsAt) && !twabClaimed,
  )
  const beat: 'signin' | 'reveal' | 'claim' | 'shield' | 'deposit' | 'parked' = !isConnected
    ? 'signin'
    : !hasPermit
      ? 'reveal'
      : !hasUsdt && !hasCusdt && !inVault
        ? 'claim'
        : hasUsdt
          ? 'shield'
          : !inVault
            ? 'deposit'
            : 'parked'

  const tape =
    '★ Encrypted shares ★ Onchain FHE draw ★ No-loss principal ★ EIP-712 decrypt ★ Grand 75 / daily 25 ★ Zama Protocol ★ Open source ★ '

  const phaseName =
    drawPhase === undefined ? '-' : (['Open', 'Closed', 'Awarded', 'Finalized'][Number(drawPhase)] ?? '-')

  useEffect(() => {
    if (!onGuide) return
    if (hash === '#guide') {
      window.scrollTo(0, 0)
      return
    }
    document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [onGuide, hash])

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <header className="nav">
        <a className="nav-brand-link" href="#play">
          <div className="nav-brand">
            <span>Ln</span>
            Lantern
          </div>
        </a>
        <div className="nav-meta">
          <a className="keep" href="#play">
            Play
          </a>
          <a className="keep" href="#guide">
            How
          </a>
          <a href="#pt-map">PT replica</a>
          <a href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`} target="_blank" rel="noreferrer">
            Pool
          </a>
          <a href="https://github.com/AshThunder/lantern-prize-savings" target="_blank" rel="noreferrer">
            GitHub
          </a>
          {openfortGasless && <span className="pill">Gasless</span>}
          {!isConnected ? (
            openfortConfigured ? (
              <SignInButton className="btn cta">Sign in</SignInButton>
            ) : (
              <button className="btn cta" onClick={connectWallet} disabled={connecting}>
                Connect
              </button>
            )
          ) : (
            <>
              <NetworkSwitcher
                wrong={wrongNetwork}
                switching={switching}
                onSwitch={() => void goSepolia()}
              />
              {openfortConfigured ? (
                <OpenfortWalletChip address={address!} />
              ) : (
                <WalletChip address={address!} />
              )}
              {openfortConfigured ? (
                <SignOutButton className="btn ghost">Disconnect</SignOutButton>
              ) : (
                <button className="btn ghost" onClick={disconnectWallet}>
                  Disconnect
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {wrongNetwork && (
        <div className="banner warn">
          {switching
            ? 'Moving this wallet to Ethereum Sepolia…'
            : `This wallet is on ${chainLabel(chainId)}. Email login is switched automatically. If a popup appears, approve Sepolia.`}{' '}
          {!switching && (
            <button className="link" onClick={() => void goSepolia()}>
              Retry Sepolia
            </button>
          )}
        </div>
      )}
      {!poolReady && (
        <div className="banner">
          Pool address is not set. Deploy ConfidentialPrizePool and set <code>VITE_POOL_ADDRESS</code>.
        </div>
      )}

      {onGuide ? (
        <Guide />
      ) : (
        <>
      <section className="hero">
        <p className="hero-kicker">Zama Protocol on Sepolia</p>
        <h1 className="display">Lantern</h1>
        <p className="tagline">Made to save · Ready to win</p>
        <p className="lede">
          Put encrypted USDT in a no-loss vault. Draws run onchain with FHE. Principal always comes back.
        </p>
        <div className="hero-actions">
          {!isConnected ? (
            openfortConfigured ? (
              <SignInButton className="btn cta">Sign in</SignInButton>
            ) : (
              <button className="btn cta" onClick={connectWallet} disabled={connecting}>
                Connect wallet
              </button>
            )
          ) : (
            <a className="btn cta" href="#play">
              Play the vault
            </a>
          )}
          <a className="btn yellow" href="#guide">
            How it works
          </a>
          <a className="btn" href="#leak">
            Public vs private
          </a>
        </div>
      </section>

      <div className="ticker-wrap">
        <div className="ticker">
          <span>
            {tape}
            {tape}
          </span>
        </div>
      </div>

      <div className="dots">
        <div className="section-head" id="play">
          <h2>
            Play the <em>vault</em>
          </h2>
          <p>Four moves. Save, wait, maybe win, leave with the same principal.</p>
        </div>

        <ol className="play-story">
          <li className={beat === 'signin' || beat === 'reveal' || beat === 'claim' || beat === 'shield' || beat === 'deposit' ? 'on' : ''}>
            <strong>Save</strong>
            <span>Claim test USDT, shield it, deposit.</span>
          </li>
          <li>
            <strong>Wait</strong>
            <span>A draw runs about every 60 seconds.</span>
          </li>
          <li>
            <strong>Win</strong>
            <span>If you won, claim. The winner is never published.</span>
          </li>
          <li>
            <strong>Leave</strong>
            <span>Take your deposit anytime. That is your money, not the prize.</span>
          </li>
        </ol>

        <div className="grid">
          <aside className="polaroid">
            <h3>Your position</h3>
            <dl>
              <div>
                <dt>USDT (public)</dt>
                <dd>{usdtBal !== undefined ? formatUnits(usdtBal) : '-'}</dd>
              </div>
              <div>
                <dt>cUSDT (encrypted)</dt>
                <dd>{cUsdtBal !== undefined ? formatUnits(cUsdtBal) : hasPermit ? '0' : 'hidden'}</dd>
              </div>
              <div>
                <dt>Vault shares</dt>
                <dd>{shares !== undefined ? formatUnits(shares) : 'encrypted'}</dd>
              </div>
              <div>
                <dt>Share-seconds</dt>
                <dd>{shareSeconds !== undefined ? formatUnits(shareSeconds) : hasPermit ? '0' : 'encrypted'}</dd>
              </div>
              <div>
                <dt>Winnings</dt>
                <dd>
                  {winnings !== undefined ? formatUnits(winnings) : hasPermit ? '0' : 'encrypted'}
                  <PrizeTag tag={prizeTag} />
                </dd>
              </div>
              <div>
                <dt>This draw</dt>
                <dd className="soft">{tickets}</dd>
              </div>
              <div>
                <dt>Prize lands</dt>
                <dd className="soft">{hookOn ? 'Duck holder, not you' : 'this wallet'}</dd>
              </div>
              <div>
                <dt>Chance delegated to</dt>
                <dd>{chanceOf ? shortAddr(chanceOf) : 'self'}</dd>
              </div>
              <div>
                <dt>TWAB campaign</dt>
                <dd className="soft">{twabCampaignLine}</dd>
              </div>
            </dl>
            {hookOn && (
              <p className="polaroid-warn">Hook on. If your tickets win, the prize goes to a random Duck holder.</p>
            )}
            <p className="hint">
              Registry <Val>{shortAddr(registryAddress ?? WRAPPERS_REGISTRY)}</Val> · pair{' '}
              <Val>
                {registryPair?.[0] &&
                registryPair[1].toLowerCase() === SEPOLIA_CUSDT.toLowerCase() &&
                cUsdtValid
                  ? 'verified'
                  : cUsdtValid === false
                    ? 'not valid'
                    : 'checking…'}
              </Val>
            </p>
          </aside>

          <div className="tricks">
            <div className="board-switch-wrap">
              <p className="board-switch-hint">Click a board</p>
              <div className="board-switch" role="tablist" aria-label="Vault boards">
                <button
                  type="button"
                  role="tab"
                  className={board === 'save' ? 'on' : ''}
                  aria-selected={board === 'save'}
                  onClick={() => setBoard('save')}
                >
                  Save
                </button>
                <button
                  type="button"
                  role="tab"
                  className={board === 'draw' ? 'on' : ''}
                  aria-selected={board === 'draw'}
                  onClick={() => setBoard('draw')}
                >
                  Draw
                </button>
                <button
                  type="button"
                  role="tab"
                  className={board === 'more' ? 'on' : ''}
                  aria-selected={board === 'more'}
                  onClick={() => setBoard('more')}
                >
                  More
                </button>
              </div>
            </div>

            {board === 'save' && (
              <div className="board">
                <p className="now-line">
                  {beat === 'signin' && 'Next: sign in so we know which wallet to mint to.'}
                  {beat === 'reveal' && 'Next: show balances. One signature, then this page can read your encrypted numbers.'}
                  {beat === 'claim' && 'Next: claim 100 test USDT. You sign one transaction in your wallet.'}
                  {beat === 'shield' && 'Next: shield the amount you want in the vault. Leave public USDT unwrapped if you will feed the prize.'}
                  {beat === 'deposit' && 'Next: deposit. Pick an amount. Size stays encrypted. You can cash out later.'}
                  {beat === 'parked' &&
                    (winAmt > 0n
                      ? 'You have claimable winnings. Claim on this tab.'
                      : lastDraw && lastDraw > 0n && !prizeSettled
                        ? 'A draw was awarded. Check prize — encrypted 0 if you lost.'
                      : holdLeft > 0
                        ? `You are in the vault. Tickets start in ${secsLeft(holdLeft)}.`
                        : 'You are in the vault. Wait for a draw, claim if you won, or leave anytime.')}
                </p>

                <ActionRow
                  title="Sign in"
                  does="Use email OTP for the gasless passkey wallet. MetaMask is optional SIWE — unlock the extension and approve the prompt. If it fails, stay on email."
                  active={beat === 'signin'}
                  done={isConnected}
                >
                  {!isConnected ? (
                    openfortConfigured ? (
                      <SignInButton className="btn cta">Sign in</SignInButton>
                    ) : (
                      <button className="btn cta" onClick={connectWallet} disabled={connecting}>
                        Connect
                      </button>
                    )
                  ) : (
                    <span className="done-mark">Connected</span>
                  )}
                </ActionRow>

                <ActionRow
                  title="Show balances"
                  does="Authorize EIP-712 decryption so cUSDT, shares, winnings, and share-seconds can appear here."
                  active={beat === 'reveal'}
                  done={Boolean(hasPermit)}
                >
                  <button
                    className="btn ink"
                    disabled={!isConnected || grantPermit.isPending || Boolean(hasPermit)}
                    onClick={() =>
                      run('Authorize decryption', async () => {
                        await grantPermit.mutateAsync(contracts)
                      })
                    }
                  >
                    {hasPermit ? 'Authorized' : 'Authorize'}
                  </button>
                </ActionRow>

                <ActionRow
                  title="Claim test USDT"
                  does="Mints 100 public USDTMock to you. Official Zama faucet. Email login: wait ~30s, then click Approve passkey on the yellow card."
                  active={beat === 'claim'}
                  done={hasUsdt || hasCusdt || inVault}
                >
                  <button
                    className="btn yellow"
                    disabled={!isConnected || busy}
                    onClick={() =>
                      run('Claim test USDT', () =>
                        faucet(address!, () =>
                          write({
                            address: SEPOLIA_USDT,
                            abi: erc20Abi,
                            functionName: 'mint',
                            args: [address!, FAUCET_AMOUNT],
                          }),
                        ),
                      )
                    }
                  >
                    Claim 100 USDT
                  </button>
                </ActionRow>

                <ActionRow
                  title="Shield"
                  does="Wraps the public USDT you enter into confidential cUSDT. Deposit uses cUSDT. Leave some unwrapped to feed the prize."
                  active={beat === 'shield'}
                  done={hasCusdt || inVault}
                >
                  <Field label="Amount (public USDT)" value={shieldAmount} onChange={setShieldAmount} placeholder="10" />
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !usdtBal}
                    onClick={() =>
                      run('Shield', async () => {
                        const need = parseUnits(shieldAmount)
                        const have = usdtBal ?? 0n
                        if (need === 0n) throw new Error('Enter an amount to shield.')
                        if (have < need) {
                          throw new Error(
                            `Shield uses public USDT (${formatUnits(have)} on hand, ${formatUnits(need)} needed). Claim test USDT first.`,
                          )
                        }
                        const { txHash: hash } = await shield.mutateAsync({ amount: need })
                        return hash
                      })
                    }
                  >
                    Shield
                  </button>
                </ActionRow>

                <ActionRow
                  title="Deposit"
                  does="Sends cUSDT into the vault. Amount stays encrypted. Shares are 1:1 with the deposit."
                  active={beat === 'deposit'}
                  done={inVault}
                >
                  <Field label="Amount (cUSDT)" value={amount} onChange={setAmount} placeholder="10" />
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Deposit', async () => {
                        const { txHash: hash } = await depositCall.mutateAsync({
                          to: POOL_ADDRESS,
                          amount: parseUnits(amount),
                          data: DEPOSIT_DATA,
                          skipBalanceCheck: false,
                        })
                        return hash
                      })
                    }
                  >
                    Deposit
                  </button>
                </ActionRow>

                <ActionRow
                  title="Claim a prize"
                  mark="(not your deposit)"
                  does="Money you won from a draw. Claiming it does not touch the cUSDT you deposited. Check prize, then Claim. Losers get 0. Nobody else sees the result."
                  extra={
                    <p className="pile pile-win">
                      Won{' '}
                      <Val>{winnings !== undefined ? formatUnits(winnings) : hasPermit ? '0' : 'encrypted'}</Val>
                      {' cUSDT'}
                      <PrizeTag tag={prizeTag} />
                    </p>
                  }
                  active={beat === 'parked'}
                >
                  <Field
                    label="Send prize to (optional)"
                    value={prizeTo}
                    onChange={setPrizeTo}
                    placeholder="0x…"
                  />
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady || !lastDraw || Boolean(prizeSettled)}
                    onClick={() =>
                      run('Check prize', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'accruePrize',
                          args: [address!],
                        }),
                      )
                    }
                  >
                    Check prize
                  </button>
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Claim', () =>
                        write({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'claim' }),
                      )
                    }
                  >
                    Claim my prize
                  </button>
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady || !isAddress(prizeTo)}
                    onClick={() =>
                      run('Claim to', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'claimTo',
                          args: [prizeTo as `0x${string}`],
                        }),
                      )
                    }
                  >
                    Claim to
                  </button>
                </ActionRow>

                <ActionRow
                  title="Your deposit"
                  mark="(not the prize)"
                  does="Money you put in. It always comes back. Withdraw some or all of it here. A win is claimed in the row above — this row will not pay the prize."
                  extra={
                    <p className="pile pile-own">
                      Your deposit{' '}
                      <Val>{shares !== undefined ? formatUnits(shares) : hasPermit ? '0' : 'encrypted'}</Val>
                      {' cUSDT'}
                    </p>
                  }
                >
                  <Field label="Withdraw amount (cUSDT)" value={amount} onChange={setAmount} placeholder="10" />
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Withdraw deposit', async () => {
                        const need = parseUnits(amount)
                        if (need === 0n) throw new Error('Enter how much of your deposit to take out.')
                        if (shares !== undefined && need > shares) {
                          throw new Error(
                            `You have ${formatUnits(shares)} in the vault. Withdraw some of that, or Withdraw all.`,
                          )
                        }
                        const enc = await encrypt.mutateAsync({
                          values: [{ value: need, type: 'euint64' }],
                          contractAddress: POOL_ADDRESS,
                          userAddress: address!,
                        })
                        return write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'withdraw',
                          args: [enc.encryptedValues[0]!, enc.inputProof, address!],
                        })
                      })
                    }
                  >
                    Withdraw some
                  </button>
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Withdraw all deposit', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'redeemAll',
                          args: [address!],
                        }),
                      )
                    }
                  >
                    Withdraw all
                  </button>
                </ActionRow>
              </div>
            )}

            {board === 'draw' && (
              <div className="board">
                <div className="draw-dash">
                  <div className="draw-clock" aria-live="polite">
                    <span>
                      {drawing
                        ? scanLeft === 0
                          ? 'Ready to finish'
                          : 'Closing draw'
                        : canStart
                          ? 'Draw is ready'
                          : waitLeft
                            ? 'Next draw in'
                            : prizeLiq === 0n || prizeLiq === undefined
                              ? 'Waiting on prize liquidity'
                              : !depositorCount
                                ? 'Waiting on depositors'
                                : 'Period elapsed'}
                    </span>
                    <em>
                      {drawing ? (
                        scanLeft === 0 ? (
                          'Ready'
                        ) : (
                          <>
                            {scanLeft}
                            <small>left</small>
                          </>
                        )
                      ) : canStart ? (
                        'Ready'
                      ) : waitLeft === undefined ? (
                        '--:--'
                      ) : (
                        formatClock(waitLeft)
                      )}
                    </em>
                    <span>
                      {drawing
                        ? scanLeft === 0
                          ? 'TWAB snapshotted · finish like PoolTogether'
                          : `Snapshot TWAB · ${scanPeople} depositor${scanPeople === 1 ? '' : 's'}`
                        : `Phase ${phaseName} · draw #${openDraw?.toString() ?? '-'}`}
                    </span>
                    <div className="draw-meter" aria-hidden="true">
                      <span style={{ width: `${Math.round((drawing ? scanFrac : canStart ? 1 : waitFrac) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="dash-grid">
                    <DashStat label="Prize" value={prizeLiq !== undefined ? formatUnits(prizeLiq) : '-'} unit="USDT" />
                    <DashStat label="Reserve" value={reserve !== undefined ? formatUnits(reserve) : '-'} unit="USDT" />
                    <DashStat
                      label="Draw pay"
                      value={keeperReward !== undefined ? formatUnits(keeperReward) : '-'}
                      unit="USDT"
                    />
                    <DashStat
                      label="Your allowance"
                      value={allowance !== undefined ? formatUnits(allowance) : '-'}
                      unit="USDT"
                    />
                    <DashStat label="Depositors" value={depositorCount?.toString() ?? '0'} />
                    <DashStat label="Open draw" value={`#${openDraw?.toString() ?? '-'}`} />
                    <DashStat label="Last awarded" value={`#${lastDraw?.toString() ?? '0'}`} />
                    <DashStat label="Period" value={period?.toString() ?? '-'} unit="sec" />
                    <DashStat
                      label="Last prize"
                      value={lastPrize !== undefined ? formatUnits(lastPrize) : '-'}
                      unit="USDT"
                    />
                    <DashStat
                      label="Grand 75%"
                      value={grandPrize !== undefined ? formatUnits(grandPrize) : '-'}
                      unit="USDT"
                    />
                    <DashStat
                      label="Daily 25%"
                      value={dailyPrize !== undefined ? formatUnits(dailyPrize) : '-'}
                      unit="USDT"
                    />
                    <DashStat label="Min hold" value={minHold?.toString() ?? '-'} unit="sec" />
                  </div>
                </div>

                <ActionRow
                  title="Feed the prize"
                  mark="(public USDT)"
                  does="The pool wraps 90% into encrypted cUSDT for claims — who won stays private. Prize size stays public. 10% stays unwrapped to pay whoever clicks Start or Finish. Liquidate does the same as Sponsor."
                  extra={
                    <p>
                      Public USDT {usdtBal !== undefined ? formatUnits(usdtBal) : '—'}. Allowance{' '}
                      {allowance !== undefined ? formatUnits(allowance) : '—'}. Approve the prize
                      amount (confirm MetaMask), then Sponsor. Do not use vault shares.
                    </p>
                  }
                >
                  <Field label="Prize (public USDT)" value={prizeAmount} onChange={setPrizeAmount} />
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Approve USDT', () => approvePoolUsdt(parseUnits(prizeAmount)))
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Sponsor prize', () => {
                        const need = parseUnits(prizeAmount)
                        requirePublicUsdt(need, 'Sponsor')
                        requireAllowance(need, 'Sponsor')
                        return write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'sponsor',
                          args: [need],
                        })
                      })
                    }
                  >
                    Sponsor
                  </button>
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Liquidate yield', () => {
                        const need = parseUnits(prizeAmount)
                        requirePublicUsdt(need, 'Liquidate')
                        return write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'liquidateYield',
                          args: [need],
                        })
                      })
                    }
                  >
                    Liquidate
                  </button>
                </ActionRow>

                <ActionRow
                  title="Start draw"
                  does="PoolTogether Draw Manager: startDraw closes the period and freezes the encrypted vault TWAB in one mul+add. Run draw finishes and checks your prize."
                >
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady || !canStart}
                    onClick={() =>
                      run('Start draw', async () => {
                        const hash = await write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'startDraw',
                        })
                        await write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'snapshotPrizeRecipients',
                        })
                        return hash
                      })
                    }
                  >
                    Start only
                  </button>
                  {owner && address && owner.toLowerCase() === address.toLowerCase() && (
                    <button
                      className="btn yellow"
                      disabled={!isConnected || busy || !poolReady}
                      onClick={() => void runDrawJob('Force + finish', () => runOpenDraw(true))}
                    >
                      Force + finish
                    </button>
                  )}
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !poolReady || !canStart}
                    onClick={() => void runDrawJob('Run draw', () => runOpenDraw(false))}
                  >
                    Run draw
                  </button>
                </ActionRow>

                <ActionRow
                  title="Finish draw"
                  does="PoolTogether finishDraw. Vault TWAB was frozen at Start. Awards the draw, then checks this wallet’s prize. Claim on Save."
                >
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !poolReady || !drawing}
                    onClick={() => void runDrawJob('Finish draw', () => finishOpenDraw())}
                  >
                    Finish draw
                  </button>
                </ActionRow>
              </div>
            )}

            {board === 'more' && (
              <div className="board">
                <p className="now-line">Optional extras. You do not need these to save or cash out.</p>

                <ActionRow
                  title="Unshield"
                  does="Turns all of your cUSDT back into public USDT."
                >
                  <button
                    className="btn"
                    disabled={!isConnected || busy}
                    onClick={() =>
                      run('Unshield all', async () => {
                        const { txHash: hash } = await unshieldAll.mutateAsync()
                        return hash
                      })
                    }
                  >
                    Unshield all
                  </button>
                </ActionRow>

                <ActionRow
                  title="Claim for someone"
                  does="Anyone can claim a winner's prize (PoolTogether bots). Paste their address."
                >
                  <Field label="Winner" value={claimTarget} onChange={setClaimTarget} placeholder="0x…" />
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady || !claimTarget}
                    onClick={() =>
                      run('Claim for', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'claimFor',
                          args: [claimTarget as `0x${string}`],
                        }),
                      )
                    }
                  >
                    Claim for winner
                  </button>
                </ActionRow>

                <ActionRow
                  title="Delegate chance"
                  does="Point your winning chance at another address. Your principal stays yours."
                >
                  <Field label="Delegate to" value={delegateTo} onChange={setDelegateTo} placeholder="0x…" />
                  <button
                    className="btn yellow"
                    disabled={!isConnected || busy || !poolReady || !delegateTo}
                    onClick={() =>
                      run('Delegate', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'delegate',
                          args: [delegateTo as `0x${string}`],
                        }),
                      )
                    }
                  >
                    Delegate
                  </button>
                </ActionRow>

                <ActionRow
                  title="Duck NFT hook"
                  does="Mint a duck, then attach the hook so a random duck holder gets your prize chance."
                >
                  <p className="hint" style={{ margin: 0 }}>
                    Ducks you own: <Val>{nftBal !== undefined ? nftBal.toString() : '-'}</Val> · flock{' '}
                    <Val>{nftSupply?.toString() ?? '-'}</Val> · hook{' '}
                    <Val>{hooks?.useBeforeClaimPrize ? 'on' : 'off'}</Val>
                  </p>
                  <button
                    className="btn yellow"
                    disabled={!isConnected || busy || !NFT_ADDRESS}
                    onClick={() =>
                      run('Mint duck', () =>
                        write({ address: NFT_ADDRESS, abi: nftAbi, functionName: 'mint' }),
                      )
                    }
                  >
                    Mint duck
                  </button>
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !poolReady || !HOOK_ADDRESS}
                    onClick={() =>
                      run('Set NFT hook', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'setHooks',
                          args: [{ useBeforeClaimPrize: true, useAfterClaimPrize: false, implementation: HOOK_ADDRESS }],
                        }),
                      )
                    }
                  >
                    Attach hook
                  </button>
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Clear hooks', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'setHooks',
                          args: [
                            {
                              useBeforeClaimPrize: false,
                              useAfterClaimPrize: false,
                              implementation: '0x0000000000000000000000000000000000000000',
                            },
                          ],
                        }),
                      )
                    }
                  >
                    Clear hook
                  </button>
                </ActionRow>

                <ActionRow
                  title="TWAB rewards"
                  mark="(public USDT)"
                  does="Extra airdrop for vault depositors — not the main draw. Budget is public USDT. After the window, claim a slice from how much you held × how long. Approve, create, wait, claim."
                >
                  <p className="hint" style={{ margin: 0 }}>
                    {twabId ? (
                      <>
                        Campaign <Val>#{twabId.toString()}</Val>
                        {twabBudgetOnchain !== undefined ? (
                          <>
                            {' · '}
                            <Val>{formatUnits(BigInt(twabBudgetOnchain))} USDT</Val>
                          </>
                        ) : null}
                        {' · '}
                        <Val>
                          {twabClaimed
                            ? 'you claimed'
                            : twabEndsAt === undefined
                              ? '…'
                              : nowSec >= Number(twabEndsAt)
                                ? 'window ended'
                                : `ends in ${secsLeft(Number(twabEndsAt) - nowSec)}`}
                        </Val>
                      </>
                    ) : (
                      <>
                        Campaigns created: <Val>0</Val>
                      </>
                    )}
                  </p>
                  <Field label="Budget USDT" value={twabBudget} onChange={setTwabBudget} />
                  <Field label="Window (sec)" value={twabDuration} onChange={setTwabDuration} />
                  <button
                    className="btn"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Approve TWAB', () => {
                        const need = parseUnits(twabBudget)
                        requirePublicUsdt(need, 'Approve')
                        return write({
                          address: SEPOLIA_USDT,
                          abi: erc20Abi,
                          functionName: 'approve',
                          args: [POOL_ADDRESS, need],
                        })
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="btn cta"
                    disabled={!isConnected || busy || !poolReady}
                    onClick={() =>
                      run('Create TWAB campaign', () => {
                        const need = parseUnits(twabBudget)
                        requirePublicUsdt(need, 'Create campaign')
                        const duration = BigInt(twabDuration || '0')
                        if (duration === 0n) throw new Error('Enter a window in seconds.')
                        const scale = parseUnits('10') * duration
                        return write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'createTwabCampaign',
                          args: [need, Number(duration), scale],
                        })
                      })
                    }
                  >
                    Create campaign
                  </button>
                  <button
                    className="btn yellow"
                    disabled={!isConnected || busy || !poolReady || !twabClaimReady}
                    onClick={() =>
                      run('Claim TWAB rewards', () =>
                        write({
                          address: POOL_ADDRESS,
                          abi: poolAbi,
                          functionName: 'claimTwabRewards',
                          args: [twabCampaigns ?? 0n],
                        }),
                      )
                    }
                  >
                    Claim latest
                  </button>
                </ActionRow>
              </div>
            )}
          </div>
        </div>

        <div className="specs">
          <div className="spec">
            <strong>2</strong>
            <span>Prize tiers</span>
          </div>
          <div className="spec">
            <strong>75/25</strong>
            <span>Grand / daily</span>
          </div>
          <div className="spec">
            <strong>O(1)</strong>
            <span>Vault TWAB freeze</span>
          </div>
          <div className="spec">
            <strong>60s</strong>
            <span>Draw period</span>
          </div>
        </div>

        <section className="leak" id="pt-map">
          <div className="section-head">
            <h2>
              PoolTogether V5 / <em>replica map</em>
            </h2>
            <p>
              Docs map for judges, not the play order. Use Save, Draw, and More above. Each row is a live
              Lantern function plus the{' '}
              <a href="https://dev.pooltogether.com/" target="_blank" rel="noreferrer">
                PoolTogether docs
              </a>{' '}
              it was built from.
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <th>PoolTogether</th>
                <th>Lantern</th>
                <th>Origin</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Prize Vault deposit / withdraw</td>
                <td>
                  <code>confidentialTransferAndCall</code> · <code>withdraw</code> · <code>redeemAll</code>
                </td>
                <td>
                  <a href="https://dev.pooltogether.com/protocol/design/vaults" target="_blank" rel="noreferrer">
                    Vaults
                  </a>
                </td>
              </tr>
              <tr>
                <td>Prize Pool contribute + reserve</td>
                <td>
                  <code>sponsor</code> (90% prize / 10% reserve) · <code>liquidateYield</code>
                </td>
                <td>
                  <a href="https://dev.pooltogether.com/protocol/design/prize-pool" target="_blank" rel="noreferrer">
                    Prize Pool
                  </a>
                </td>
              </tr>
              <tr>
                <td>Twab Controller</td>
                <td>
                  Running encrypted vault TWAB. <code>startDraw</code> freezes the total in one mul+add.
                  User weight freezes at claim · <code>minHoldSeconds</code>
                </td>
                <td>
                  <a
                    href="https://dev.pooltogether.com/protocol/design/twab-controller"
                    target="_blank"
                    rel="noreferrer"
                  >
                    TWAB
                  </a>
                </td>
              </tr>
              <tr>
                <td>Delegation sweepstakes</td>
                <td>
                  <code>delegate</code> / <code>delegateOf</code>
                </td>
                <td>
                  <a
                    href="https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#delegation-sweepstakes"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Incentives
                  </a>
                </td>
              </tr>
              <tr>
                <td>NFT prize sweepstakes</td>
                <td>
                  <code>setHooks</code> + Duck NFT hook
                </td>
                <td>
                  <a
                    href="https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#nft-prize-sweepstakes"
                    target="_blank"
                    rel="noreferrer"
                  >
                    NFT hooks
                  </a>
                </td>
              </tr>
              <tr>
                <td>Twab Rewards</td>
                <td>
                  <code>createTwabCampaign</code> / <code>claimTwabRewards</code>
                </td>
                <td>
                  <a
                    href="https://dev.pooltogether.com/protocol/guides/integrate/prize-incentives#twab-rewards"
                    target="_blank"
                    rel="noreferrer"
                  >
                    TWAB Rewards
                  </a>
                </td>
              </tr>
              <tr>
                <td>Draws Open / Closed / Awarded / Finalized</td>
                <td>
                  <code>getDrawPhase</code> → {phaseName}
                </td>
                <td>
                  <a href="https://dev.pooltogether.com/protocol/design/#draws" target="_blank" rel="noreferrer">
                    Draw lifecycle
                  </a>
                </td>
              </tr>
              <tr>
                <td>Draw Manager start / finish</td>
                <td>
                  <code>startDraw</code> · <code>finalizeDraw</code> · <code>accruePrize</code> / <code>claim</code>
                </td>
                <td>
                  <a
                    href="https://dev.pooltogether.com/protocol/design/prize-pool#incentivized-draws"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Incentivized draws
                  </a>
                </td>
              </tr>
              <tr>
                <td>Prize Claimer (anyone)</td>
                <td>
                  <code>claim</code> · <code>claimTo</code> · <code>claimFor</code>
                </td>
                <td>
                  <a href="https://dev.pooltogether.com/protocol/design/prize-claimer" target="_blank" rel="noreferrer">
                    Prize Claimer
                  </a>
                </td>
              </tr>
              <tr>
                <td>RNG auction</td>
                <td>
                  Onchain <code>FHE.randEuint64</code>
                </td>
                <td>
                  <a href="https://dev.pooltogether.com/protocol/design/#rng-auction" target="_blank" rel="noreferrer">
                    RNG
                  </a>
                </td>
              </tr>
              <tr>
                <td>Gasless (4337)</td>
                <td>Openfort email/passkey EOA + EIP-7702 paymaster</td>
                <td>
                  <a
                    href="https://paragraph.com/@pooltogether-2/pooltogether-has-gone-gasless"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PT gasless
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="leak" id="leak">
          <div className="section-head">
            <h2>
              Public / <em>private</em>
            </h2>
            <p>What the chain can see, and what stays hidden.</p>
          </div>
          <table>
            <tbody>
              <tr>
                <th>Private</th>
                <td>Deposit sizes, vault shares, odds, FHE random tickets, per-user winnings</td>
              </tr>
              <tr>
                <th>Public</th>
                <td>
                  Depositor addresses, wrap/unwrap amounts, prize size, draw timestamps, that a claim
                  transaction occurred
                </td>
              </tr>
              <tr>
                <th>Fairness</th>
                <td>
                  Winner = PoolTogether isWinner: uniform(userSeed, encrypted TWAB total) vs weight × 75/25.
                  Last-second deposits have zero weight. Check prize / claim to settle; losers should claim
                  encrypted 0. No offchain RNG.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
        </>
      )}

      <TxDock
        label={status}
        phase={txPhase}
        hash={txHash}
        error={error}
        passkeyReady={passkeyReady}
        onApprovePasskey={confirmPasskeyGate}
        onDismiss={() => {
          cancelPasskeyGate()
          setPasskeyReady(false)
          setTxPhase('idle')
          setStatus('')
          setError('')
          setTxHash(undefined)
        }}
      />

      <footer className="footer">
        <span>Lantern · Apache-2.0 · Zama Developer Program S4</span>
        <span>
          <a href="https://github.com/AshThunder/lantern-prize-savings">Source</a>
          {' · '}
          <a href="https://dev.pooltogether.com/protocol/design/" target="_blank" rel="noreferrer">
            PoolTogether
          </a>
          {' · '}
          <a href="https://www.zama.org/post/zama-developer-program-mainnet-season-4">Zama</a>
        </span>
      </footer>
    </>
  )
}
