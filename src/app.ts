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
  'emoneyvaloper1ml9whlf0qpw2l58xaqaac24za5rm3tg5k64ka0' // Duplicate: Dual Stacking Spare
]
const ungm = 1000000
const medianDelegation = 500000 * ungm
const maximumBaselineDelegation = 750000 * ungm
const maximumSelfDelegationBonus = 500000 * ungm
const maximumCommunityDelegationBonus = 250000 * ungm
const selfDelegationMultiplier = 2

const client = LcdClient.withExtensions(
  { apiUrl },
  setupStakingExtension,
  setupDistributionExtension
)

class Delegations {
  numDelegators: number
  selfDelegation: number
  projectDelegation: number
  communityDelegation: number
  totalDelegation: number
}

class Target {
  moniker: string
  operatorAddress: string
  commission: number
  currentDelegations: Delegations
  baseDelegation: number
  selfDelegationBonus: number
  communityDelegationBonus: number
  totalDelegation: number
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
    numDelegators: 0,
    selfDelegation: 0,
    projectDelegation: 0,
    communityDelegation: 0,
    totalDelegation: 0
  }

  const selfDelegationAddress = Bech32.encode('emoney', Bech32.decode(validatorAddress).data)
  const delegations = await client.staking.validatorDelegations(validatorAddress)
  result.numDelegators = delegations.result.length
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
    const currentDelegations = await getDelegations(validator.operator_address)
    const baseDelegation = Math.min(maximumBaselineDelegation, Math.round(commissionAdjustment * medianDelegation))
    const selfDelegationBonus = Math.min(maximumSelfDelegationBonus, Math.round(currentDelegations.selfDelegation * selfDelegationMultiplier))
    const communityDelegationBonus = Math.min(maximumCommunityDelegationBonus, currentDelegations.communityDelegation)
    const totalDelegation = baseDelegation + selfDelegationBonus + communityDelegationBonus

    result.push({
      moniker: validator.description.moniker,
      operatorAddress: validator.operator_address,
      commission,
      currentDelegations,
      baseDelegation,
      selfDelegationBonus,
      communityDelegationBonus,
      totalDelegation
    })
  }

  result.sort(function (left, right) {
    return right.totalDelegation - left.totalDelegation
  })

  return result
}

function writeCsv (targets: Target[], fileName: string) {
  let currentTotalDelegations = 0
  let updatedTotalDelegations = 0
  for (const target of targets) {
    currentTotalDelegations += target.currentDelegations.totalDelegation
    updatedTotalDelegations += target.totalDelegation + target.currentDelegations.selfDelegation + target.currentDelegations.communityDelegation
  }
  console.dir({ currentTotalDelegations, updatedTotalDelegations })

  let buffer = 'Moniker,Commission,Number of Delegations,Current Self Delegation,Current Community Delegation,New Base Delegation,Self Delegation Bonus,Community Delegation Bonus,Total Delegation,Current Voting Power,Updated Voting Power,Delta Voting Power\n'
  for (const target of targets) {
    const currentVotingPower = target.currentDelegations.totalDelegation / currentTotalDelegations
    const updatedVotingPower = (target.totalDelegation + target.currentDelegations.selfDelegation + target.currentDelegations.communityDelegation) / updatedTotalDelegations
    const deltaVotingPower = updatedVotingPower - currentVotingPower
    buffer += `${target.moniker},${target.commission.toFixed(2)},` +
    `${target.currentDelegations.numDelegators},${(target.currentDelegations.selfDelegation / ungm).toFixed(0)},${(target.currentDelegations.communityDelegation / ungm).toFixed(0)},` +
    `${(target.baseDelegation / ungm).toFixed(0)},${(target.selfDelegationBonus / ungm).toFixed(0)},${(target.communityDelegationBonus / ungm).toFixed(0)},${(target.totalDelegation / ungm).toFixed(0)},` +
    `${currentVotingPower.toFixed(4)},${updatedVotingPower.toFixed(4)},${deltaVotingPower.toFixed(4)}\n`
  }

  writeFileSync(fileName, buffer)
}

const validators = await client.staking.validators()
const targets = await createTargets(validators)
writeCsv(targets, 'allocations.csv')
