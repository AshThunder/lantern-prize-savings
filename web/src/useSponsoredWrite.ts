import { type Abi, type Address, type Hex } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'

/** EIP-7825 per-tx cap. MetaMask still defaults failed estimates to 21M. */
const TX_GAS_CAP = 16_777_216n
/** Paymaster-friendly ceiling. Do not send the MetaMask 16.7M cap to Openfort. */
const OPENFORT_GAS_CAP = 2_000_000n
const OPENFORT_GAS_FALLBACK = 400_000n

type WriteArgs = {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

function errorText(err: unknown): string {
  if (err == null) return ''
  if (typeof err !== 'object') return String(err)
  const o = err as { shortMessage?: string; message?: string; cause?: unknown }
  return [o.shortMessage, o.message, errorText(o.cause)].filter(Boolean).join(' ')
}

function isExecutionRevert(err: unknown): boolean {
  const text = errorText(err)
  return /reverted|execution reverted|ERC20|insufficient|allowance|DrawInProgress|AmountZero|Ownable/i.test(
    text,
  )
}

export function useSponsoredWrite() {
  const { address, connector } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const openfortWallet = connector?.id === 'xyz.openfort'

  async function write(params: WriteArgs): Promise<Hex> {
    // Tether-style USDT reverts estimateGas when changing a non-zero allowance.
    // Send a small fixed limit so Approve actually reaches MetaMask.
    if (params.functionName === 'approve') {
      return writeContractAsync({ ...params, gas: 100_000n } as never)
    }

    if (openfortWallet) {
      // Estimate on the public RPC so wagmi does not call Openfort eth_estimateGas
      // (another ~30s UserOp) before the real send. That delay drops the passkey.
      let gas = OPENFORT_GAS_FALLBACK
      if (publicClient && address) {
        try {
          const estimate = await publicClient.estimateContractGas({
            address: params.address,
            abi: params.abi,
            functionName: params.functionName as never,
            args: params.args as never,
            account: address,
          })
          const buffered = (estimate * 150n) / 100n
          gas = buffered > OPENFORT_GAS_CAP ? OPENFORT_GAS_CAP : buffered
        } catch (err) {
          if (isExecutionRevert(err)) throw err
          gas = OPENFORT_GAS_CAP
        }
      }
      return writeContractAsync({ ...params, gas } as never)
    }

    let gas = TX_GAS_CAP
    if (publicClient && address) {
      try {
        const estimate = await publicClient.estimateContractGas({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName as never,
          args: params.args as never,
          account: address,
        })
        const buffered = (estimate * 120n) / 100n
        gas = buffered > TX_GAS_CAP ? TX_GAS_CAP : buffered
      } catch (err) {
        if (isExecutionRevert(err)) throw err
      }
    }

    return writeContractAsync({ ...params, gas } as never)
  }

  async function faucet(_address: Address, fallback: () => Promise<Hex>): Promise<Hex> {
    return fallback()
  }

  return { write, faucet, isPending }
}
