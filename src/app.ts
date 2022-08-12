import { Bech32 } from '@cosmjs/encoding'
import { QueryClient, setupDistributionExtension, setupStakingExtension, coin } from '@cosmjs/stargate'
import { Tendermint34Client } from '@cosmjs/tendermint-rpc'
import { median } from 'mathjs'
import { writeFileSync } from 'fs'
import { DelegationResponse, Validator } from 'cosmjs-types/cosmos/staking/v1beta1/staking'
import { BondStatusString } from '@cosmjs/stargate/build/queries/staking'
import * as configuration from '../data/configuration.json'

// Configuration
const rpcUrl = 'https://emoney.validator.network'
const treasuryAddress = 'emoney1cpfn66xumevrx755m4qxgezw9j5s86qkan5ch8'
const ungm = 1000000
const scaling = 0.5
const medianDelegation = scaling * 500000 * ungm
const maximumBaselineDelegation = scaling * 750000 * ungm
const maximumSelfDelegationBonus = scaling * 500000 * ungm
const maximumCommunityDelegationBonus = scaling * 250000 * ungm
const minimumExternalDelegations = 3000 * ungm
const minimumCommission = 0.05
const selfDelegationMultiplier = 2
const commissionFraction = 1000000000000000000

class Delegations {
  numDelegators: number
  selfDelegation: number
  treasuryDelegation: number
  projectDelegation: number
  communityDelegation: number
  totalDelegation: number
}

class Target {
  enabled: boolean
  moniker: string
  operatorAddress: string
  commission: number
  currentDelegations: Delegations
  baseDelegation: number
  selfDelegationBonus: number
  communityDelegationBonus: number
  totalDelegation: number
}

function includeValidator(validator: Validator): boolean {
  if (validator.jailed) return false
  return configuration.validatorWhitelist.includes(validator.operatorAddress)
}

function getMedianCommission(validators: Validator[]): number {
  const commissions: number[] = []
  for (const validator of validators) {
    const commission = Number(validator.commission.commissionRates.rate) / commissionFraction
    if (includeValidator(validator) && commission >= minimumCommission) {
      commissions.push(commission)
    }
  }
  return median(commissions)
}

async function getPaginatedDelegations(client, validatorAddress: string): Promise<DelegationResponse[]> {
  let response = await client.staking.validatorDelegations(validatorAddress)
  let result: DelegationResponse[] = response.delegationResponses
  while (response.pagination.nextKey.length > 0) {
    response = await client.staking.validatorDelegations(validatorAddress, response.pagination.nextKey)
    result = result.concat(response.delegationResponses)
  }
  return result
}

async function getDelegations(client, validatorAddress: string): Promise<Delegations> {
  const projectAddresses = [
    treasuryAddress,
    'emoney10r47ldzrc2nj6p85cg9hfy3q7d6ce5870qfc3y',
    'emoney12lceurdvgj0qr4kldwakjc8cvap6t4049jwtmc',
    'emoney1hdv69euvy9d6krkrky6c9ngg00jglra89chkld',
    'emoney1cpfn66xumevrx755m4qxgezw9j5s86qkan5ch8',
    'emoney1glwrypvl8ulz80n9z2gk6ey2dxey2vncfpd6s4',
    'emoney13dpmrp5sppqdrkry6jyy8clj3ts0923n6wqgng',
    'emoney1hzeue94rtumz7adxedds7sh56guhyv4tuvmek9'
  ]

  const result: Delegations = {
    numDelegators: 0,
    selfDelegation: 0,
    treasuryDelegation: 0,
    projectDelegation: 0,
    communityDelegation: 0,
    totalDelegation: 0
  }

  const selfDelegationAddress = Bech32.encode('emoney', Bech32.decode(validatorAddress).data)
  const delegationResponses = await getPaginatedDelegations(client, validatorAddress)
  result.numDelegators = delegationResponses.length
  for (const delegationResponse of delegationResponses) {
    result.totalDelegation += Number(delegationResponse.balance.amount)

    // Classify delegation
    if (selfDelegationAddress === delegationResponse.delegation.delegatorAddress) {
      result.selfDelegation += Number(delegationResponse.balance.amount)
    } else if (treasuryAddress === delegationResponse.delegation.delegatorAddress) {
      result.treasuryDelegation += Number(delegationResponse.balance.amount)
    } else if (projectAddresses.includes(delegationResponse.delegation.delegatorAddress)) {
      result.projectDelegation += Number(delegationResponse.balance.amount)
    } else {
      result.communityDelegation += Number(delegationResponse.balance.amount)
    }
  }
  return result
}

