# Automated Treasury Delegations

## Upcoming Changes
Due to an increasing number of validators joining the network, the e-Money treasury is currently delegating more than 42M NGM out of a total supply of 110M.

While we are happy to welcome new validators, the high number of NGM delegated has resulted in staking yields in the 17% range which seems unlikely to attract new delegators.

To address the above, the following changes will come into effect from November 2021 and onwards:

* Only validators with a minimum commission of 5% will be eligible for delegations. This is to avoid a "race to the bottom" on commissions.
* Only validators with an excess of 1000 NGM at stake through self delegation and 3rd parties will be eligible for delegations. This number is expected to increase over time.
* A scaling parameter is introduced that to adjust the delegation, initially by reducing them by 10%. Further reductions to be expected over time, starting with 10% the next 3 months.

As a result of the second change, validators will observe a reduction in the treasury delegation in the form of an undelegation. However, since this is applied across the entire validator set, it will not greatly affect the earned commission or voting power for each individual validator.

## Rationale
The treasury delegations are intended as a "Universal Basic Income" to help cover validator operating costs.
As validators have different commission levels, delegations will be adjusted accordingly, so that high commission validators receive a
smaller delegation than their lower commission peers.

Validators will also be rewarded for having skin in the game and taking a long term view of the project.
As such self delegations are rewarded with a delegation bonus, calculated as the self-delegation multiplied with a constant (see below). 

Finally, to incentivise outreach and promotion of their e-Money validator service, the treasury will also match the first 250000 NGM community delegations. 

Adjustments to the delegations will be made around the start of each a month using the below algorithm. 

## Algorithm
The delegation algorithm uses the following variables when considering how much to allocate to a validator:
| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| medianCommission    | The median commission for all validators.           |
| validatorCommission | The current commission level for the validator.     |
| selfDelegation      | The current self delegation for the validator.      |
| communityDelegation | The current community delegation for the validator. |

It uses the following constants:
| Constants                       | Value            | Description                                                                      |
| ------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| minimumCommission               | 0.5              | The minimum commission for a validator to be eligible.                           |
| minimumExternalDelegations      | 2000             | The minimum amount of external delegations for a validator to be eligible.       |
| scaling                         | 0.9              | Scaling value used to adjust some of the constants below.                        |
| medianDelegation                | 500000 * scaling | Delegated NGM if the validator commission matches the median for all validators. |
| maximumBaselineDelegation       | 750000 * scaling | Maximum NGM delegated after adjusting for commission.                            |
| maximumSelfDelegationBonus      | 500000 * scaling | Maximum NGM added as a bonus for self-delegation.                                |
| maximumCommunityDelegationBonus | 250000 * scaling | Maximum NGM added as a bonus for community delegations.                          |
| selfDelegationMultiplier        | 2                | Multiplier for calculating self-delegation bonus.                                |

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

Please provide information in the pull request on past experience in operating validator nodes and overall details on the setup.

Applications will be reviewed periodically and individually, but please note there are **no guarantees of being accepted**.
