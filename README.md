# Automated Treasury Delegations

**Upcoming Changes**
Due to high demand we'll be adjusting the eligibility requirements from November 2021. Only validators with an excess of 1000 NGM at stake through external delegations will be eligible to receive treasury delegations. This number is expected to increase over time.

## Rationale
The treasury delegations are intended as a "Universal Basic Income" to help cover validator operating costs.
As validators have different commission levels, delegations will be adjusted accordingly, so that high commission validators receive a
smaller delegation than their lower commission peers.

Validators will also be rewarded for having skin in the game and taking a long term view of the project.
As such self delegations are rewarded with a delegation bonus, calculated as the self-delegation multiplied with a constant (see below). 

Finally, to incentivise outreach and promotion of their e-Money validator service, the treasury will also match the first 250000 NGM community delegations. 

Moving forward it is the intention to adjust delegations around the start of each a month using the below algorithm. 

## Algorithm
The delegation algorithm uses the following variables when considering how much to allocate to a validator:
| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| medianCommission    | The median commission for all validators.           |
| validatorCommission | The current commission level for the validator.     |
| selfDelegation      | The current self delegation for the validator.      |
| communityDelegation | The current community delegation for the validator. |

It uses the following constants:
| Constants                       | Value  | Description                                                                      |
| ------------------------------- | ------ | -------------------------------------------------------------------------------- |
| medianDelegation                | 500000 | Delegated NGM if the validator commission matches the median for all validators. |
| maximumBaselineDelegation       | 750000 | Maximum NGM delegated after adjusting for commission.                            |
| maximumSelfDelegationBonus      | 500000 | Maximum NGM added as a bonus for self-delegation.                                |
| maximumCommunityDelegationBonus | 250000 | Maximum NGM added as a bonus for community delegations.                          |
| selfDelegationMultiplier        | 2      | Multiplier for calculating self-delegation bonus.                                |

The total delegation per validator is calculated as:
```
commissionAdjustment = medianCommission / validatorCommission
baseDelegation = Min(maximumBaselineDelegation, commissionAdjustment * medianDelegation)
selfDelegationBonus = Min(maximumBonusDelegation, selfDelegation * selfDelegationMultiplier)
communityDelegationBonus = Min(maximumCommunityDelegationBonus, communityDelegation)
totalDelegation = baseDelegation + selfDelegationBonus + communityDelegationBonus
```

## Example Data
Example data is available here: [allocations.csv](allocations.csv)

## How to Apply

Create a Pull Request that adds your validator to the validatorWhitelist in [data/configuration.json](data/configuration.json).