async function createTargets(client, validators: Validator[]): Promise<Target[]> {
  const medianCommission = getMedianCommission(validators)
  console.log(`Median commission: ${medianCommission}`)
  const result: Target[] = []
  for (const validator of validators) {
    const commission = Number(validator.commission.commissionRates.rate) / commissionFraction
    const currentDelegations = await getDelegations(client, validator.operatorAddress)
    const externalDelegations = currentDelegations.totalDelegation - currentDelegations.treasuryDelegation

    let enabled = true
    if (!includeValidator(validator)) {
      // console.log(`Skipping: ${validator.description.moniker} (${validator.operatorAddress})`)
      enabled = false
    } else if (externalDelegations < minimumExternalDelegations) {
      console.log(`Below minimum external delegations: ${validator.description.moniker} (${validator.operatorAddress}) @ ${(externalDelegations / ungm).toFixed(0)} NGM`)
      enabled = false
    } else if (commission < minimumCommission) {
      console.log(`Below minimum commission: ${validator.description.moniker} (${validator.operatorAddress}) @ ${(100 * commission).toFixed(2)}%`)
      enabled = false
    }

    const commissionAdjustment = medianCommission / commission
    const baseDelegation = enabled ? Math.min(maximumBaselineDelegation, Math.round(commissionAdjustment * medianDelegation)) : 0
    const selfDelegationBonus = enabled ? Math.min(maximumSelfDelegationBonus, Math.round(currentDelegations.selfDelegation * selfDelegationMultiplier)) : 0
    const communityDelegationBonus = enabled ? Math.min(maximumCommunityDelegationBonus, currentDelegations.communityDelegation) : 0
    const totalDelegation = baseDelegation + selfDelegationBonus + communityDelegationBonus

    result.push({
      enabled,
      moniker: validator.description.moniker,
      operatorAddress: validator.operatorAddress,
      commission,
      currentDelegations,
      baseDelegation,
      selfDelegationBonus,
      communityDelegationBonus,
      totalDelegation
    })
  }

  result.sort(function (left, right) {
    return left.moniker.localeCompare(right.moniker)
  })

  console.log(`Targets: ${result.length}`)
  return result
}

async function getPaginatedDelegatorDelegations(client, delegatorAddress: string): Promise<DelegationResponse[]> {
  let response = await client.staking.delegatorDelegations(delegatorAddress)
  let result: DelegationResponse[] = response.delegationResponses
  while (response.pagination.nextKey.length > 0) {
    response = await client.staking.delegatorDelegations(delegatorAddress, response.pagination.nextKey)
    result = result.concat(response.delegationResponses)
  }
  return result
}

async function createMessages(client, targets: Target[]): Promise<any[]> {
  const result = []
  const delegationResponses = await getPaginatedDelegatorDelegations(client, treasuryAddress)

  // Adjust existing delegations
  for (const delegationResponse of delegationResponses) {
    const target = targets.find(item => item.operatorAddress === delegationResponse.delegation.validatorAddress)
    const targetDelegation = target ? target.totalDelegation : 0
    const deltaDelegation = targetDelegation - Number(delegationResponse.balance.amount)
    if (Math.abs(deltaDelegation) < ungm) continue
    if (deltaDelegation > 0) {
      const msg = {
        '@type': '/cosmos.staking.v1beta1.MsgDelegate',
        delegator_address: treasuryAddress,
        validator_address: delegationResponse.delegation.validatorAddress,
        amount: coin(deltaDelegation, 'ungm')
      }
      result.push(msg)
    } else if (deltaDelegation < 0) {
      const msg = {
        '@type': '/cosmos.staking.v1beta1.MsgUndelegate',
        delegator_address: treasuryAddress,
        validator_address: delegationResponse.delegation.validatorAddress,
        amount: coin(-deltaDelegation, 'ungm')
      }
      result.push(msg)
    }
  }

  // Add new delegations
  for (const target of targets) {
    const delegation = delegationResponses.find(item => item.delegation.validatorAddress === target.operatorAddress)
    if (!delegation && target.enabled) {
      const msg = {
        '@type': '/cosmos.staking.v1beta1.MsgDelegate',
        delegator_address: treasuryAddress,
        validator_address: target.operatorAddress,
        amount: coin(target.totalDelegation, 'ungm')
      }
      result.push(msg)
    }
  }
  return result
}

