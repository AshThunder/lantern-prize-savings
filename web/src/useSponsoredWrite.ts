import { useState } from 'react'
import { type Abi, type Address, type Hex } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { isOpenfortConnector, openfortConfigured, openfortGasless } from './config'
import { toCall } from './openfort/calibur'
import { useSponsoredSender } from './openfort/useSponsoredSender'

/** EIP-7825 per-tx cap. MetaMask still defaults failed estimates to 21M. */
const TX_GAS_CAP = 16_777_216n

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

function useInjectedSponsoredWrite() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()

  async function write(params: WriteArgs): Promise<Hex> {
    if (params.functionName === 'approve') {
      return writeContractAsync({ ...params, gas: 100_000n } as never)
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

  async function writeBatch(calls: WriteArgs[]): Promise<Hex> {
    let last: Hex = '0x'
    for (const call of calls) {
      last = await write(call)
    }
    return last
  }

  async function faucet(_address: Address, fallback: () => Promise<Hex>): Promise<Hex> {
    return fallback()
  }

  return { write, writeBatch, faucet, isPending, openfortSponsored: false }
}

function useOpenfortSponsoredWrite() {
  const { connector } = useAccount()
  const publicClient = usePublicClient()
  const send = useSponsoredSender(publicClient)
  const injected = useInjectedSponsoredWrite()
  const [pending, setPending] = useState(false)
  const openfortWallet = isOpenfortConnector(connector)
  const openfortSponsored = openfortWallet && openfortGasless

  async function write(params: WriteArgs): Promise<Hex> {
    if (!openfortSponsored) return injected.write(params)
    setPending(true)
    try {
      return await send([
        toCall({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
        }),
      ])
    } finally {
      setPending(false)
    }
  }

  async function writeBatch(calls: WriteArgs[]): Promise<Hex> {
    if (!openfortSponsored) return injected.writeBatch(calls)
    setPending(true)
    try {
      return await send(
        calls.map((params) =>
          toCall({
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            args: params.args,
          }),
        ),
      )
    } finally {
      setPending(false)
    }
  }

  async function faucet(_address: Address, fallback: () => Promise<Hex>): Promise<Hex> {
    return fallback()
  }

  return {
    write,
    writeBatch,
    faucet,
    isPending: pending || injected.isPending,
    openfortSponsored,
  }
}

/** `openfortConfigured` is fixed for the lifetime of the bundle. */
export function useSponsoredWrite() {
  if (openfortConfigured) return useOpenfortSponsoredWrite()
  return useInjectedSponsoredWrite()
}
