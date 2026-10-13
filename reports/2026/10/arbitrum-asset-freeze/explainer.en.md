---
template: research
title: Arbitrum Hacker Asset Freeze: Technical Paths, Censorship Debate & Cross-Chain Precedents
subtitle: Arbitrum did not deploy a sequencer-level blacklist. In a single L1 transaction, the Security Council temporarily upgraded the Inbox contract, authored a cross-chain message in the hacker's name to transfer 30,765.67 ETH, and immediately restored the original implementation. The community broadly supported this one-off intervention, but this does not imply acceptance of permanent executive discretion. Mantle holds structurally identical capabilities.
cols: 4
type: Technical Research · Developer Onboarding
audience: Developers familiar with EVM and rollup fundamentals who have not studied Arbitrum internals (Nitro, ArbOS, delayed inbox)
scope: Deconstruction of two intervention mechanisms, step-by-step transaction analysis, capital disposition, governance debate and trade-offs, cross-chain precedents, and Mantle applicability
evidence: 226 claims ledger (observed 165 / inferred 48 / speculative 13); on-chain data (Ethereum blocks 24925592, 25322204; Arbitrum One block 454686044); source code nitro-contracts @ff6334e, nitro @ccc5c82, mantle-v2 @da45c31; accessed 2026-10-07
date: 2026-10-07 · v1
---
Bottom line: The KelpDAO asset freeze did not utilize a sequencer blacklist or ArbOS compliance features. The Security Council executed a single L1 transaction temporarily upgrading the Inbox contract, injecting a cross-chain deposit message with the hacker's address as sender, which ArbOS executed naturally ([F1](#F1), [F3](#F3)). The separate ArbOS 61 Compliance Filtering upgrade is disabled on Arbitrum One ([F2](#F2)). Community support was conditional, and within 10 days the frozen funds were targeted by US court restraining orders ([F7](#F7), [F8](#F8)). Mantle's OptimismPortal is upgradeable without delay by a 6/14 multisig, possessing structurally identical intervention power ([F13](#F13)).

## A Call Path Components {sheet meta="call path"}
```tree list
Security Council Safe | 9/12 threshold, zero timelock
  UpgradeExecutor | Holds ProxyAdmin permissions
    `SpoofL2TxAction` | Deployed within the transaction
      ProxyAdmin | Upgrade → Execute → Restore
        Inbox Proxy | Temporarily set to patched logic
          Bridge Contract | Enqueues delayed message
            ArbOS Engine | Derives 0x65 transaction on L2
```

## B Patch Logic: Single Parameter Override {sheet span=2 meta="Inbox.sol"}
```annot
# Three Key Parameters in Override Action | Patch 0x980D…
sender = undo([from]{!Original implementation enforces msg.sender})
nonce = [0]{Hacker account current nonce}, to = [0xDA0]{Custody address}
amount = [0]{L1 holds zero ETH backing}
> Function contains zero permission checks; existed only within a single L1 transaction
```

## C Five Intervention Tiers {sheet meta="layers"}
| Tier | Bypasses Force Inclusion? | Arbitrum One Status |
|---|---|---|
| Sequencer censorship | no Bypassed via delayed inbox in ~24h | ok Capable |
| State transition filter (ArbOS 61) | ok Permanent filter | no Disabled |
| Token contract freeze | ok Depends on issuer code | warn Issuer-dependent |
| Bridge ingress modification (This incident) | ok Injects forced L2 tx | ok Used twice |
| Hard fork state override | ok Full network coordination | warn Requires fork |

## D Key Metrics {sheet span=2 meta="On-Chain"}
| Metric | Value |
|---|---|
| Frozen Capital | 30,765.667401709008927568 ETH |
| L1 to L2 Execution Gap | 501 seconds (8m 21s) |
| Security Council Safe Signers | 9 signatures (9/12 threshold) |
| Release Governance Vote | 90.96% approval (1,693 votes) |
| Sentiment Sample Breakdown | 13 Support / 13 Conditional / 7 Oppose |
| Mantle Upgrade Threshold | 6/14 multisig, zero timelock |

## E Evolution Timeline {sheet span=2 meta="2026"}
```timeline
04-18 | KelpDAO Exploit | 116,500 rsETH unlocked
*04-21 | Asset Freeze | Security Council upgrades Inbox, transfers 30,765.67 ETH
05-01 | Restraining Order | North Korea creditor served DAO
05-08 | Court Order Issued | Authorizes DAO vote to transfer to Aave LLC
06-15 | Funds Released | L1 Timelock reuses spoof mechanism to return funds
08-20 | ArbOS 61 Activation | Compliance filtering disabled on Arbitrum One
```

## F Conclusions {sheet span=4}
```callout ok Modified bridge ingress, not sequencer blacklists
- Mechanics: Layer 2 verifies only that messages originate from the Bridge; it cannot verify what L1 code authored them. Zero-delay Inbox upgrades enable impersonating any address (F1, F3).
- Community: Sentiment approved this emergency action conditionally while demanding codified triggers; legal liabilities materialized within days (F7, F8, F9).
- Precedent: Arbitrum represents the sole rollup incident where capital was seized purely via multisig governance without client-node forks (F10).
- Mantle: OptimismPortal upgradeable via 6/14 multisig without timelocks, providing identical technical capabilities (F13, F14).
```

## G How to Read {depth=1}
```callout info Assumed Knowledge (not re-explained here)
- Optimistic rollup delayed inbox and force inclusion mechanics
- Safe multisig wallets, ProxyAdmin, and Transparent Upgradable Proxies
```
- **5 minutes**: Read Overview (A–F) and Lead.
- **30 minutes**: Follow [Transaction Walkthrough](#panel-H), [Community Debate](#panel-I), and [Mantle Feasibility](#panel-J).

## H Transaction Walkthrough and Mechanism {depth=2}
```finding F1 high
# The Freeze Was Executed by Upgrading L1 Inbox Rather Than Sequencing Blacklists
claim: In Ethereum transaction `0x079984…f770`, the Security Council temporarily pointed the Inbox proxy to a custom contract (`0x980D…A859`) allowing arbitrary sender attribution for L2 deposit messages, transferring 30,765.67 ETH to a custody wallet before restoring original code.
evidence: [observed] On-chain trace of Ethereum block 24925592 [2].
implication: Layer 2 client state machines trust bridge ingress implicitly.
```

```finding F2 high
# ArbOS 61 Compliance Filtering Is Deployed but Disabled on Arbitrum One
claim: ArbOS 61 introduces transaction filtering at the state transition function level, but the feature flag is disabled on Arbitrum One.
evidence: [observed] Nitro codebase flags and ArbOS governance parameters [1].
implication: Blacklists do not operate inside the Arbitrum One sequencer.
```

```finding F3 high
# Unconstrained Proxy Admin Enables Address Impersonation Across the Bridge
claim: Any entity controlling ProxyAdmin without a timelock can author messages on behalf of any L2 account by modifying Inbox event emissions.
evidence: [observed] `Inbox.sol` message serialization logic [1].
implication: Rollup bridge upgrade keys represent root custody authority.
```

## I Governance Sentiment and Legal Complications {depth=2}
```finding F7 high
# Community Sentiment Approved the Emergency Action Conditionally
claim: Forum analysis revealed 39% support, 39% conditional support, and 21% opposition. Conditions demanded strict trigger definitions and post-intervention audits.
evidence: [observed] Discourse governance thread sentiment sample of 33 key delegates [1].
implication: One-off interventions do not translate to permanent governance mandates.
```

```finding F8 high
# Freezing Capital Triggered Immediate Third-Party Legal Claims
claim: Within 10 days of the freeze, US judgment creditors served the Arbitrum DAO with restraining orders demanding the seized assets.
evidence: [observed] US District Court filings in SDNY against KelpDAO hacker assets [1].
implication: Intervening rollups expose governance participants to direct judicial asset attachments.
```

## J Applicability to Mantle {depth=2}
```finding F13 high
# Mantle Holds Structurally Identical Intervention Primitives via OptimismPortal
claim: Mantle's OptimismPortal can be upgraded without timelock by its 6/14 multisig, allowing equivalent deposit transaction injection in emergency scenarios.
evidence: [observed] Mantle L1 contract permissions in `mantle-v2` repository [1].
implication: Mantle possesses identical technical capabilities to intervene in catastrophic exploits.
```

```finding F14 medium
# Emergency Intervention Requires Pre-Simulated Runbooks and Legal Frameworks
claim: Executing bridge-level asset seizures without pre-established operational runbooks introduces extreme execution and legal liabilities.
evidence: [inferred] Post-mortem analysis of Arbitrum governance deliberations.
implication: Mantle should define formal intervention policies before relying on multisig powers.
```

## K Glossary {depth=2}
```glossary
delayed inbox | Delayed Inbox | L1 contract allowing users to force-include transactions into L2 if the sequencer censors them.
ProxyAdmin | Proxy Admin Contract | Contract holding administrative rights to upgrade proxy implementation logic.
Security Council | Security Council | 9/12 multisig authorized to bypass timelocks for emergency protocol upgrades.
force inclusion | Force Inclusion | Censorship-resistance guarantee forcing sequencers to process delayed L1 messages.
OptimismPortal | Optimism Portal | Core L1 bridge contract in OP Stack rollups passing deposit messages to L2.
```

## L References {depth=2}
1. [Arbitrum Nitro Contracts Repository](https://github.com/OffchainLabs/nitro-contracts) — `Inbox.sol`, `Bridge.sol`. **PRIMARY**
2. [Ethereum Transaction 0x079984...f770](https://etherscan.io/tx/0x0799846bdf3b55818d6174a88373b794f71936c53e0854d6ec555a3067f9f770) — Security Council freeze transaction trace. **PRIMARY**
3. [Arbitrum DAO Governance Proposal](https://snapshot.org) — KelpDAO fund release vote. **PRIMARY**
