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
  passkeyReady,
  onApprovePasskey,
  onDismiss,
}: {
  label: string
  phase: 'idle' | 'working' | 'confirming' | 'done' | 'error'
  hash?: `0x${string}`
  error?: string
  passkeyReady?: boolean
  onApprovePasskey?: () => void
  onDismiss: () => void
}) {
  const { connector } = useAccount()
  const openfortWallet = isOpenfortConnector(connector)
  if (phase === 'idle') return null

  const askPasskey = phase === 'working' && openfortWallet && Boolean(onApprovePasskey)
  const title =
    phase === 'working'
      ? askPasskey && passkeyReady
        ? `${label || 'Transaction'} — approve passkey`
        : `${label || 'Transaction'} — signing`
      : phase === 'confirming'
        ? `${label || 'Transaction'} — confirming`
        : phase === 'done'
          ? `${label || 'Transaction'} confirmed`
          : error || 'Transaction failed'

  return (
    <>
      {askPasskey &&
        createPortal(
          <div className="passkey-back" role="presentation">
            <div className="passkey-sheet" role="dialog" aria-modal="true" aria-labelledby="passkey-title">
              <button type="button" className="tx-x passkey-x" onClick={onDismiss} aria-label="Dismiss passkey prompt">
                ×
              </button>
              <p className="wallet-kicker">Openfort</p>
              <h2 id="passkey-title">{passkeyReady ? 'Approve passkey' : 'Preparing passkey'}</h2>
              <p>
                {passkeyReady
                  ? 'This yellow card is the passkey step — not Claim, Shield, or Deposit. Click below so the browser can show the prompt.'
                  : 'Stay on this tab. Openfort is preparing a gasless transaction (~30s). Approve passkey will appear on this same yellow card — not on the Claim button.'}
              </p>
              {passkeyReady && (
                <button type="button" className="tx-passkey" onClick={onApprovePasskey}>
                  Approve passkey
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
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
              ? passkeyReady
                ? 'Prepared. Click Approve passkey on the yellow dialog in the center of the screen.'
                : 'Openfort is preparing a gasless transaction (~30s). Stay on this tab. A yellow Approve passkey dialog will cover the page — not the Claim button.'
              : 'Approve in MetaMask if it asks. You pay Sepolia ETH for gas.'}
          </p>
        )}
        {askPasskey && passkeyReady && (
          <button type="button" className="tx-passkey" onClick={onApprovePasskey}>
            Approve passkey
          </button>
        )}
        {phase === 'confirming' && (
          <p>
            Waiting for Sepolia to include the transaction. This can take a minute. Open the
            Etherscan link if it sits here.
          </p>
        )}
        {phase === 'done' && <p>Balances refresh in a few seconds.</p>}
        {phase === 'error' && openfortWallet && (
          <p>
            This pink card is an error, not the passkey step. Dismiss it, click the action
            again, then use the yellow Approve passkey dialog if it appears.
          </p>
        )}
        {hash && (
          <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">
            {shortAddr(hash)} on Etherscan
          </a>
        )}
      </aside>
    </>
  )
}
