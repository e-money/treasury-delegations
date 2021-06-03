import { Bech32 } from '@cosmjs/encoding'
import {
  LcdClient,
  setupDistributionExtension,
  setupStakingExtension
} from '@cosmjs/launchpad'
import { BondStatus } from '@cosmjs/launchpad/build/lcdapi/staking.js'
import { median } from 'mathjs'
import { writeFileSync } from 'fs'

// Configuration
const apiUrl = 'https://emoney.validator.network/api'
const treasuryAddress = 'emoney1cpfn66xumevrx755m4qxgezw9j5s86qkan5ch8'
const ignoredAddresses = [
  'emoneyvaloper1ml9whlf0qpw2l58xaqaac24za5rm3tg5k64ka0' // Dual Stacking Spare
]
const ungm = 1000000
const baselineDelegation = 750000 * ungm
const maximumBaselineDelegation = 1000000 * ungm
const maximumBonusDelegation = 500000 * ungm
const selfDelegationMultiplier = 2

const client = LcdClient.withExtensions(
  { apiUrl },
  setupStakingExtension,
  setupDistributionExtension
)

class Delegations {
  selfDelegation: number
  projectDelegation: number
  communityDelegation: number
  totalDelegation: number
}

class Target {
  moniker: string
  operatorAddress: string
  commission: number
  delegations: Delegations
  baseAllocation: number
  bonusAllocation: number
  totalAllocation: number
}

function includeValidator (validator): boolean {
  if (validator.jailed || validator.status !== BondStatus.Bonded) return false
  if (ignoredAddresses.includes(validator.operator_address)) return false
  return true
}

function medianCommission (validators): number {
  const commissions: number[] = []
  for (const validator of validators.result) {
    if (includeValidator(validator)) {
      commissions.push(Number(validator.commission.commission_rates.rate))
    }
  }
  return median(commissions)
}

async function getDelegations (validatorAddress): Promise<Delegations> {
  const projectAddresses = [
    treasuryAddress,
    'emoney1hdv69euvy9d6krkrky6c9ngg00jglra89chkld',
    'emoney10r47ldzrc2nj6p85cg9hfy3q7d6ce5870qfc3y',
    'emoney1glwrypvl8ulz80n9z2gk6ey2dxey2vncfpd6s4',
    'emoney1hzeue94rtumz7adxedds7sh56guhyv4tuvmek9']

  const result: Delegations = {
    selfDelegation: 0,
    projectDelegation: 0,
    communityDelegation: 0,
    totalDelegation: 0
  }

  const selfDelegationAddress = Bech32.encode('emoney', Bech32.decode(validatorAddress).data)
  const delegations = await client.staking.validatorDelegations(validatorAddress)
  for (const delegation of delegations.result) {
    result.totalDelegation += Number(delegation.balance.amount)

    // Classify delegation
    if (selfDelegationAddress === delegation.delegator_address) {
      result.selfDelegation += Number(delegation.balance.amount)
    } else if (projectAddresses.includes(delegation.delegator_address)) {
      result.projectDelegation += Number(delegation.balance.amount)
    } else {
      result.communityDelegation += Number(delegation.balance.amount)
    }
  }
  return result
}

async function createTargets (validators): Promise<Target[]> {
  const result: Target[] = []
  for (const validator of validators.result) {
    if (!includeValidator(validator)) continue

    const commission = Number(validator.commission.commission_rates.rate)
    const commissionAdjustment = medianCommission(validators) / commission
    const delegations = await getDelegations(validator.operator_address)
    const baseAllocation = Math.min(maximumBaselineDelegation, Math.round(commissionAdjustment * baselineDelegation))
    const bonusAllocation = Math.min(maximumBonusDelegation, Math.round(delegations.selfDelegation * selfDelegationMultiplier))
    const totalAllocation = baseAllocation + bonusAllocation

    result.push({
      moniker: validator.description.moniker,
      operatorAddress: validator.operator_address,
      commission,
      delegations,
      baseAllocation: baseAllocation,
      bonusAllocation: bonusAllocation,
      totalAllocation: totalAllocation
    })
  }

  result.sort(function (left, right) {
    return right.totalAllocation - left.totalAllocation
  })

  return result
}

function writeCsv (targets: Target[], fileName: string) {
  let currentTotalDelegations = 0
  let updatedTotalDelegations = 0
  for (const target of targets) {
    currentTotalDelegations += target.delegations.totalDelegation
    updatedTotalDelegations += target.totalAllocation + target.delegations.selfDelegation + target.delegations.communityDelegation
  }

  let buffer = 'Moniker;Operator Address;Commission;Self Delegation;Project Delegation;Community Delegation;Base Allocation;Bonus Allocation;Total Allocation;Current Voting Power;Updated Voting Power;Delta Voting Power\n'
  for (const target of targets) {
    const currentVotingPower = target.delegations.totalDelegation / currentTotalDelegations
    const updatedVotingPower = (target.totalAllocation + target.delegations.selfDelegation + target.delegations.communityDelegation) / updatedTotalDelegations
    const deltaVotingPower = updatedVotingPower - currentVotingPower
    buffer += `${target.moniker};${target.operatorAddress};${Number(target.commission * 100).toFixed(2)}%;` +
    `${(target.delegations.selfDelegation / ungm).toFixed(0)};${(target.delegations.projectDelegation / ungm).toFixed(0)};${(target.delegations.communityDelegation / ungm).toFixed(0)};` +
    `${(target.baseAllocation / ungm).toFixed(0)};${(target.bonusAllocation / ungm).toFixed(0)};${(target.totalAllocation / ungm).toFixed(0)};` +
    `${Number(currentVotingPower * 100).toFixed(4)};${Number(updatedVotingPower * 100).toFixed(4)}%;${Number(deltaVotingPower * 100).toFixed(4)}%\n`
  }

  writeFileSync(fileName, buffer)
}

const validators = await client.staking.validators()
const targets = await createTargets(validators)
writeCsv(targets, 'allocations.csv')
