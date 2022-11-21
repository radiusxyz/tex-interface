import { BigNumber } from '@ethersproject/bignumber'
import { Signature, splitSignature } from '@ethersproject/bytes'
import { Contract } from '@ethersproject/contracts'
import { keccak256 } from '@ethersproject/keccak256'
import { JsonRpcProvider } from '@ethersproject/providers'
import { recoverAddress } from '@ethersproject/transactions'
import { serialize } from '@ethersproject/transactions'
import { Trade } from '@uniswap/router-sdk'
import { Currency, Percent, TradeType } from '@uniswap/sdk-core'
import { Trade as V2Trade } from '@uniswap/v2-sdk'
import { Trade as V3Trade } from '@uniswap/v3-sdk'
import { domain, DOMAIN_TYPE, SWAP_TYPE } from 'constants/eip712'
import { hashMessage, solidityKeccak256 } from 'ethers/lib/utils'
import { SwapCall } from 'hooks/useSwapCallArguments'
import localForage from 'localforage'
import { useMemo } from 'react'
import { useAppDispatch } from 'state/hooks'
import {
  fetchEncryptionParam,
  fetchEncryptionProverKey,
  fetchEncryptionVerifierData,
  fetchVdfParam,
  fetchVdfSnarkParam,
} from 'state/parameters/fetch'
import {
  ParameterState,
  setEncryptionParam,
  setEncryptionProverKey,
  setEncryptionVerifierData,
  setProgress,
  setVdfParam,
  setVdfSnarkParam,
  VdfParam,
} from 'state/parameters/reducer'
import { swapErrorToUserReadableMessage } from 'utils/swapErrorToUserReadableMessage'
import { poseidonEncryptWithTxHash } from 'wasm/encrypt'
import { getVdfProof } from 'wasm/vdf'

import { useRecorderContract, useV2RouterContract } from '../../../hooks/useContract'

type AnyTrade =
  | V2Trade<Currency, Currency, TradeType>
  | V3Trade<Currency, Currency, TradeType>
  | Trade<Currency, Currency, TradeType>

export interface TxInfo {
  tx_owner: string
  function_selector: string
  amount_in: string
  amount_out: string
  to: string
  deadline: string
  nonce: string
  path: string[] // length MUST be 6 -> for compatibility with rust-wasm
}

const MAXIMUM_PATH_LENGTH = 6

interface EncryptedSwapTx {
  txOwner: string
  functionSelector: string
  amountIn: string
  amountOut: string
  path: Path
  to: string
  nonce: number
  deadline: number
  txId: string
}

interface Path {
  message_length: number
  nonce: string
  commitment: string
  cipher_text: string[]
  r1: string
  r3: string
  s1: string
  s3: string
  k: string
  vdf_snark_proof: string
  encryption_proof: string
}

export interface RadiusSwapRequest {
  sig: Signature
  encryptedSwapTx: EncryptedSwapTx
}

export interface RadiusSwapResponse {
  data: {
    round: number
    order: number
    mmr_size: number
    proof: string[]
    hash: string
    txId: string
  }
  msg: string
}

const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' })

const swapExactTokensForTokens = '0x38ed1739'

