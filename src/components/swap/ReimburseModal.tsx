import { Contract } from '@ethersproject/contracts'
import { RowBetween, RowCenter } from 'components/Row'
import JSBI from 'jsbi'
import { useEffect, useState } from 'react'
import { ExternalLink as LinkIcon } from 'react-feather'
import styled from 'styled-components/macro'
import { ThemedText } from 'theme'

import { useV2RouterContract, useVaultContract } from '../../hooks/useContract'
import { db, TxHistoryWithPendingTx } from '../../utils/db'
import { ButtonPrimary } from '../Button'
import { AutoColumn } from '../Column'
import Modal from '../Modal'

const Wrapper = styled.div`
  width: 100%;
  background: rgba(44, 47, 63);
  padding: 35px;
`
const Section = styled(AutoColumn)<{ inline?: boolean }>`
  padding: ${({ inline }) => (inline ? '0' : '0')};
`

export function ReimbursementModal({
  isOpen,
  historyId,
  onDismiss,
}: {
  isOpen: boolean
  historyId: number
  onDismiss: () => void
}) {
  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} maxHeight={90} width={500}>
      <ClaimReimbursement onDismiss={onDismiss} historyId={historyId} />
    </Modal>
  )
}

function ClaimReimbursement({ onDismiss, historyId }: { onDismiss: any; historyId: number }) {
  const routerContract = useV2RouterContract() as Contract
  const [tx, setTx] = useState<TxHistoryWithPendingTx | null>(null)

  useEffect(() => {
    const getTx = async () => {
      setTx(await db.getTxHistoryWithPendingTxById(historyId))
    }

    getTx()
  }, [historyId])

  const claim = async () => {
    if (tx) {
      await routerContract.reimbursement(tx.round, tx.order, tx.tx, tx.proofHash, tx.operatorSignature)
    }
  }

  return (
    <Wrapper>
      {tx && (
        <Section
          style={{
            position: 'relative',
          }}
        >
          <ThemedText.Black fontSize={32} fontWeight={600}>
            Claim reimbursement for this transaction?
          </ThemedText.Black>

          <ThemedText.Black fontSize={14} fontWeight={500} color={'#a8a8a8'} style={{ marginTop: '20px' }}>
            We will cover a fixed reimbursement for any completed transaction we identify as invalid behavior from an
            operator. You may claim this reimbursement at any time. If you would like to receive the reimbursement now,
            click <span style={{ fontWeight: 'bold', color: 'white' }}>Confirm Reimbursement.</span>{' '}
            <a href="">Learn more</a>
          </ThemedText.Black>
          <RowCenter
            style={{
              background: 'rgba(37,39,53)',
              textAlign: 'center',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '30px',
              marginBottom: '20px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ justifyContent: 'space-between', display: 'flex', flexDirection: 'row', width: '90%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'start', textAlign: 'start' }}>
                <ThemedText.Black fontSize={12} fontWeight={500} color={'#ffffFF'} style={{ paddingBottom: '8px' }}>
                  {'From'}
                </ThemedText.Black>
                <ThemedText.Black fontSize={18} fontWeight={600} color={'#ffffFF'}>
                  {tx.from.amount + tx.from.token}
                </ThemedText.Black>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'start', textAlign: 'start' }}>
                <ThemedText.Black fontSize={12} fontWeight={500} color={'#ffffFF'} style={{ paddingBottom: '8px' }}>
                  {'To'}
                </ThemedText.Black>
                <ThemedText.Black fontSize={18} fontWeight={600} color={'#ffffFF'}>
                  {tx.to.amount + tx.to.token}
                </ThemedText.Black>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'start', textAlign: 'start' }}>
                <ThemedText.Black fontSize={12} fontWeight={500} color={'#ffffFF'} style={{ paddingBottom: '8px' }}>
                  {'Total Reimbursement'}
                </ThemedText.Black>
                <ThemedText.Black fontSize={18} fontWeight={600} color={'#ffffFF'}>
                  {'0.12303 USDC'}
                </ThemedText.Black>
              </div>
            </div>
          </RowCenter>
          <RowBetween style={{ marginBottom: '10px' }}>
            <ThemedText.Black fontSize={14} fontWeight={400} color={'#ffffFF'}>
              Swap Date
            </ThemedText.Black>
            <ThemedText.Black fontSize={14} fontWeight={400} color={'#ffffFF'}>
              {new Date(tx.sendDate).toLocaleDateString()}
            </ThemedText.Black>
          </RowBetween>
          <RowBetween style={{ marginBottom: '10px' }}>
            <ThemedText.Black fontSize={14} fontWeight={400} color={'#ffffFF'}>
              Transaction Hash
            </ThemedText.Black>
            <ThemedText.Black fontSize={14} fontWeight={400} color={'#ffffFF'}>
              {tx.txId}
              <a href={''}>
                <LinkIcon size="12px" />
              </a>
            </ThemedText.Black>
          </RowBetween>
          <RowBetween style={{ marginBottom: '10px' }}>
            <ThemedText.Black fontSize={14} fontWeight={400} color={'#ffffFF'}>
              Reimburse To
            </ThemedText.Black>
            <ThemedText.Black fontSize={14} fontWeight={400} color={'#ffffFF'}>
              {tx.tx.txOwner}
            </ThemedText.Black>
          </RowBetween>
          <RowBetween style={{ marginTop: '40px' }}>
            <ButtonPrimary
              style={{
                background: 'transparent',
                height: '46px',
                borderRadius: '4px',
                width: '48%',
                border: '1px solid',
                borderColor: 'white',
              }}
              onClick={() => onDismiss}
            >
              Go back
            </ButtonPrimary>
            <ButtonPrimary
              style={{
                background: 'transparent',
                height: '46px',
                borderRadius: '4px',
                width: '48%',
                border: '1px solid',
                borderColor: 'white',
              }}
              onClick={() => claim}
            >
              Confirm
            </ButtonPrimary>
          </RowBetween>
        </Section>
      )}
    </Wrapper>
  )
}

