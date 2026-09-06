import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { encode } from 'uqr'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { SEPOLIA_USDT, erc20Abi, formatUnits, isOpenfortConnector, openfortGasless, shortAddr } from './config'

function formatEth(value: bigint) {
  const s = formatUnits(value, 18)
  const [w, f = ''] = s.split('.')
  const frac = f.slice(0, 4).replace(/0+$/, '')
  return frac ? `${w}.${frac}` : w
}

function AddressQr({ value }: { value: string }) {
  const qr = useMemo(() => encode(value, { ecc: 'M', border: 2 }), [value])
  const path = useMemo(
    () =>
      qr.data
        .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : '')))
        .join(''),
    [qr.data],
  )
  return (
    <svg
      className="wallet-qr"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img"
      aria-label="Wallet address QR code"
    >
      <rect width={qr.size} height={qr.size} fill="#f4f1ea" />
      <path d={path} fill="#0a0a0a" />
    </svg>
  )
}

export function WalletChip({
  address,
  openReceive,
  openProfile,
}: {
  address: `0x${string}`
  openReceive?: () => void
  openProfile?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { data: eth } = useBalance({ address, query: { refetchInterval: 12_000 } })
  const { data: usdt } = useReadContract({
    address: SEPOLIA_USDT,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
    query: { refetchInterval: 12_000 },
  })

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <button type="button" className="pill addr" onClick={() => setOpen(true)} title="Receive · copy address">
        <span>QR</span>
        {shortAddr(address)}
      </button>
      {open &&
        createPortal(
        <div className="wallet-back" onClick={() => setOpen(false)} role="presentation">
          <div
            className="wallet-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wallet-sheet-top">
              <div>
                <p className="wallet-kicker">Sepolia</p>
                <h2 id="wallet-sheet-title">Your wallet</h2>
              </div>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="wallet-body">
              <AddressQr value={address} />
              <div className="wallet-meta">
                <p className="wallet-addr">{address}</p>
                <div className="wallet-actions">
                  <button type="button" className="btn cta" onClick={() => void copy()}>
                    {copied ? 'Copied' : 'Copy address'}
                  </button>
                  <a
                    className="btn"
                    href={`https://sepolia.etherscan.io/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Etherscan
                  </a>
                  {openReceive && (
                    <button type="button" className="btn yellow" onClick={openReceive}>
                      Openfort QR
                    </button>
                  )}
                  {openProfile && (
                    <button type="button" className="btn" onClick={openProfile}>
                      Wallet
                    </button>
                  )}
                </div>
                <dl className="wallet-bals">
                  <div>
                    <dt>Public USDT</dt>
                    <dd>{usdt !== undefined ? formatUnits(usdt) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Sepolia ETH</dt>
                    <dd>{eth ? formatEth(eth.value) : '—'}</dd>
                  </div>
                </dl>
                <p className="wallet-hint">
                  Send Sepolia USDT or ETH here.{' '}
                  {openfortGasless
                    ? 'Email login sponsors gas.'
                    : 'Email login sponsors gas when a paymaster is set.'}{' '}
                  You still need USDT to save — claim it on Save, or send it to this address.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body,
        )}
    </>
  )
}

export function TxDock({
  label,
  phase,
  hash,
  error,
  onDismiss,
}: {
  label: string
  phase: 'idle' | 'working' | 'confirming' | 'done' | 'error'
  hash?: `0x${string}`
  error?: string
  onDismiss: () => void
}) {
  const { connector } = useAccount()
  const openfortWallet = isOpenfortConnector(connector)
  if (phase === 'idle') return null

  const title =
    phase === 'working'
      ? `${label || 'Transaction'} — signing`
      : phase === 'confirming'
        ? `${label || 'Transaction'} — confirming`
        : phase === 'done'
          ? `${label || 'Transaction'} confirmed`
          : error || 'Transaction failed'

  return (
    <aside className={`tx-dock${phase === 'error' ? ' bad' : phase === 'done' ? ' ok' : ''}`} aria-live="polite">
      <div className="tx-dock-top">
        <strong>{title}</strong>
        <button type="button" className="tx-x" onClick={onDismiss} aria-label="Dismiss transaction status">
          ×
        </button>
      </div>
      {phase === 'working' && (
        <p>
          {openfortWallet
            ? 'Stay on this tab. The browser should ask for your passkey.'
            : 'Approve in MetaMask if it asks. You pay Sepolia ETH for gas.'}
        </p>
      )}
      {phase === 'confirming' && (
        <p>
          Waiting for Sepolia to include the transaction. This can take a minute. Open the
          Etherscan link if it sits here.
        </p>
      )}
      {phase === 'done' && <p>Balances refresh in a few seconds.</p>}
      {hash && (
        <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">
          {shortAddr(hash)} on Etherscan
        </a>
      )}
    </aside>
  )
}