async function writeTransactionsBatch(messages: any[], batchId: number) {
  const fileName = `treasury-delegations-${batchId}.json`
  const gasEstimate = messages.length * 500000
  const gasPrice = 1

  const transaction = {
    body: {
      messages,
      memo: 'Treasury Delegations',
      timeoutHeight: 0,
      extensionOptions: [],
      nonCriticalExtensionOptions: []
    },
    authInfo: {
      fee: {
        amount: [
          {
            denom: 'ungm',
            amount: (gasEstimate * gasPrice).toFixed(0)
          }
        ],
        gasLimit: gasEstimate,
        payer: '',
        granter: ''
      },
      signerInfos: []
    },
    signatures: []
  }

  const buffer = JSON.stringify(transaction, null, 2)
  writeFileSync(fileName, buffer)
}

function writeTransactions(messages: any[]) {
  let batchNumber = 0
  let batchMessages = []
  for (const message of messages) {
    batchMessages.push(message)
    if (batchMessages.length === 30) {
      writeTransactionsBatch(batchMessages, ++batchNumber)
      batchMessages = []
    }
  }
  if (messages.length > 0) {
    writeTransactionsBatch(batchMessages, ++batchNumber)
  }
}

function writeCsv(targets: Target[], fileName: string) {
  let currentTotalDelegations = 0
  let updatedTotalDelegations = 0
  let currentTreasuryDelegations = 0
  let updatedTreasuryDelegations = 0
  for (const target of targets) {
    currentTotalDelegations += target.currentDelegations.totalDelegation
    currentTreasuryDelegations += target.currentDelegations.treasuryDelegation
    updatedTotalDelegations += target.currentDelegations.totalDelegation - target.currentDelegations.treasuryDelegation + target.totalDelegation
    updatedTreasuryDelegations += target.totalDelegation
  }
  console.dir({ currentTotalDelegations, updatedTotalDelegations, currentTreasuryDelegations, updatedTreasuryDelegations })

  let buffer = 'Moniker,OperatorAddress,Commission,Number of Delegations,Current Self Delegation,Current Treasury Delegation,Current Project Delegation,Current Community Delegation,New Base Delegation,Self Delegation Bonus,Community Delegation Bonus,Total Delegation,Current Voting Power,Updated Voting Power,Delta Voting Power\n'
  for (const target of targets) {
    if (!target.enabled) continue
    const currentVotingPower = target.currentDelegations.totalDelegation / currentTotalDelegations
    const updatedVotingPower = (target.totalDelegation + target.currentDelegations.selfDelegation + target.currentDelegations.projectDelegation + target.currentDelegations.communityDelegation) / updatedTotalDelegations
    const deltaVotingPower = updatedVotingPower - currentVotingPower
    buffer += target.moniker + ',' +
      target.operatorAddress + ',' +
      target.commission.toFixed(2) + ',' +
      target.currentDelegations.numDelegators + ',' +
      (target.currentDelegations.selfDelegation / ungm).toFixed(0) + ',' +
      (target.currentDelegations.treasuryDelegation / ungm).toFixed(0) + ',' +
      (target.currentDelegations.projectDelegation / ungm).toFixed(0) + ',' +
      (target.currentDelegations.communityDelegation / ungm).toFixed(0) + ',' +
      (target.baseDelegation / ungm).toFixed(0) + ',' +
      (target.selfDelegationBonus / ungm).toFixed(0) + ',' +
      (target.communityDelegationBonus / ungm).toFixed(0) + ',' +
      (target.totalDelegation / ungm).toFixed(0) + ',' +
      currentVotingPower.toFixed(4) + ',' +
      updatedVotingPower.toFixed(4) + ',' +
      deltaVotingPower.toFixed(4) + '\n'
  }

  writeFileSync(fileName, buffer)
}

async function getPaginatedValidators(client, status: BondStatusString): Promise<Validator[]> {
  let response = await client.staking.validators(status)
  let result: Validator[] = response.validators
  while (response.pagination.nextKey.length > 0) {
    response = await client.staking.validators(status, response.pagination.nextKey)
    result = result.concat(response.validators)
  }
  return result
}

async function run() {
  const tendermint = await Tendermint34Client.connect(rpcUrl)
  const client = QueryClient.withExtensions(
    tendermint,
    setupStakingExtension,
    setupDistributionExtension
  )
  const bondedValidators = await getPaginatedValidators(client, 'BOND_STATUS_BONDED')
  const unbondingValidators = await getPaginatedValidators(client, 'BOND_STATUS_UNBONDING')
  const unbondedValidators = await getPaginatedValidators(client, 'BOND_STATUS_UNBONDED')
  const validators = bondedValidators.concat(unbondingValidators).concat(unbondedValidators)
  const targets = await createTargets(client, validators)
  writeCsv(targets, 'allocations.csv')
  const messages = await createMessages(client, targets)
  writeTransactions(messages)
}

run().then(() => { })
