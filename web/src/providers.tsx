import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  AccountTypeEnum,
  AuthProvider,
  OpenfortProvider,
  RecoveryMethod,
} from '@openfort/react'
import { embeddedWalletConnector, getDefaultConfig, OpenfortWagmiBridge } from '@openfort/react/wagmi'
import { ZamaProvider } from '@zama-fhe/react-sdk'
import { createConfig as createZamaConfig } from '@zama-fhe/react-sdk/wagmi'
import { sepolia as sepoliaFhe } from '@zama-fhe/sdk/chains'
import { web } from '@zama-fhe/sdk/web'
import { type ReactNode, useEffect } from 'react'
import { WagmiProvider, createConfig, http, injected, useAccount, useSwitchChain } from 'wagmi'
import { coinbaseWallet } from 'wagmi/connectors'
import { sepolia } from 'wagmi/chains'
import {
  OPENFORT_POLICY_ID,
  OPENFORT_PUBLISHABLE_KEY,
  OPENFORT_SHIELD_KEY,
  RPC_URL,
  openfortConfigured,
} from './config'
import './openfortPasskeyGate'

type Eip1193 = { request: (...args: unknown[]) => Promise<unknown>; isMetaMask?: boolean; [key: string]: unknown }

function isRealMetaMask(provider: Eip1193 | undefined): provider is Eip1193 {
  if (!provider?.isMetaMask) return false
  if (provider.isBraveWallet && !provider._events && !provider._state) return false
  const impostors = ['isRabby', 'isPhantom', 'isCoinbaseWallet', 'isOkxWallet', 'isZerion', 'isRainbow']
  return !impostors.some((flag) => provider[flag])
}

function findMetaMaskProvider(win: {
  addEventListener: typeof window.addEventListener
  removeEventListener: typeof window.removeEventListener
  dispatchEvent: typeof window.dispatchEvent
  ethereum?: Eip1193 & { providers?: Eip1193[] }
}): Eip1193 | undefined {
  let announced: Eip1193 | undefined
  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: { rdns?: string }; provider?: Eip1193 }>).detail
    if (detail?.info?.rdns === 'io.metamask' || detail?.info?.rdns === 'io.metamask.mobile') {
      announced = detail.provider
    }
  }
  win.addEventListener('eip6963:announceProvider', onAnnounce)
  win.dispatchEvent(new Event('eip6963:requestProvider'))
  win.removeEventListener('eip6963:announceProvider', onAnnounce)
  if (announced) return announced
  if (!win.ethereum) return undefined
  return (win.ethereum.providers ?? [win.ethereum]).find(isRealMetaMask)
}

const lanternConnectors = [
  embeddedWalletConnector(),
  injected({
    // wagmi's Window type and the DOM Window type don't match; the runtime object is the same.
    target: (() => ({
      id: 'metaMask',
      name: 'MetaMask',
      provider(win?: typeof window) {
        const scope = win ?? (typeof window === 'undefined' ? undefined : window)
        return scope ? findMetaMaskProvider(scope) : undefined
      },
    })) as never,
    unstable_shimAsyncInject: 2000,
  }),
  injected({ unstable_shimAsyncInject: 2000 }),
  coinbaseWallet({ appName: 'Lantern' }),
]

const transports = { [sepolia.id]: http(RPC_URL) }

const wagmiConfig = createConfig(
  openfortConfigured
    ? getDefaultConfig({
        appName: 'Lantern',
        appDescription: 'Confidential prize savings on the Zama Protocol',
        appUrl: 'https://lantern-prize.vercel.app',
        chains: [sepolia],
        transports,
        connectors: lanternConnectors,
        // Targeted MetaMask above already reads EIP-6963. MIPD would add a second MetaMask row.
        multiInjectedProviderDiscovery: false,
      })
    : {
        chains: [sepolia],
        connectors: [injected()],
        transports,
      },
)

const sepoliaChain = {
  ...sepoliaFhe,
  network: RPC_URL,
} as const

const zamaConfig = createZamaConfig({
  chains: [sepoliaChain],
  wagmiConfig,
  relayers: { [sepoliaChain.id]: web() },
  runtime: { singleThread: true },
})

const queryClient = new QueryClient()

function SepoliaOnly() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  useEffect(() => {
    if (!isConnected || chainId === sepolia.id || isPending) return
    switchChain({ chainId: sepolia.id })
  }, [isConnected, chainId, isPending, switchChain])

  return null
}

function OpenfortTree({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <OpenfortWagmiBridge>
          <OpenfortProvider
            publishableKey={OPENFORT_PUBLISHABLE_KEY}
            walletConfig={{
              shieldPublishableKey: OPENFORT_SHIELD_KEY,
              passkeyDisplayName: 'Lantern',
              connectOnLogin: true,
              ethereum: {
                chainId: sepolia.id,
                rpcUrls: { [sepolia.id]: RPC_URL },
                accountType: AccountTypeEnum.DELEGATED_ACCOUNT,
                ...(OPENFORT_POLICY_ID
                  ? { ethereumFeeSponsorshipId: { [sepolia.id]: OPENFORT_POLICY_ID } }
                  : {}),
              },
            }}
            uiConfig={{
              appName: 'Lantern',
              theme: 'retro',
              mode: 'light',
              overlayBlur: 4,
              enforceSupportedChains: true,
              authProviders: [AuthProvider.EMAIL_OTP, AuthProvider.WALLET],
              funding: { targetChain: 'eip155:11155111' },
              walletRecovery: {
                defaultMethod: RecoveryMethod.PASSKEY,
                allowedMethods: [RecoveryMethod.PASSKEY, RecoveryMethod.PASSWORD],
              },
              customTheme: {
                '--ck-font-family': 'Archivo, sans-serif',
                '--ck-accent-color': '#ff6a00',
                '--ck-accent-text-color': '#ffffff',
                '--ck-body-background': '#f4f1ea',
                '--ck-body-color': '#0a0a0a',
                '--ck-border-radius': '0px',
              },
            }}
          >
            <ZamaProvider config={zamaConfig}>
              <SepoliaOnly />
              {children}
            </ZamaProvider>
          </OpenfortProvider>
        </OpenfortWagmiBridge>
      </WagmiProvider>
    </QueryClientProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  if (openfortConfigured) return <OpenfortTree>{children}</OpenfortTree>
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          <SepoliaOnly />
          {children}
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
