/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POOL_ADDRESS?: string
  readonly VITE_USDT_ADDRESS?: string
  readonly VITE_CUSDT_ADDRESS?: string
  readonly VITE_NFT_ADDRESS?: string
  readonly VITE_HOOK_ADDRESS?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_OPENFORT_PUBLISHABLE_KEY?: string
  readonly VITE_OPENFORT_SHIELD_KEY?: string
  readonly VITE_OPENFORT_FEE_SPONSORSHIP_ID?: string
  readonly VITE_FORWARDER_ADDRESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