// returns a function that will execute a swap, if the parameters are all valid
export default function useSendSwapTransaction(
  account: string | null | undefined,
  chainId: number | undefined,
  library: JsonRpcProvider | undefined,
  trade: AnyTrade | undefined, // trade to execute, required
  swapCalls: Promise<SwapCall[]>,
  deadline: BigNumber | undefined,
  allowedSlippage: Percent,
  parameters: ParameterState,
  sigHandler: () => void
): { callback: null | (() => Promise<RadiusSwapResponse>) } {
  // console.log(parameters)
  const dispatch = useAppDispatch()

  const routerContract = useV2RouterContract() as Contract
  const recorderContract = useRecorderContract() as Contract

  return useMemo(() => {
    if (!trade || !library || !account || !chainId) {
      return { callback: null }
    }
    return {
      callback: async function onSwap(): Promise<RadiusSwapResponse> {
        let vdfParam: VdfParam | null = await localForage.getItem('vdf_param')
        let vdfSnarkParam: string | null = await localForage.getItem('vdf_snark_param')
        let encryptionParam: string | null = await localForage.getItem('encryption_param')
        let encryptionProverKey: string | null = await localForage.getItem('encryption_prover_key')
        let encryptionVerifierData: string | null = await localForage.getItem('encryption_verifier_data')

        // if save flag is false or getItem result is null
        if (!parameters.vdfParam || !vdfParam) {
          vdfParam = await fetchVdfParam((newParam: boolean) => {
            dispatch(setVdfParam({ newParam }))
          })
        }

        if (!parameters.vdfSnarkParam || !vdfSnarkParam) {
          vdfSnarkParam = await fetchVdfSnarkParam((newParam: boolean) => {
            dispatch(setVdfSnarkParam({ newParam }))
          })
        }

        if (!parameters.encryptionParam || !encryptionParam) {
          encryptionParam = await fetchEncryptionParam((newParam: boolean) => {
            dispatch(setEncryptionParam({ newParam }))
          })
        }

        if (!parameters.encryptionProverKey || !encryptionProverKey) {
          encryptionProverKey = await fetchEncryptionProverKey((newParam: boolean) => {
            dispatch(setEncryptionProverKey({ newParam }))
          })
        }

        if (!parameters.encryptionVerifierData || !encryptionVerifierData) {
          encryptionVerifierData = await fetchEncryptionVerifierData((newParam: boolean) => {
            dispatch(setEncryptionVerifierData({ newParam }))
          })
        }

        const resolvedCalls = await swapCalls
        const { address, deadline, amountIn, amountOut, path, idPath } = resolvedCalls[0]

        const signer = library.getSigner()
        const signAddress = await signer.getAddress()

        // TODO: 한 round에 2개의 tx를 날리면 contract에서 가져오지 않고 nonce값을 ++ 해야 한다.
        const _txNonce = await routerContract.nonces(signAddress)
        const txNonce = BigNumber.from(_txNonce).toNumber()

        console.log('nonce from contract', txNonce)

        const signMessage = {
          txOwner: signAddress,
          functionSelector: swapExactTokensForTokens,
          amountIn: `${amountIn}`,
          amountOut: `${amountOut}`,
          path,
          to: signAddress,
          nonce: txNonce,
          deadline,
        }

        const pathToHash: string[] = new Array(MAXIMUM_PATH_LENGTH)

        for (let i = 0; i < MAXIMUM_PATH_LENGTH; i++) {
          pathToHash[i] = i < path.length ? path[i].split('x')[1] : '0'
        }

        const txInfoToHash: TxInfo = {
          tx_owner: signAddress.split('x')[1],
          function_selector: swapExactTokensForTokens.split('x')[1],
          amount_in: `${amountIn}`,
          amount_out: `${amountOut}`,
          to: signAddress.split('x')[1],
          deadline: `${deadline}`,
          nonce: `${txNonce}`,
          path: pathToHash,
        }

        console.log('txInfoToHash: ', txInfoToHash)

        const typedData = JSON.stringify({
          types: {
            EIP712Domain: DOMAIN_TYPE,
            Swap: SWAP_TYPE,
          },
          primaryType: 'Swap',
          domain: domain(chainId),
          message: signMessage,
        })

        dispatch(setProgress({ newParam: 1 }))

        const sig = await signWithEIP712(library, signAddress, typedData)

        console.log(sig)

        const txId = solidityKeccak256(
          ['address', 'bytes4', 'uint256', 'uint256', 'address[]', 'address', 'uint256', 'uint256'],
          [
            account.toLowerCase(),
            swapExactTokensForTokens,
            `${amountIn}`,
            `${amountOut}`,
            path,
            account.toLowerCase(),
            `${txNonce}`,
            `${deadline}`,
          ]
        )

        const params = [txId]
        const action = 'cancelTxId'
        const unsignedTx = await recorderContract.populateTransaction[action](...params)
        console.log('unsignedTx', unsignedTx)

        // const gasPrice = await signer.getGasPrice()
        const nonce = await signer.provider.getTransactionCount(signAddress)

        // TODO: get Gas Data from gas tracker
        unsignedTx.gasLimit = BigNumber.from('50000')
        // unsignedTx.gasPrice = BigNumber.from('1000000000')
        unsignedTx.maxFeePerGas = BigNumber.from('5000')
        unsignedTx.maxPriorityFeePerGas = BigNumber.from('5000')
        unsignedTx.nonce = nonce
        console.log('unsignedTx2', unsignedTx)

        const tx = {
          nonce: unsignedTx.nonce,
          gasLimit: unsignedTx.gasLimit.toHexString(),
          // gasPrice: unsignedTx.gasPrice.toHexString(),
          maxFeePerGas: unsignedTx.maxFeePerGas.toHexString(),
          maxPriorityFeePerGas: unsignedTx.maxPriorityFeePerGas.toHexString(),
          to: unsignedTx.to,
          data: unsignedTx.data,
          chainId,
          type: 2,
        }

        console.log('tx', tx)

        const sign = await signer.provider
          .send('eth_sign', [signAddress, keccak256(serialize(tx))])
          .then((response) => {
            console.log(response)
            const sig = splitSignature(response)
            return sig
          })
          .catch((error) => {
            // if the user rejected the sign, pass this along
            if (error?.code === 401) {
              throw new Error(`Sign rejected.`)
            } else {
              // otherwise, the error was unexpected and we need to convey that
              console.error(`Sign failed`, error, signAddress, typedData)

              throw new Error(`Sign failed: ${swapErrorToUserReadableMessage(error)}`)
            }
          })
        console.log(sign)

        sigHandler()

        const cancelTx = serialize(tx, sign)

        console.log('cancelTx', cancelTx)
        console.log(signer, signAddress)

        dispatch(setProgress({ newParam: 2 }))

        const vdfData = await getVdfProof(vdfParam, vdfSnarkParam)

        console.log(vdfData)

        dispatch(setProgress({ newParam: 3 }))

        const encryptData = await poseidonEncryptWithTxHash(
          txInfoToHash,
          encryptionParam,
          encryptionProverKey,
          encryptionVerifierData,
          vdfData.s2_string,
          vdfData.s2_field_hex,
          vdfData.commitment_hex,
          idPath
        )

        console.log(encryptData)

        dispatch(setProgress({ newParam: 4 }))

        const encryptedPath = {
          message_length: encryptData.message_length,
          nonce: encryptData.nonce,
          commitment: vdfData.commitment_hex,
          cipher_text: [encryptData.cipher_text],
          r1: vdfData.r1,
          r3: vdfData.r3,
          s1: vdfData.s1,
          s3: vdfData.s3,
          k: vdfData.k,
          vdf_snark_proof: vdfData.vdf_snark_proof,
          encryption_proof: encryptData.proof,
        }

        const encryptedSwapTx: EncryptedSwapTx = {
          txOwner: signAddress,
          functionSelector: swapExactTokensForTokens,
          amountIn: `${amountIn}`,
          amountOut: `${amountOut}`,
          path: encryptedPath,
          to: signAddress,
          nonce: txNonce,
          deadline,
          txId,
        }

        const sendResponse = await sendEIP712Tx(chainId, routerContract, encryptedSwapTx, sig, cancelTx, library)

        dispatch(setProgress({ newParam: 5 }))

        console.log('sendResponse', sendResponse)

        const finalResponse: RadiusSwapResponse = {
          data: sendResponse.data,
          msg: sendResponse.msg,
        }
        return finalResponse
      },
    }
  }, [trade, library, account, chainId, parameters, swapCalls, sigHandler, dispatch])
}

