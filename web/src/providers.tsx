import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ZamaProvider } from '@zama-fhe/react-sdk'
import { createConfig as createZamaConfig } from '@zama-fhe/react-sdk/wagmi'
import { sepolia as sepoliaFhe } from '@zama-fhe/sdk/chains'
import { web } from '@zama-fhe/sdk/web'
import type { ReactNode } from 'react'
import { WagmiProvider, createConfig, http, injected } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { RPC_URL } from './config'

const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(RPC_URL) },
})

const sepoliaChain = {
  ...sepoliaFhe,
  network: RPC_URL,
} as const

const zamaConfig = createZamaConfig({
  chains: [sepoliaChain],
  wagmiConfig,
  relayers: { [sepoliaChain.id]: web() },
})

const queryClient = new QueryClient()

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
