import { useSignOut, useUI } from '@openfort/react'
import { useDisconnect } from 'wagmi'
import { WalletChip } from './WalletPanel'

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
