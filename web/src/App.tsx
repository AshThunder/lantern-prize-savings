import { useEffect, useMemo, useState } from 'react'
import {
  useConfidentialBalance,
  useConfidentialTransferAndCall,
  useDecryptValues,
  useEncrypt,
  useGrantPermit,
  useHasPermit,
  useShield,
  useUnshield,
} from '@zama-fhe/react-sdk'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { injected } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { poolAbi } from './poolAbi'
import {
  DEPOSIT_DATA,
  FAUCET_AMOUNT,
  POOL_ADDRESS,
  SEPOLIA_CUSDT,
  SEPOLIA_USDT,
  ZERO_HANDLE,
  erc20Abi,
  explainError,
  formatUnits,
  parseUnits,
  shortAddr,
} from './config'

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

export default function App() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: connecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const wrongNetwork = isConnected && chainId !== sepolia.id
  const poolReady = Boolean(POOL_ADDRESS)

  const [amount, setAmount] = useState('10')
  const [prizeAmount, setPrizeAmount] = useState('5')
  const [delegateTo, setDelegateTo] = useState('')
  const [claimTarget, setClaimTarget] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContractAsync, isPending: writing } = useWriteContract()
  const { isLoading: waiting } = useWaitForTransactionReceipt({ hash: txHash })
  const encrypt = useEncrypt()
  const shield = useShield({ address: SEPOLIA_CUSDT })
  const unshield = useUnshield(SEPOLIA_CUSDT)
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
    query: { enabled: !!address },
  })
  const { data: allowance, refetch: refetchAllow } = useReadContract({
    address: SEPOLIA_USDT,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && poolReady ? [address, POOL_ADDRESS] : undefined,
    query: { enabled: !!address && poolReady },
  })
  const { data: cUsdtBal, refetch: refetchCusdt } = useConfidentialBalance({
    address: SEPOLIA_CUSDT,
    account: address,
  })

  const poolReads = {
    address: POOL_ADDRESS,
    abi: poolAbi,
    query: { enabled: poolReady },
  } as const

  const { data: prizeLiq, refetch: refetchPool } = useReadContract({
    ...poolReads,
    functionName: 'prizeLiquidity',
  })
  const { data: drawing } = useReadContract({ ...poolReads, functionName: 'drawing' })
  const { data: canStart } = useReadContract({ ...poolReads, functionName: 'canStartDraw' })
  const { data: remaining } = useReadContract({ ...poolReads, functionName: 'remainingScan' })
  const { data: depositorCount } = useReadContract({ ...poolReads, functionName: 'depositorCount' })
  const { data: openDraw } = useReadContract({ ...poolReads, functionName: 'getOpenDrawId' })
  const { data: lastDraw } = useReadContract({ ...poolReads, functionName: 'getLastAwardedDrawId' })
  const { data: lastPrize } = useReadContract({ ...poolReads, functionName: 'lastDrawPrize' })
  const { data: grandPrize } = useReadContract({ ...poolReads, functionName: 'lastGrandPrize' })
  const { data: dailyPrize } = useReadContract({ ...poolReads, functionName: 'lastDailyPrize' })
  const { data: period } = useReadContract({ ...poolReads, functionName: 'drawPeriodSeconds' })
  const { data: owner } = useReadContract({ ...poolReads, functionName: 'owner' })
  const { data: shareHandle } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address },
  })
  const { data: winHandle } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'confidentialWinningsOf',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address },
  })
  const { data: chanceOf } = useReadContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'delegateOf',
    args: address ? [address] : undefined,
    query: { enabled: poolReady && !!address },
  })

  const decryptInputs = useMemo(() => {
    const items: { encryptedValue: string; contractAddress: `0x${string}` }[] = []
    if (poolReady && shareHandle && shareHandle !== ZERO_HANDLE) {
      items.push({ encryptedValue: shareHandle, contractAddress: POOL_ADDRESS })
    }
    if (poolReady && winHandle && winHandle !== ZERO_HANDLE) {
      items.push({ encryptedValue: winHandle, contractAddress: POOL_ADDRESS })
    }
    return items
  }, [shareHandle, winHandle, poolReady])

  const { data: decrypted } = useDecryptValues(decryptInputs, {
    enabled: !!hasPermit && decryptInputs.length > 0,
  })

  const shares =
    shareHandle && decrypted ? (decrypted[shareHandle] as bigint | undefined) : undefined
  const winnings =
    winHandle && decrypted ? (decrypted[winHandle] as bigint | undefined) : undefined

  useEffect(() => {
    if (!txHash) return
    const t = setTimeout(() => {
      void refetchUsdt()
      void refetchAllow()
      void refetchCusdt()
      void refetchPool()
    }, 1500)
    return () => clearTimeout(t)
  }, [txHash, waiting, refetchUsdt, refetchAllow, refetchCusdt, refetchPool])

  async function run(label: string, fn: () => Promise<`0x${string}` | void>) {
    setError('')
    setStatus(label)
    try {
      const hash = await fn()
      if (hash) {
        setTxHash(hash)
        setStatus(`${label} submitted`)
      } else {
        setStatus(`${label} done`)
      }
    } catch (e) {
      setError(explainError(e))
      setStatus('')
    }
  }

  const busy = writing || waiting || encrypt.isPending || shield.isPending || unshield.isPending || depositCall.isPending

  return (
    <div className="page">
      <header className="mast">
        <div className="brand">
          <span className="mark">Ln</span>
          <div>
            <p className="kicker">Zama Protocol · Sepolia</p>
            <h1>Lantern</h1>
            <p className="sub">Confidential prize savings. No-loss principal. Encrypted odds.</p>
          </div>
        </div>
        <div className="wallet">
          {!isConnected ? (
            <button className="btn gold" onClick={() => connect({ connector: injected() })} disabled={connecting}>
              Connect wallet
            </button>
          ) : (
            <>
              <span className="pill">{shortAddr(address!)}</span>
              <button className="btn ghost" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </header>

      {wrongNetwork && (
        <div className="banner warn">
          This app runs on Ethereum Sepolia.{' '}
          <button className="link" onClick={() => switchChain({ chainId: sepolia.id })}>
            Switch network
          </button>
        </div>
      )}
      {!poolReady && (
        <div className="banner warn">
          Pool address is not set. Deploy ConfidentialPrizePool and set <code>VITE_POOL_ADDRESS</code>.
        </div>
      )}

      <section className="lede">
        <p>
          Deposit confidential USDT into a shared prize vault. Yield (mocked on Sepolia) is awarded
          by an onchain FHE draw weighted by encrypted shares — two PoolTogether-style tiers, grand
          and daily. Only you can decrypt your balance and winnings (EIP-712). Principal is always
          withdrawable.
        </p>
      </section>

      <div className="ticket">
        <aside className="stub">
          <p className="stub-label">Your position</p>
          <dl>
            <div>
              <dt>USDT (public)</dt>
              <dd>{usdtBal !== undefined ? formatUnits(usdtBal) : '—'}</dd>
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
              <dt>Winnings</dt>
              <dd>{winnings !== undefined ? formatUnits(winnings) : 'encrypted'}</dd>
            </div>
            <div>
              <dt>Chance delegated to</dt>
              <dd>{chanceOf ? shortAddr(chanceOf) : 'self'}</dd>
            </div>
          </dl>
          <button
            className="btn ink"
            disabled={!isConnected || grantPermit.isPending}
            onClick={() =>
              run('Authorize decryption', async () => {
                await grantPermit.mutateAsync(contracts)
              })
            }
          >
            {hasPermit ? 'Decryption authorized' : 'Authorize EIP-712 decrypt'}
          </button>
          <p className="hint">Signs once per session so the relayer can reencrypt your handles to your key.</p>
        </aside>

        <div className="body">
          <section>
            <h2>1. Get tokens</h2>
            <p className="hint">Sepolia mock USDT mints up to 1,000,000 per call. Then shield into ERC-7984 cUSDT.</p>
            <div className="row">
              <button
                className="btn"
                disabled={!isConnected || busy}
                onClick={() =>
                  run('Faucet', () =>
                    writeContractAsync({
                      address: SEPOLIA_USDT,
                      abi: erc20Abi,
                      functionName: 'mint',
                      args: [address!, FAUCET_AMOUNT],
                    }),
                  )
                }
              >
                Mint 100 USDT
              </button>
              <Field label="Amount" value={amount} onChange={setAmount} placeholder="10" />
              <button
                className="btn"
                disabled={!isConnected || busy}
                onClick={() =>
                  run('Shield', async () => {
                    const { txHash: hash } = await shield.mutateAsync({ amount: parseUnits(amount) })
                    return hash
                  })
                }
              >
                Shield → cUSDT
              </button>
              <button
                className="btn ghost"
                disabled={!isConnected || busy}
                onClick={() =>
                  run('Unshield', async () => {
                    const { txHash: hash } = await unshield.mutateAsync({ amount: parseUnits(amount) })
                    return hash
                  })
                }
              >
                Unshield
              </button>
            </div>
          </section>

          <section>
            <h2>2. Vault — deposit / withdraw / redeem</h2>
            <p className="hint">
              Deposit uses <code>confidentialTransferAndCall</code> so the amount stays encrypted in the
              pool. Withdraw and redeem are 1:1 (yield never inflates share price, like PoolTogether).
            </p>
            <div className="row">
              <button
                className="btn gold"
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
                Deposit (encrypted)
              </button>
              <button
                className="btn"
                disabled={!isConnected || busy || !poolReady}
                onClick={() =>
                  run('Withdraw', async () => {
                    const enc = await encrypt.mutateAsync({
                      values: [{ value: parseUnits(amount), type: 'euint64' }],
                      contractAddress: POOL_ADDRESS,
                      userAddress: address!,
                    })
                    return writeContractAsync({
                      address: POOL_ADDRESS,
                      abi: poolAbi,
                      functionName: 'withdraw',
                      args: [enc.encryptedValues[0]!, enc.inputProof, address!],
                    })
                  })
                }
              >
                Withdraw
              </button>
              <button
                className="btn ghost"
                disabled={!isConnected || busy || !poolReady}
                onClick={() =>
                  run('Redeem all', () =>
                    writeContractAsync({
                      address: POOL_ADDRESS,
                      abi: poolAbi,
                      functionName: 'redeemAll',
                      args: [address!],
                    }),
                  )
                }
              >
                Redeem all
              </button>
            </div>
          </section>

          <section>
            <h2>3. Yield mock — sponsor / contribute / liquidate</h2>
            <p className="hint">
              Public prize size (PoolTogether shows prize amounts). Production would harvest an ERC-4626
              and contribute only yield via a Zama confidential vault.
            </p>
            <div className="row">
              <Field label="Prize USDT" value={prizeAmount} onChange={setPrizeAmount} />
              <button
                className="btn"
                disabled={!isConnected || busy || !poolReady}
                onClick={() =>
                  run('Approve USDT', () =>
                    writeContractAsync({
                      address: SEPOLIA_USDT,
                      abi: erc20Abi,
                      functionName: 'approve',
                      args: [POOL_ADDRESS, parseUnits(prizeAmount)],
                    }),
                  )
                }
              >
                Approve pool
              </button>
              <button
                className="btn gold"
                disabled={!isConnected || busy || !poolReady}
                onClick={() =>
                  run('Sponsor prize', () =>
                    writeContractAsync({
                      address: POOL_ADDRESS,
                      abi: poolAbi,
                      functionName: 'sponsor',
                      args: [parseUnits(prizeAmount)],
                    }),
                  )
                }
              >
                Sponsor / contribute
              </button>
            </div>
            <p className="hint">
              Prize liquidity: {prizeLiq !== undefined ? formatUnits(prizeLiq) : '—'} USDT · allowance{' '}
              {allowance !== undefined ? formatUnits(allowance) : '—'}
            </p>
          </section>

          <section>
            <h2>4. Draw — award, step, finalize</h2>
            <p className="hint">
              Open draw #{openDraw?.toString() ?? '—'} · last awarded #{lastDraw?.toString() ?? '0'} ·
              depositors {depositorCount?.toString() ?? '0'} · period {period?.toString() ?? '—'}s ·{' '}
              {drawing ? `scanning, ${remaining?.toString() ?? '?'} left` : canStart ? 'ready to award' : 'waiting'}
            </p>
            {lastPrize !== undefined && lastPrize > 0n && (
              <p className="hint">
                Last prize {formatUnits(lastPrize)} · grand {formatUnits(grandPrize ?? 0n)} · daily{' '}
                {formatUnits(dailyPrize ?? 0n)}
              </p>
            )}
            <div className="row">
              <button
                className="btn gold"
                disabled={!isConnected || busy || !poolReady}
                onClick={() =>
                  run('Start draw', () =>
                    writeContractAsync({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'startDraw' }),
                  )
                }
              >
                Start draw
              </button>
              {owner && address && owner.toLowerCase() === address.toLowerCase() && (
                <button
                  className="btn"
                  disabled={!isConnected || busy || !poolReady}
                  onClick={() =>
                    run('Force draw', () =>
                      writeContractAsync({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'forceDraw' }),
                    )
                  }
                >
                  Force draw (owner)
                </button>
              )}
              <button
                className="btn"
                disabled={!isConnected || busy || !poolReady || !drawing}
                onClick={() =>
                  run('Step draw', () =>
                    writeContractAsync({
                      address: POOL_ADDRESS,
                      abi: poolAbi,
                      functionName: 'stepDraw',
                      args: [8],
                    }),
                  )
                }
              >
                Step draw (8)
              </button>
              <button
                className="btn"
                disabled={!isConnected || busy || !poolReady || !drawing}
                onClick={() =>
                  run('Finalize', () =>
                    writeContractAsync({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'finalizeDraw' }),
                  )
                }
              >
                Finalize
              </button>
            </div>
          </section>

          <section>
            <h2>5. Claim · delegate chance</h2>
            <div className="row">
              <button
                className="btn gold"
                disabled={!isConnected || busy || !poolReady}
                onClick={() =>
                  run('Claim', () =>
                    writeContractAsync({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'claim' }),
                  )
                }
              >
                Claim my prize
              </button>
              <Field label="Claim for" value={claimTarget} onChange={setClaimTarget} placeholder="0x…" />
              <button
                className="btn ghost"
                disabled={!isConnected || busy || !poolReady || !claimTarget}
                onClick={() =>
                  run('Claim for', () =>
                    writeContractAsync({
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
            </div>
            <div className="row">
              <Field label="Delegate chance to" value={delegateTo} onChange={setDelegateTo} placeholder="0x…" />
              <button
                className="btn"
                disabled={!isConnected || busy || !poolReady || !delegateTo}
                onClick={() =>
                  run('Delegate', () =>
                    writeContractAsync({
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
            </div>
          </section>
        </div>
      </div>

      {(status || error || txHash) && (
        <div className={`status ${error ? 'bad' : ''}`}>
          {error ? <p>{error}</p> : <p>{status}</p>}
          {txHash && (
            <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
              View on Etherscan
            </a>
          )}
        </div>
      )}

      <section className="leak">
        <h2>What stays encrypted</h2>
        <table>
          <tbody>
            <tr>
              <th>Encrypted</th>
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
                Winner = first cumulative encrypted share crossing (rand × totalShares) ≫ 64. Two
                independent tickets: grand 75% / daily 25%. No offchain RNG.
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