async function signWithEIP712(library: JsonRpcProvider, signAddress: string, typedData: string): Promise<Signature> {
  const signer = library.getSigner()
  const sig = await signer.provider
    .send('eth_signTypedData_v4', [signAddress, typedData])
    .then((response) => {
      console.log('signed', response)
      const sig = splitSignature(response)
      return sig
    })
    .catch((error) => {
      // if the user rejected the sign, pass this along
      if (error?.code === 401) {
        throw new Error(`Sign rejected.`)
      } else {
        // otherwise, the error was unexpected and we need to convey that
        console.error(`Sign failed`, error, signAddress, typedData)

        throw new Error(`Sign failed: ${swapErrorToUserReadableMessage(error)}`)
      }
    })

  return sig
}

async function sendEIP712Tx(
  chainId: number,
  routerContract: Contract,
  encryptedSwapTx: EncryptedSwapTx,
  signature: Signature,
  cancelTx: string,
  library: JsonRpcProvider | undefined
): Promise<RadiusSwapResponse> {
  const timeLimit = setTimeout(async () => {
    const res = await library?.getSigner().provider.sendTransaction(cancelTx)
    console.log(res)
  }, 5000)

  console.log('set timeout')

  const sendResponse = await fetch(`${process.env.REACT_APP_360_OPERATOR}/tx`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      chainId,
      routerAddress: routerContract.address,
      encryptedSwapTx,
      signature: {
        r: `${signature.r}`,
        s: `${signature.s}`,
        v: `${signature.v}`,
      },
    }),
  })
    .then(async (res) => res.json())
    .then(async (res) => {
      console.log('jsoned response', res)

      const signature = {
        r: res.signature.r,
        s: res.signature.s,
        v: res.signature.v,
      }

      delete res.signature

      const verifySigner = recoverAddress(hashMessage(JSON.stringify(res)), signature)
      const operatorAddress = await routerContract.operator()

      console.log('operatorAddress from router', operatorAddress)

      if (verifySigner === operatorAddress && encryptedSwapTx.txId === res.txId) {
        // '0x01D5fb852a8107be2cad72dFf64020b22639e18B'
        console.log('clear cancel tx')
        clearTimeout(timeLimit)
      }

      return {
        data: res,
        msg: '화이팅!!!!',
      }
    })
    .catch((error) => {
      console.error(error)
      throw new Error(`Send failed: ${swapErrorToUserReadableMessage(error)}`)
    })

  return sendResponse
}