function ReimbursementDetails({ onDismiss, historyId }: { onDismiss: () => void; historyId: number }) {
  // const routerContract = useV2RouterContract() as Contract
  const vaultContract = useVaultContract() as Contract
  const [tx, setTx] = useState<TxHistoryWithPendingTx | null>(null)
  const [reimburseAmount, setReimburseAmount] = useState('0')

  useEffect(() => {
    const getTx = async () => {
      setTx(await db.getTxHistoryWithPendingTxById(historyId))
    }

    getTx()
  }, [historyId])

  useEffect(() => {
    const getAmount = async () => {
      const amount = await vaultContract.getReImbursementAmount()
      const decimal = 18
      setReimburseAmount(JSBIDivide(JSBI.BigInt(amount), JSBI.BigInt(decimal), 6))
    }
    getAmount()
  }, [vaultContract])

  return (
    <Wrapper>
      {tx && (
        <Section
          style={{
            position: 'relative',
          }}
        >
          <RowCenter>
            <ThemedText.Black fontSize={24} fontWeight={600}>
              Reimbursement Details
            </ThemedText.Black>
          </RowCenter>

          <div style={{ margin: '50px 0px' }}>
            <div style={{ padding: '8px 0px' }}>
              <ThemedText.Black fontSize={12} fontWeight={400} color={'#8BB3FF'}>
                Date
              </ThemedText.Black>
              <ThemedText.Black fontSize={16} fontWeight={400} color={'#dddddd'}>
                {new Date(tx.sendDate).toLocaleDateString()}
              </ThemedText.Black>
            </div>
            <div style={{ padding: '8px 0px' }}>
              <ThemedText.Black fontSize={12} fontWeight={400} color={'#8BB3FF'}>
                Amount
              </ThemedText.Black>
              <ThemedText.Black fontSize={16} fontWeight={400} color={'#dddddd'}>
                {reimburseAmount + 'MATIC'}
              </ThemedText.Black>
            </div>
            <div style={{ padding: '8px 0px' }}>
              <ThemedText.Black fontSize={12} fontWeight={400} color={'#8BB3FF'}>
                Reimburse To
              </ThemedText.Black>
              <ThemedText.Black fontSize={16} fontWeight={400} color={'#dddddd'}>
                {tx.tx.txOwner}
              </ThemedText.Black>
            </div>
            <div style={{ padding: '8px 0px' }}>
              <ThemedText.Black fontSize={12} fontWeight={400} color={'#8BB3FF'}>
                Transaction Hash
              </ThemedText.Black>
              <ThemedText.Black fontSize={16} fontWeight={400} color={'#dddddd'}>
                {tx.txId}
                <a href={'https://'}>
                  <LinkIcon size="12px" />
                </a>
              </ThemedText.Black>
            </div>
          </div>
          <RowCenter>
            <ButtonPrimary
              style={{
                background: '#1B1E2D',
                height: '46px',
                borderRadius: '23px',
                width: '90%',
              }}
              onClick={() => onDismiss()}
            >
              Close
            </ButtonPrimary>
          </RowCenter>
        </Section>
      )}
    </Wrapper>
  )
}

function JSBIDivide(numerator: JSBI, denominator: JSBI, precision: number) {
  // if (precision < 0) return Error('precision must bigger than 0')
  // if (denominator === JSBI.BigInt(0)) return Error('divide by zero')

  const division = JSBI.divide(numerator, denominator).toString()
  let remain = JSBI.remainder(numerator, denominator).toString()

  remain = remain.length > precision ? remain.substring(0, precision) : remain

  return division + '.' + remain
}
