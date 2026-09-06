import { useSignOut, useUI } from '@openfort/react'
import { useEthereumEmbeddedWallet } from '@openfort/react/ethereum'
import { useDisconnect } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { shortAddr } from './config'
import { WalletChip } from './WalletPanel'

export function OpenfortWalletHint() {
  const { wallets, setActive, address, status } = useEthereumEmbeddedWallet()
  if (wallets.length <= 1) return null
  const oldest = [...wallets].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0]
  const usingOldest =
    oldest && address && oldest.address.toLowerCase() === address.toLowerCase()

  return (
    <p className="banner">
      This email has {wallets.length} wallets. A new device or localhost makes a new passkey
      wallet — that is a different address. Recover the original on the Openfort screen, or{' '}
      {!usingOldest && oldest ? (
        <button
          type="button"
          className="btn"
          disabled={status === 'connecting'}
          onClick={() => void setActive({ address: oldest.address, chainId: sepolia.id })}
        >
          Use {shortAddr(oldest.address)}
        </button>
      ) : (
        'stay on this one if you meant to start fresh.'
      )}
    </p>
  )
}

export function SignInButton({
  className,
  children,
  disabled,
}: {
  className?: string
  children: string
  disabled?: boolean
}) {
  const { open } = useUI()
  return (
    <button className={className} type="button" disabled={disabled} onClick={() => open()}>
      {children}
    </button>
  )
}

export function OpenfortWalletChip({ address }: { address: `0x${string}` }) {
  const { openReceive, openProfile } = useUI()
  return <WalletChip address={address} openReceive={openReceive} openProfile={openProfile} />
}

export function SignOutButton({ className, children }: { className?: string; children: string }) {
  const { signOut, isLoading } = useSignOut()
  const { disconnect } = useDisconnect()

  return (
    <button
      className={className}
      type="button"
      disabled={isLoading}
      onClick={() => {
        void signOut().finally(() => disconnect())
      }}
    >
      {children}
    </button>
  )
}
