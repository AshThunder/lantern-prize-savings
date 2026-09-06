import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  AccountTypeEnum,
  AuthProvider,
  OpenfortProvider,
  RecoveryMethod,
} from '@openfort/react'
import { getDefaultConfig, OpenfortWagmiBridge } from '@openfort/react/wagmi'
import { ZamaProvider } from '@zama-fhe/react-sdk'
import { createConfig as createZamaConfig } from '@zama-fhe/react-sdk/wagmi'
import { sepolia as sepoliaFhe } from '@zama-fhe/sdk/chains'
import { web } from '@zama-fhe/sdk/web'
import { type ReactNode } from 'react'
import { fallback } from 'viem'
import { WagmiProvider, createConfig, http, injected } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import {
  OPENFORT_POLICY_ID,
  OPENFORT_PUBLISHABLE_KEY,
  OPENFORT_SHIELD_KEY,
  RPC_URL,
  openfortConfigured,
} from './config'

function publicAppUrl() {
  if (typeof window === 'undefined') return 'https://laternpool.xyz'
  const { origin } = window.location
  // Openfort rejects 127.0.0.1 even when localhost is allowlisted.
  if (origin.startsWith('http://127.0.0.1')) return 'http://localhost:5173'
  return origin
}

const transports = {
  [sepolia.id]: fallback([
    http(RPC_URL),
    http('https://rpc.sepolia.org'),
    http('https://1rpc.io/sepolia'),
  ]),
}

const wagmiConfig = createConfig(
  openfortConfigured
    ? getDefaultConfig({
        appName: 'Lantern',
        appDescription: 'Confidential prize savings on the Zama Protocol',
        appUrl: publicAppUrl(),
        chains: [sepolia],
        transports,
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
            <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
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
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
