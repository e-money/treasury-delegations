# Automated Treasury Delegations

Some changes to how delegations from the treasury are distributed among the validator set will be put into effect in the near future. The objective of the changes 
is to better reward network commitment and long term sustainable network participation.

The changes are detailed below.

## Rationale
The treasury delegations are intended as a "Universal Basic Income" to help cover validator operating costs.
As validators have different commission levels, delegations will be adjusted accordingly, so that high commission validators receive a
smaller delegation than their lower commission peers.

Validators will also be rewarded for having skin in the game and taking a long term view of the project.
As such self-delegations are rewarded with a delegation bonus, calculated as the self-delegation multiplied with a constant (see below). 

Moving forward it is the intention to adjust delegations on a monthly basis using the below algorithm. The initial rebalancing of delegations will take
place on June 14th, 2021, in order to allow time for validators to make changes.

## Algorithm
The delegation algorithm uses the following variables when considering how much to allocate to a validator:
| Variable            | Description                                     |
| ------------------- | ----------------------------------------------- |
| medianCommission    | The median commission for all validators.       |
| validatorCommission | The current commission level for the validator. |
| selfDelegation      | The current self delegation for the validator.  |

It uses the following constants:
| Constants                 | Value   | Description                                                                      |
| ------------------------- | ------- | -------------------------------------------------------------------------------- |
| baselineDelegation        | 750000  | Delegated NGM if the validator commission matches the median for all validators. |
| maximumBaselineDelegation | 1000000 | Maximum NGM delegated after adjusting for commission.                            |
| maximumBonusDelegation    | 500000  | Maximum NGM added as a bonus for self-delegation.                                |
| selfDelegationMultiplier  | 2       | Multiplier for calculating self-delegation bonus.                                |

The total delegation per validator is calculated as:
```
commissionAdjustment = medianCommission / validatorCommission
baseAllocation = Min(maximumBaselineDelegation, commissionAdjustment * baselineDelegation)
bonusAllocation = Min(maximumBonusDelegation, delegations.selfDelegation * selfDelegationMultiplier)
totalAllocation = baseAllocation + bonusAllocation
```

## Example Data
Example data is available here: [allocations.csv](allocations.csv)