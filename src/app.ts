import { Bech32 } from '@cosmjs/encoding'
import {
  LcdClient,
  setupSlashingExtension,
  setupStakingExtension
} from '@cosmjs/launchpad'
import { BondStatus } from '@cosmjs/launchpad/build/lcdapi/staking.js'
import { median } from 'mathjs'

// Configuration
const apiUrl = 'https://emoney.validator.network/api'
const blacklistedAddresses = [
  'emoneyvaloper1ml9whlf0qpw2l58xaqaac24za5rm3tg5k64ka0' // Dual Stacking Spare
]
const baselineDelegation = 500000000000
const maximumDelegation = 1000000000000
const selfDelegationBonus = 5

const client = LcdClient.withExtensions(
  { apiUrl },
  setupSlashingExtension,
  setupStakingExtension
)

class target {
  moniker: string
  operatorAddress: string
  commission: number
  selfDelegation: number
  baseAllocation: number
  bonusAllocation: number
  totalAllocation: number
}

function includeValidator (validator): boolean {
  if (validator.jailed || validator.status !== BondStatus.Bonded) return false
  if (blacklistedAddresses.includes(validator.operator_address)) return false
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

async function getSelfDelegation (validatorAddress): Promise<number> {
  let result = 0
  const selfAddress = Bech32.encode('emoney', Bech32.decode(validatorAddress).data)
  const delegations = await client.staking.validatorDelegations(validatorAddress)
  for (const delegation of delegations.result) {
    if (selfAddress === delegation.delegator_address) {
      result = result + Number(delegation.balance.amount)
    }
  }
  return result
}

async function createTargets (validators): Promise<target[]> {
  const result: target[] = []
  for (const validator of validators.result) {
    if (!includeValidator(validator)) continue

    const commission = Number(validator.commission.commission_rates.rate)
    const commissionAdjustment = medianCommission(validators) / commission
    const selfDelegation = await getSelfDelegation(validator.operator_address)
    const baseAllocation = Math.min(maximumDelegation, Math.round(commissionAdjustment * baselineDelegation))
    const bonusAllocation = selfDelegation * selfDelegationBonus
    const totalAllocation = baseAllocation + bonusAllocation

    result.push({
      moniker: validator.description.moniker,
      operatorAddress: validator.operator_address,
      commission,
      selfDelegation: Math.trunc(selfDelegation / 1000000),
      baseAllocation: Math.trunc(baseAllocation / 1000000),
      bonusAllocation: Math.trunc(bonusAllocation / 1000000),
      totalAllocation: Math.trunc(totalAllocation / 1000000)
    })
  }

  result.sort(function (left, right) {
    return left.totalAllocation - right.totalAllocation
  })

  return result
}

const validators = await client.staking.validators()
const targets = await createTargets(validators)
console.dir(targets)

let allocations = 0
for (const target of targets) {
  allocations = allocations + target.totalAllocation
}
console.log(`Total allocations: ${allocations}`)
