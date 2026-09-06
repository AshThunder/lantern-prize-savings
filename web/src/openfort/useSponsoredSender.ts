import { use7702Authorization, useOpenfort } from '@openfort/react'
import { useEthereumEmbeddedWallet } from '@openfort/react/ethereum'
import { useCallback, useRef } from 'react'
import { recoverAddress, type Hex, type PublicClient } from 'viem'
import { sepolia } from 'wagmi/chains'
import { OPENFORT_POLICY_ID, OPENFORT_PUBLISHABLE_KEY } from '../config'
import {
  type Call,
  caliburImplementation,
  createSponsoredSender,
  type SponsoredSender,
  toCaliburSmartAccount,
} from './calibur'

/**
 * Returns `send(calls)`, which submits the calls as one sponsored UserOperation.
 *
 * The EIP-7702 authorization is attached only while the account still has no
 * code on-chain; after the first operation the delegation is installed.
 */
export function useSponsoredSender(publicClient: PublicClient | undefined) {
  const { client } = useOpenfort()
  const wallet = useEthereumEmbeddedWallet()
  const { signAuthorization } = use7702Authorization()
  const senderRef = useRef<{ address: Hex; sender: SponsoredSender } | null>(null)

  const address = wallet.status === 'connected' ? wallet.address : undefined

  return useCallback(
    async (calls: Call[]): Promise<Hex> => {
      if (!publicClient || !address) throw new Error('Wallet is not connected yet.')
      if (!OPENFORT_POLICY_ID) {
        throw new Error('VITE_OPENFORT_FEE_SPONSORSHIP_ID is required to sponsor transactions.')
      }
      if (!OPENFORT_PUBLISHABLE_KEY) {
        throw new Error('VITE_OPENFORT_PUBLISHABLE_KEY is required to sponsor transactions.')
      }

      const signHash = async (hash: Hex): Promise<Hex> => {
        const signature = (await client.embeddedWallet.signMessage(hash, {
          hashMessage: false,
          arrayifyMessage: false,
        })) as Hex
        const signer = await recoverAddress({ hash, signature })
        if (signer.toLowerCase() !== address.toLowerCase()) {
          throw new Error(
            `Signed with ${signer} but the operation is for ${address}. The active wallet changed — reconnect and try again.`,
          )
        }
        return signature
      }

      if (senderRef.current?.address !== address) {
        const account = await toCaliburSmartAccount({ client: publicClient, address, signHash })
        senderRef.current = {
          address,
          sender: createSponsoredSender({
            account,
            client: publicClient,
            publishableKey: OPENFORT_PUBLISHABLE_KEY,
            feeSponsorshipId: OPENFORT_POLICY_ID,
          }),
        }
      }
      const { sender } = senderRef.current

      const code = await publicClient.getCode({ address })
      if (code && code !== '0x') return sender.send(calls)

      const nonce = await publicClient.getTransactionCount({ address })
      const result = await signAuthorization({
        contractAddress: caliburImplementation(),
        chainId: sepolia.id,
        nonce,
      })
      if (result.status === 'error') throw new Error(result.error.shortMessage)
      return sender.send(calls, result.authorization)
    },
    [client, publicClient, address, signAuthorization],
  )
}
