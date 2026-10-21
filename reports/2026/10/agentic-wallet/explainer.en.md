---
template: research
title: "Agentic Wallets: Product Design, Technical Principles & Where Agents Can Act"
subtitle: Most agent wallets are a separate budget wallet with off-chain vendor policy. Verifiable on-chain limits exist only on the smart-account path, and real paid demand is still small.
cols: 4
type: Technical research · Product comparison
audience: Developers and product people who know EVM and wallet / account abstraction basics, new to agentic wallets
scope: MetaMask, Coinbase / Base, Binance / BNB Chain, OKX; extended to Phantom, Crossmint, TWAK, Safe; protocol stack, use cases, Mantle implications
evidence: 207-claim ledger (observed 153 / inferred 46 / speculative 8), primary sources accessed 2026-10-21
date: 2026-10-21 · v1
---
Bottom line: most agent wallets today are "a separate budget wallet plus off-chain vendor policy". The key sits in a [[TEE]] or [[MPC]] setup, and the vendor's server enforces the limits. "Confirm every action" is mostly a [[skill]] rule that the agent follows by itself ([F1](#F1), [F2](#F2)). Verifiable on-chain limits appear only on the [[smart account]] path.

Your five assumptions point the right way, but three need a rewrite. The real risk is signing power with no bounds, not key visibility. A spending limit is not a loss cap. An on-chain identity does not make an agent a first-class citizen ([F3](#F3)–[F6](#F6)).

Real paid demand is still small: [[x402]] moves about $44K per day across all networks ([F7](#F7)). Mantle already has most chain-level parts; it lacks a production x402 settlement path and wallet-side coverage ([F10](#F10)).

## A Five questions every agent wallet answers {sheet meta="framework"}
```tree list
`Key` where it lives | TEE, MPC, local encryption, smart account
`Policy` which layer enforces it | skill rules, server, TEE, on-chain contract
`Who changes rules` | user app, admin key, root user
`Default scope` what it can do | from x402 payments only to any calldata
`Exit` can you leave with the assets | export the seed phrase, move the contract account
```

## B Three account modes {sheet meta="account modes"}
| Mode | What the agent gets | Examples |
|---|---|---|
| Separate budget wallet | A new address to fund | MetaMask, Coinbase, Binance, OKX, Phantom |
| Scoped access to the main account | A limited signer on the main account | Advanced Permissions, Spend Permissions, Crossmint, Altana, Safe |
| Per-action approval | Can only send requests; the user approves each one | Coinbase Wallet MCP, Stripe Link |

## C The big four: keys and policy layer {sheet span=2 meta="2026-10"}
| Product | Key | Where policy runs | Mantle |
|---|---|---|---|
| MetaMask Agent Wallet | TEE (or local BYOK) | Server YAML + 2FA | warn supported, no Shield |
| Coinbase Agentic Wallet | TEE | Not disclosed | no |
| Binance Agentic Wallet | MPC | Binance API layer | no |
| OKX Agentic Wallet | TEE | Set in web portal; layer not disclosed | warn supported, no x402 |

## D Key numbers {sheet span=2 meta="numbers"}
| Metric | Value | Source |
|---|---|---|
| x402, last 24 h | 101.7K txs, $44.2K, $0.40 average | Artemis, Oct 19 [42] |
| x402 30-day tx count | −45.88% | Artemis [42] |
| ERC-8004 registrations | 819,538 agents | 8004scan [43] |
| Registrations with a valid endpoint | 3%–15% | Academic study [43] |
| Injection success rate, with defenses | 1.4% | Anthropic [40] |

## E Timeline {sheet span=2 meta="2026"}
```timeline
2026-02-11 | Coinbase Agentic Wallet | CLI and MCP versions
2026-02-16 | Mantle deploys ERC-8004 | Identity and reputation registries
2026-03-18 | OKX Agentic Wallet | Execution part of Onchain OS
2026-03-26 | Trust Wallet TWAK | Local-key CLI
2026-04-24 | Binance Agentic Wallet | MPC keyless separate wallet
2026-06-08 | MetaMask Early Access | Limited CLI release
2026-07-01 | BNB Agent Studio v1 | Deploy + wallet + x402 + 8004
2026-08-06 | MetaMask general availability | Guard / Beast modes
*2026-08-13 | Agent Studio v2 | Agents can get paid; Altana added
2026-09-03 | Agent Studio v3 | Turnkey added
2026-10-14 | MetaMask goes live on a bot | The post you shared (date derived)
```

## F Conclusion {sheet span=4}
```callout ok The wallet is the entry point, not the whole system
- **Today**: most products give the agent a separate wallet and limit it with off-chain vendor policy. "Confirmation" is mostly a skill rule.
- **Corrections**: limit the reach of signing, not the visibility of the key. Spending limits and identity are not safety or trust guarantees.
- **Demand**: x402 moves about $44K per day, with a large share of wash trading. Test small service purchases first.
- **Mantle**: chain-level parts are in place. Add an x402 settlement path and wallet coverage.
```

## G How to read this {depth=1}
```callout info You already know (not explained here)
- An EOA signs with its private key, and a signature is an authorization
- ERC-20 `approve` lets a third party spend your tokens
- A failed contract call reverts and leaves state unchanged
- An LLM can run commands through tool calling
```
- **5 minutes**: read the overview (A–F) and the lead.
- **30 minutes (product or vendor selection)**: read [Background](#panel-I), [Checks on one action](#panel-J), [The big four](#panel-K), [Findings](#panel-M), [Your five assumptions](#panel-N).
- **30 minutes (protocol or chain work)**: read [Protocol stack](#panel-O), [Use cases and demand](#panel-P), [Mantle implications](#panel-Q).
- **Everything**: add [Method and evidence](#panel-S), which lists the method and the corrected source claims.

## H Context {depth=2}
**The problem**: an agent that takes part in the on-chain economy must sign and pay. Giving it the private key is too risky. Asking a human to confirm every action removes the reason to use an agent.

Every agent wallet answers one question: how much power to give, and which layer enforces the limit.

**Why now**:
- From February to August 2026, Coinbase, OKX, Binance and MetaMask each shipped an agent wallet (see E) [7][15][16][20].
- The MetaMask post you shared dates to about 2026-10-14. It announces Agent Wallet going live on a bot; it is not the launch post [7].
- BNB Chain bundles wallet, deployment, payments and identity in Agent Studio. From v2, agents can get paid [23].

**Scope**: product design, technical principles and limits of the big four; the wider ecosystem on the same dimensions; the protocols around the wallet; use cases; Mantle implications.

**Non-goals**: tests with real funds and security audits; investment advice; field-by-field protocol details.

**Running example** (illustrative, not a real product setting): a research agent spends at most 10 USDC per day on paid data APIs. It pays per request with x402. Each panel first shows how this payment flows in a given product.

## I Background {depth=2}
```excalidraw q="Which concepts do you need before reading the products, and in what order?" read="An arrow means learn first → learn after. Gray dashed boxes are assumed knowledge. Green boxes are the subjects of this page." takeaway="B-0 and B-1 cover where keys live; B-2 covers on-chain limits; B-3 explains why limits leak; B-4 and B-5 cover how agents pay and connect." name=prereq-map kind=Prerequisite map
{"grid": {"w": 300, "h": 110}, "defaults": {"w": 200, "h": 60},
 "nodes": [
   {"id": "eoa", "label": "Key signing (known)", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "appr", "label": "ERC-20 approve (known)", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "tool", "label": "LLM tool calls (known)", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "b0", "label": "B-0 TEE", "col": 1, "row": 0, "color": "blue"},
   {"id": "b1", "label": "B-1 MPC", "col": 1, "row": 1, "color": "blue"},
   {"id": "b2", "label": "B-2 Smart account", "col": 2, "row": 0, "color": "blue"},
   {"id": "b3", "label": "B-3 Signed approvals", "col": 1, "row": 2, "color": "blue"},
   {"id": "b4", "label": "B-4 x402", "col": 2, "row": 2, "color": "blue"},
   {"id": "b5", "label": "B-5 MCP and skills", "col": 1, "row": 3, "color": "blue"},
   {"id": "prod", "label": "Products and findings", "col": 3, "row": 1, "color": "green", "strokeWidth": 3},
   {"id": "stack", "label": "Stack and Mantle", "col": 3, "row": 3, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "eoa", "to": "b0"}, {"from": "eoa", "to": "b1"}, {"from": "b0", "to": "b2"},
   {"from": "appr", "to": "b3"}, {"from": "b3", "to": "b4"}, {"from": "tool", "to": "b5"},
   {"from": "b2", "to": "prod"}, {"from": "b1", "to": "prod"}, {"from": "b3", "to": "prod"},
   {"from": "b4", "to": "stack"}, {"from": "b5", "to": "stack"}
 ]}
```

```prereq B-0 l1 5min
# Trusted execution environment (TEE)
what: An isolated execution area inside the CPU. Keys are created and used inside it, and the host system and its operators cannot read them.
why: MetaMask server-wallet, Coinbase, OKX and Phantom keep agent wallet keys in a TEE. The agent only holds a credential that asks for signatures.
example:
~~~
agent → wallet service: sign(tx)
TEE: check policy → sign with the inner key → return the signature
the agent never sees the private key
~~~
misconception: Myth: a key in a TEE makes the agent safe. Fact: the TEE protects only the key. Policy decides which signatures the agent can get.
deeper: [32] Privy Policies docs, "Policy evaluation"
```

```prereq B-1 l2 3min
# Threshold signing (MPC)
what: The private key is split into shares on different machines. The parties sign together, and no single place ever rebuilds the full key.
why: Binance Agentic Wallet uses an MPC keyless design, with its rules enforced at the Binance API layer.
deeper: [17] Binance developer docs, Welcome page, "MPC Keyless Security"
```

```prereq B-2 l1 8min
# Smart accounts and session keys
what: A smart account is a contract account whose signature rules live in code. A [[session key]] is a temporary key issued by the owner. The owner can limit it to listed contracts and functions, a cap and an expiry. Calls outside those limits revert on chain.
why: Only this path keeps policy on chain, where it still holds if the vendor goes away. [[EIP-7702]] lets an EOA delegate to contract code; [[ERC-4337]] adds a [[paymaster]] that pays gas.
example:
~~~
session = { calls: [Router.swap], spend: 100 USDC/day, expiry: 30 days }
agent calls Vault.withdraw → validation fails → revert
~~~
misconception: Myth: a session key is safe by default. Fact: with no calls list, an Altana session can call any contract within its spending cap.
deeper: [26] Altana Sessions docs
```

```prereq B-3 l1 6min
# Signed approvals: Permit2 and EIP-3009
what: You sign one off-chain message instead of sending a transaction, and someone else gets the power to spend. [[Permit2]] lets a third party pull tokens from your address. [[EIP-3009]] authorizes one transfer of a set amount, and anyone can submit it while it is valid.
why: Many wallets count only sent transactions against the limit, not signed approvals. MetaMask's limit does not count Permit2 signatures [3].
example:
~~~
3009 authorization: from, to, value, validAfter, validBefore, nonce
after the agent is paused, this authorization can still be submitted in its window
to cancel it: cancelAuthorization, or wait for expiry
~~~
misconception: Myth: revoking the agent voids what it already signed. Fact: an off-chain signature ends only through an on-chain cancel or expiry.
deeper: [48] USDT0 docs, EIP-3009 section
needs: B-0
```

```prereq B-4 l1 6min
# x402 (pay per request over HTTP 402)
what: The server answers with HTTP 402 and a price. The client signs a payment authorization and sends the request again with it. A [[facilitator]] verifies the signature and settles on chain; it does not hold funds.
why: This is the main path for agents to buy data and APIs. By default the server verifies first and settles later: it serves the resource, then collects payment [34].
example:
~~~
GET /data → 402 { price: 0.01 USDC, payTo, network }
sign an EIP-3009 authorization → resend GET + PAYMENT header
→ 200 data; the facilitator settles on chain afterwards
~~~
misconception: Myth: x402 always takes payment before delivery. Fact: the default authorization flow settles after the server handler runs.
deeper: [34] x402 docs, Payment Schemes
needs: B-3
```

```prereq B-5 l2 3min
# MCP and skills
what: [[MCP]] is a protocol for agents to call external tools. A [[skill]] is a set of notes and scripts for the agent that says when to run which command and what to do first.
why: Most agent wallets install their CLI through a skill. Many "confirm every action" rules live only in the skill, and the agent enforces them on itself.
deeper: [19] binance-skills-hub, Agentic Wallet SKILL.md
```

## J Checks on one action {depth=2}
```excalidraw q="Which layers can stop an action the agent sends? Where does each vendor put its limits?" read="Top to bottom is the order an action passes. Red is a layer the agent enforces on itself; blue is enforced by the vendor; green by an on-chain contract." takeaway="The lower the layer, the harder it is for the agent to bypass. Mainstream products put their limits in layers 3 and 4." name=check-layers kind=Layers
{"grid": {"w": 600, "h": 105}, "defaults": {"w": 560, "h": 72, "fontSize": 17},
 "nodes": [
   {"id": "l1", "label": "① Model: reads pages, proposes actions\nPrompt injection works at this layer", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "l2", "label": "② Skill / tool rules: confirm every action\nMetaMask · Binance · OKX · Phantom", "col": 0, "row": 1, "color": "red"},
   {"id": "l3", "label": "③ Vendor server policy: limits, allowlists, risk score\nMetaMask Guard · Binance API · OKX portal", "col": 0, "row": 2, "color": "blue"},
   {"id": "l4", "label": "④ TEE / MPC signing\nCoinbase · OKX · Phantom · Privy · Turnkey · Binance", "col": 0, "row": 3, "color": "blue"},
   {"id": "l5", "label": "⑤ On-chain contract: session, caveat, allowance\nAltana · Crossmint · Safe · Advanced Permissions", "col": 0, "row": 4, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "l1", "to": "l2"}, {"from": "l2", "to": "l3"}, {"from": "l3", "to": "l4"}, {"from": "l4", "to": "l5"}
 ]}
```

Evidence for each layer in the figure:
- **Layer 2**: MetaMask's rules ask the agent to show parameters and get a yes before a transfer, swap or x402 payment. This is a skill rule; the server forces 2FA only when an action breaks a limit or is flagged as risky [2][4]. When the OKX backend returns `confirming`, the skill says to rerun with `--force` only after the user agrees. A client that holds the session can skip that step [21].
- **Layer 3**: MetaMask stores the [[Guard Mode]] allowlists and the rolling 24-hour [[outflow limit]] as YAML on the server wallet [2]. Binance enforces the daily limit and token scope at the API layer [17].
- **Layer 4**: the Turnkey and Privy policy engines run inside an enclave and deny by default [27][32].
- **Layer 5**: an Altana session that goes out of bounds reverts at validation time, with no off-chain trust assumption [26]. MetaMask Advanced Permissions use on-chain [[caveat enforcer]] contracts [9].

**The running example, step by step**: a research agent buys one dataset. The figure below shows the default flow.

```uml q="When a research agent buys data with x402, which parties do the money and the checks pass through?" read="Uses the separate-wallet-plus-vendor-policy model. Simplified: TLS, retries and balance checks are left out." takeaway="The wallet controls only the signature in steps 5–6. Whether the price is fair and the data arrives depends on the protocol and the server."
sequenceDiagram
  autonumber
  participant U as User
  participant A as Agent
  participant W as Wallet service
  participant S as Data API
  participant F as Facilitator
  U->>W: Set a 10 USDC/day budget in the app (agent cannot change it)
  A->>S: GET /data
  S-->>A: 402 + price
  A->>W: Ask for an EIP-3009 payment signature
  alt Within budget and allowlist
    W-->>A: Return signature
  else Over limit or risky
    W-->>U: Push to app for approval, or reject
  end
  A->>S: Resend request + PAYMENT header
  S->>F: verify
  S-->>A: 200 data
  S->>F: settle (transferWithAuthorization on chain)
  Note over A,S: On timeout, check settlement status. Do not pay again.
```

## K The big four, one by one {depth=2}
**Entry and confirmation**:

| Product | Entry | Default confirmation | Exit |
|---|---|---|---|
| MetaMask | `mm` CLI + skills | Skill asks for each action; 2FA only past limits | Statements conflict (see below) |
| Coinbase | CLI `awal` / MCP | x402 pays automatically; caps set in the UI | Email recovery; export not documented |
| Binance | Skills + `baw` CLI | No per-action prompt after approval; risk score ≥4 goes to the app | Private key cannot be exported |
| OKX | Skills + `onchainos` CLI | Backend `confirming`, then `--force` after a yes | Seed phrase export; the agent then loses access |

**Scope and limits**:

| Product | Can do | Known limits |
|---|---|---|
| MetaMask | Transfer, swap / bridge, Hyperliquid perps, Polymarket, earn, x402 | Permit2 signatures not counted; multi-hop counted twice; Beast has no allowlist |
| Coinbase | CLI: USDC transfer, trading on Base, x402; MCP: x402 only | Enforcement layer for caps not disclosed |
| Binance | Swap, transfer (allowlisted addresses only), limit orders, prediction markets, DeFi, x402 | No EIP-191, so no SIWE login; four separate limits with no total cap |
| OKX | Transfer, swap, bridge, any calldata, personalSign, x402 | Policy covers only amounts and a transfer allowlist |

**MetaMask Agent Wallet**:
- Two key modes. The server-wallet key sits in a server-side TEE. [[BYOK]] keeps the seed phrase in an environment variable and signs locally [1].
- [[Guard Mode]] has threat scanning, network / address / recipient allowlists and a rolling 24-hour limit. [[Beast Mode]] keeps only threat scanning. Switching to Beast needs 2FA [2].
- When native gas is short, ERC-20 transfers and swaps use an EIP-7702 relay that takes the fee from the token sent. On supported chains, ERC-7821 merges approve and trade into one call [1].
- x402 runs through a script in the skill and supports only `exact` + EIP-3009. The script keeps no state, so a rerun pays again [6].
- Export: the August launch post says you can export the seed phrase at any time; the October 8 guide says server-wallet export is not available yet [7][8].
- Advanced Permissions is a different product. A dapp asks the MetaMask extension for permissions through [[ERC-7715]], a session account redeems them through [[ERC-7710]], and on-chain caveat enforcers apply the limits [9].

**Coinbase / Base**: three paths.
- **Agentic Wallet** (separate budget wallet): the CLI can send USDC, trade on Base and pay x402. The MCP version can only find and pay for x402 services; it cannot send or trade [10][11]. MCP caps per call and per session are set only in the wallet UI, and the agent cannot change them [12].
- **Wallet MCP** (formerly Base MCP): connects to the user's own Coinbase Wallet; the user approves every write action [14].
- **Spend Permissions**: an on-chain contract that lets a spender use set tokens, up to a cap, per period. It differs from CDP Policies, which are off-chain rules in the Coinbase TEE [13].

**Binance Agentic Wallet**:
- A separate keyless wallet under the Binance account, apart from the main MPC wallet. With [[Secure Auto Sign]] on, actions run without per-action prompts [16].
- Security rules can be changed only in the Binance app; the agent can only read them. Pairing requires checking a 6-digit code and the request origin in the app [17].
- Transfers can go only to address-book allowlist entries, and this cannot be turned off. Swap and transfer, DeFi, x402 and Developer Mode each have their own 24-hour limit, with no total cap [18].
- Only [[Developer Mode]] opens arbitrary contract calls. Only the app can turn it on, and it expires. Its default limit is 1,000 USDT, and it cannot start when the wallet holds more than 10,000 USDT [17][18].

**OKX Agentic Wallet**:
- The execution part of [[Onchain OS]]. Login by email, Google or Apple; keys are created and used inside a TEE; one wallet can derive up to 50 sub-wallets [20].
- Broad default scope: `contract-call` accepts any calldata, and `sign-message` defaults to personalSign [21].
- Only four policy rules: per-transaction limit, daily transfer limit, daily trade limit and a transfer allowlist, set by the user in the web portal [21].

**BNB Agent Studio**: not a wallet but a platform that bundles deployment, wallet, model payments (x402), identity (ERC-8004) and jobs (ERC-8183) [23].
- Swappable wallet backends: a local keystore by default, plus [[TWAK]] (local encryption), Altana (on-chain session) and Turnkey (enclave policy) [23][24].
- Signing is fixed code, not a tool the LLM can call. The MCP server in the IDE has read-only tools [24].

## L Wider ecosystem and infrastructure {depth=2}
**Other agent wallets**:

| Product | Account mode | Key / policy layer | Mantle |
|---|---|---|---|
| Phantom MCP | Separate budget wallet (new, zero balance) | Policy engine in the KMS TEE | no |
| Crossmint | Limited signer on the main account | ERC-4337 + ERC-7579 contract; transfer scope only | ok |
| TWAK | Local wallet, or link to the user's wallet | Local encryption; guards are CLI flags | warn not confirmed |
| Safe | Multisig or Allowance Module | On-chain contract | warn not checked |
| Stripe Link | The user's Link account | Customer approves each spend; card network | n/a |

- **Phantom**: send / transfer simulate first and submit after the user approves; most perps write tools submit on call [29].
- **Crossmint**: adds the agent key to the user's wallet as a signer and writes the limits into the on-chain signer config [30]. If the integrator leaves out `prepareOnly`, the server signer approves itself and the user sees no prompt [30].
- **TWAK**: the seed phrase is AES-256-GCM encrypted on the host, and the signing password can come from an environment variable. Automations run only while `twak serve --watch` is running [28].
- **Safe**: the docs give 4 agent setups and advise against the agent as a 1-of-1 owner [31].

**Infrastructure compared**:

| Infrastructure | Enforcement layer | Bypass point | Mantle |
|---|---|---|---|
| Privy | TEE, deny by default | A key quorum can change policy | ok any EVM chain |
| Turnkey | Enclave policy engine | Root users bypass it fully | warn signing yes, gas sponsorship no |
| Altana | On-chain session, reverts out of bounds | No calls list means any call | no |

**The card-network path, for contrast**: Crossmint agent cards can run on Visa Intelligent Commerce or Mastercard Agent Pay. Then the card network enforces the limit, and the agent never sees the card number. Each order goes through the user's own card, so refunds and chargebacks work as usual [30]. On the crypto path a contract enforces the limit, but no matching refund mechanism exists, and wallet docs do not say who handles disputes.

## M Findings {depth=2}
```finding F1 high
# The mainstream design is "separate budget wallet + off-chain vendor policy"
claim: Each of the big four gives the agent a separate wallet. The vendor's server, API or TEE enforces limits and allowlists, or the layer is not disclosed. Limits enforced by an on-chain contract appear only on the smart-account path.
evidence: [observed] MetaMask stores policy as YAML on the server wallet [2]; Binance applies rules at the API layer [17]; OKX policy is set in the web portal [21]. [observed] Altana reverts out-of-bounds calls [26]; Crossmint permissions are enforced by contract [30]; Coinbase Spend Permissions are on chain [13]. [speculative] Coinbase Agentic Wallet caps run on a server or in a TEE; the docs do not say.
implication: To judge an agent wallet, ask first where its policy runs and whether it still holds if the vendor goes offline.
```

```finding F2 high
# "Confirm every action" is mostly a skill rule, not a server guarantee
claim: Per-action confirmation mostly lives in the skill or tool layer, and the agent enforces it on itself. MetaMask and Binance also have documented server-side or app-side checks. OKX and Phantom expose different confirmation paths, and their server-side conditions are not fully disclosed.
evidence: [observed] MetaMask rules require a yes first; the server forces 2FA past limits, on high risk, on limit increases and on policy changes [2][4]. [observed] The Binance skill says confirmation can be skipped "unless the user explicitly asks"; trades with a risk score of 4 or more go to the app for approval or are rejected [18][19]. [inferred] An OKX `confirming` response can be rerun with `--force` [21]. [inferred] Phantom's `confirmed: true` is only a parameter, and perps write tools submit on call [29].
implication: An injected agent may bypass the skill layer. Count only documented server-side, enclave or on-chain checks in a safety argument (layers 3–5 in J).
```

```finding F3 high
# The risk is unbounded signing power, not seeing the key
claim: Your assumption 1 points the right way but needs a rewrite. BYOK and TWAK keep the key on the agent's host, so any process that reads environment variables can sign. In the other direction, a custodial wallet with an empty policy is economically close to handing over the key.
evidence: [inferred] MetaMask BYOK keeps the seed phrase in `MM_MNEMONIC`, with no server-side limit [1][2]. [inferred] The TWAK signing password can come from an environment variable [28]. [observed] Altana: "`permissions.calls` omitted = unrestricted" [26]. [observed] Turnkey: "Root users bypass the policy engine entirely" [27]. [observed] A Crossmint signer with no scope can spend tokens without limit [30].
implication: Scope agent permissions by target contract, method, amount and expiry, and confirm the agent is not a root user.
```

```finding F4 high
# A spending limit is not a loss cap
claim: Your assumption 2 needs one more line. Limits count only sent transactions; they leave out signed approvals and existing allowances. Pausing the agent does not void them either.
evidence: [observed] MetaMask: Permit2 and other signatures are not counted; transactions not sent through its backend are tracked imprecisely; 10 USDC→ETH→DAI counts as two $10 outflows [3]. [observed] An EIP-3009 authorization can be submitted by anyone in its window and ends only through a cancel or expiry [48]. [inferred] OKX policy has no contract or approval dimension [21]. [speculative] OKX limits do not cover third-party transfers after an approval (a claim in the GPT source; the page needs a login and was not checked).
implication: A shutdown procedure must cancel signed authorizations and revoke allowances, not only show "paused" in the UI.
```

```finding F5 medium
# "Deterministic execution, less reasoning" is already common practice
claim: Your assumption 3 holds, and vendors already work this way: fixed code signs and validates, and the LLM only chooses and plans.
evidence: [observed] BNB Agent Studio: signing is fixed code, not a tool the LLM can call [24]. [observed] AP2: validation for each role "MUST happen in deterministic code" [37]. [observed] The default x402 flow verifies and settles in code [34].
implication: Give agents tools with clear meaning (quote, build, validate, submit, check status), not one "send any transaction" tool.
```

```finding F6 medium
# An on-chain identity does not make an agent a first-class citizen
claim: Your assumption 4 needs to be concrete. ERC-8004 provides identity, reputation and validation registries. It does not handle payment, and it admits that reputation can be gamed. A first-class agent also needs a budget, income, revocation and audit. BNB Agent Studio lets agents get paid from v2.
evidence: [observed] EIP-8004: "Payments are orthogonal"; Sybil attacks can inflate fake agents' reputation [35]. [inferred] Only 3%–15% of registrations carry a valid service endpoint [43]. [observed] 8004scan shows 819,538 agents, and the newest entries have zero feedback [43]. [observed] Agent Studio v2 lets agents be hired and paid [23].
implication: Measure an agent ecosystem by paid jobs and income, not by registrations.
```

```finding F7 high
# Real paid demand is small, and transaction counts include heavy wash trading
claim: Your assumption 5 (give agents room to act) points the right way, but the data does not support "demand has exploded". x402 moves about $44K per day, and 30-day transactions fell 46%. BNB Chain itself says application-level demand still has to be proven.
evidence: [observed] Artemis (updated Oct 19): 101.7K txs, $44.2K, $0.40 average in 24 h; −45.88% over 30 days [42]. [observed] Artemis tracks "Real vs. Gamed Transactions" as a separate chart [42]. [inferred] A second-hand summary of the Artemis Dec 2025 report: about 48% of txs and 81% of value tie to gamed volume [42]. [observed] BNB Chain: "application-level demand … still has to be proven" [25]. [observed] None of the three exchange wallets publishes wallet-level usage [16][20].
implication: Track independent paying users and repeat use, not wallet or transaction counts.
```

```finding F8 medium
# Two design approaches: narrow by default, or broad by default plus policy
claim: Binance opens only verified operations by default, and Coinbase MCP can only pay x402. OKX allows any calldata by default, and MetaMask Beast Mode drops allowlists. Narrow scope costs generality: Binance cannot do SIWE login or airdrop claims.
evidence: [observed] Binance does not start arbitrary transactions and allows only EIP-712 message signing [17]. [observed] Coinbase MCP cannot send or trade [10]. [observed] OKX contract-call accepts any calldata [21]. [observed] Beast Mode keeps only threat scanning [2].
implication: Grant permissions per use case: an agent that only buys data needs no transfer or trading power.
```

```finding F9 high
# Four problems your list missed
claim: 1) [[Prompt injection]] abuses permissions the agent already has, not only key theft. 2) Revocation does not void signed approvals (see F4). 3) Automations need a long-running process. 4) Payments can repeat: a stateless script pays again on a retry after timeout.
evidence: [observed] Anthropic: 1.4% attack success with defenses, and "No browser agent is immune" [40]. [observed] OpenAI advises keeping tool approvals on for MCP tools and keeping untrusted data from driving agent behavior [41]. [observed] TWAK automations run only while the watcher runs [28]. [observed] The MetaMask x402 script keeps no state, and its rules allow one payment per resource [4][6]. [observed] x402 uses `settlement_pending` reconciliation to stop double charges [34].
implication: Put "outside content cannot change policy or payee" into layers 3–5, and give each payment an idempotency key.
```

```finding F10 medium
# Mantle has most chain-level parts; it lacks an x402 settlement path and wallet coverage
claim: 7702 is live, 4337 has bundlers and paymasters, the ERC-8004 identity and reputation registries are deployed, and both USDC and USDT0 implement EIP-3009. The official x402 docs list no default asset or facilitator for Mantle. Among wallets, Coinbase, Binance and Phantom do not support Mantle; MetaMask does, without threat scanning.
evidence: [observed] The Skadi upgrade brought EIP-7702 [44]; Pimlico supports EntryPoint V06–V09 on Mantle [45]; 8004 registry addresses [46]. [observed] The x402 default asset table and facilitator list have no Mantle entry [34]. [observed] Mantle USDC accepts only v,r,s signatures for 3009 [47]. [observed] MetaMask's Mantle row shows Transaction Shield = No [5].
implication: See [Mantle implications](#panel-Q).
```

## N Your five assumptions {depth=2}
| Your assumption | Verdict | Revised version | See |
|---|---|---|---|
| Agents must not control private keys | warn rewrite | Agents must not get unbounded signing power; scope contract, method, amount, expiry | [F3](#F3) |
| Agents need permission limits | warn add detail | What matters is which layer enforces them; a limit is not a loss cap | [F1](#F1), [F4](#F4) |
| Deterministic execution, less reasoning | ok holds | Already common practice; reasoning picks the plan, code signs and checks | [F5](#F5) |
| Make agents first-class citizens | warn make concrete | Identity + budget + income + revocation + audit | [F6](#F6) |
| Give agents room to act | warn evidence thin | Demand is small; test small service purchases first | [F7](#F7), [P](#panel-P) |

Four more problems (prompt injection, signed approvals, long-running processes, repeat payments) are in [F9](#F9).

## O The protocol stack beyond the wallet {depth=2}
```excalidraw q="Which layers does an agent economy need, and which ones does the wallet cover?" read="Top to bottom are the layers one agent purchase depends on. The green frame marks the two layers an agent wallet covers." takeaway="A wallet answers only whether the agent can sign and what it can sign. Payment, identity and delivery each need their own protocol, and each one states what it does not guarantee." name=econ-stack kind=Layers
{"grid": {"w": 560, "h": 100}, "defaults": {"w": 520, "h": 66, "fontSize": 17},
 "nodes": [
   {"id": "t", "label": "Tool interface: CLI · skills · MCP", "col": 0, "row": 0, "color": "blue"},
   {"id": "a", "label": "Account and authority: 4337 · 7702 · 7715 / 7710", "col": 0, "row": 1, "color": "blue"},
   {"id": "p", "label": "Payment: x402 · MPP · AP2", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "i", "label": "Identity, reputation, validation: ERC-8004", "col": 0, "row": 3, "color": "gray", "stroke": "dashed"},
   {"id": "j", "label": "Jobs and delivery: ERC-8183", "col": 0, "row": 4, "color": "gray", "stroke": "dashed"}
 ],
 "edges": [{"from": "t", "to": "a"}, {"from": "a", "to": "p"}, {"from": "p", "to": "i"}, {"from": "i", "to": "j"}],
 "boxes": [{"label": "agent wallet", "around": ["t", "a"], "pad": 18, "color": "green"}]}
```

| Protocol | Covers | Explicitly does not cover | Status |
|---|---|---|---|
| x402 | Price, payment authorization and settlement over HTTP 402 | Identity, delivery quality | v2 |
| ERC-8004 | Identity, reputation, validation registries | Payment; Sybil-proof reputation | Draft |
| ERC-8183 | Job escrow, submission, evaluator decision, refund on expiry | Dispute arbitration | Draft |
| AP2 | Purchase and payment mandates, plus receipts | Dispute process; does not fix the payment method | v0.2 |
| ERC-7715 / 7710 | Request permissions from a wallet / redeem and check on chain | 7710 does not define how to request | Draft |
| ERC-4337 / EIP-7702 | Contract accounts, paymaster, 2D nonce / EOA delegation | 7702 has no permissions at protocol level | Final |

- **x402 is not "pay first"**: the four schemes are `exact`, `upto`, `batch-settlement` and `auth-capture`. The default authorization flow verifies first and settles after the server handler runs. `auth-capture` holds funds in escrow, then captures or refunds after delivery [34].
- **ERC-8183 trusts the evaluator**: it can complete or reject any job; the spec has no arbitration, and reject and expiry are final [36].
- **AP2 treats crypto as one payment method**: the spec stays open on payment methods. With no human present, the user signs a constrained open mandate that must include the agent's public key [37].
- **[[MPP]]**: co-authored by Stripe and Tempo; it also uses HTTP 402 and is not tied to one rail (stablecoins, cards and Lightning all work) [33].

## P Use cases and demand evidence {depth=2}
**Demand data** (all public third-party or vendor data; see D and [F7](#F7)):
- The x402 average of $0.40 per payment shows mostly small pay-per-request use [42].
- Data providers differ widely on x402's 30-day value. Transaction counts and registrations are not direct evidence of demand [42][43].

**Use-case judgment** (speculative, not tested; marked speculative in the ledger):

| Use case | Agent does | Deterministic code does | Current support |
|---|---|---|---|
| Buying data / APIs | Picks the service, judges the value | Price, limit, payment dedup | Coinbase MCP opens only x402 [10] |
| Position upkeep | Reads risk, proposes a plan | Top-ups, limits, execution | On-chain session limits [26][30] |
| Arbitrage, liquidation, market making | Sets goals and limits | Search, math, execution | LLM latency does not fit high-frequency trading [49] |

- The first row is the most likely to work first: small amounts, low permissions, limited loss on failure.
- Your point that agents cannot replace triangular-arbitrage bots has academic support: retrieval latency does not fit high-frequency or fast mid-frequency strategies [49]. "The agent picks goals, bots execute" is a sound split, but it has no empirical proof.

## Q Mantle implications {depth=2}
| Layer | Mantle today | Gap |
|---|---|---|
| EIP-7702 | ok live since the Skadi upgrade [44] | — |
| ERC-4337 | ok Pimlico supports V06–V09 [45] | — |
| ERC-8004 | ok identity and reputation registries deployed [46] | validation registry not verified; usage not checked |
| Stablecoin 3009 | warn USDC takes only v,r,s; USDT0 has a bytes overload [47] | smart accounts cannot use USDC via 3009 |
| x402 settlement | no not in the docs' asset or facilitator lists [34] | self-hosted facilitator, explicit pricing |
| Agent wallets | warn MetaMask (no Shield), OKX (no x402), Crossmint, Privy | Coinbase, Binance, Phantom, Altana do not support it |

- **The USDC limit**: Mantle USDC's `transferWithAuthorization` takes only a v,r,s signature. An [[ERC-1271]] smart account, including a session-key account, cannot use it for the x402 3009 path directly. It must sign from an EOA or a 7702 account, or use Permit2 [47][34].
- **Security coverage**: MetaMask has no threat scanning on Mantle; Guard Mode keeps only the address allowlist [5].

```callout warn Speculative: suggested priorities (not tested)
1) Build production x402 settlement first: run or bring in a facilitator, and price in explicit TokenAmount. 2) Give smart accounts a usable payment token path (USDT0's bytes overload, or Permit2). 3) Push wallets to add threat scanning on Mantle. A new wallet front end is not the first need.
```

## R Limits and open questions {depth=2}
- No tests with real funds and no security audit; we did not run the `mm`, `baw`, `onchainos` or `twak` CLIs.
- WAF rules blocked the Binance and OKX doc pages; we read their text through a search service. We cross-checked key terms against both vendors' official skill repositories at fixed commits.
- Demand data comes from Artemis pages and a second-hand summary; we could not read the current real-vs-gamed split.
- Speculative items: where Coinbase enforces caps; whether x402 3009 payments count against MetaMask's limit; who pays Binance gas after the launch promotion; OKX transfers after an approval; Crossmint scoped signers calling contracts; the use-case split; Mantle priorities.
- Open questions:
  1. Do Coinbase and OKX enforce limits on a server or in a TEE? Does OKX hard-reject over-limit actions, or return a `confirming` that `--force` can pass?
  2. Do MetaMask's gas relay and swap work on Mantle (needs `mm chains list --json`)?
  3. Does any production facilitator support `eip155:5000`? Is Permit2 deployed on Mantle?
  4. How does Binance's MPC keyless design relate to the TEE in its SAS FAQ?
  5. Real paid volume on agent marketplaces such as Virtuals ACP.

## S Method and evidence {depth=3}
- **Inputs**: your notes; a ChatGPT Deep Research result (2026-10-21), used only as leads.
- **Method**: four parallel lanes (MetaMask + Coinbase; Binance + BNB + OKX; wider ecosystem and infrastructure; protocol stack + demand + Mantle). A claim counts as observed only when traced to a primary source; second-hand claims are inferred or speculative. We spot-checked 6 observed claims, and the sources support all of them.
- **Ledger**: 207 claims, observed 153, inferred 46, speculative 8, stored in `research/ledger.md` in the report folder.
- **Commands**: the Routescan API for the implementation ABIs of Mantle USDC (`0x09Bc…0dF9`) and USDT0 (`0x779D…3736`); the GitHub API to pin the Binance (`b402990`) and OKX (`0346354`) skill repository commits.
- **GPT source claims corrected by primary sources**:
  - The MetaMask post you shared is not the launch post; MetaMask opened Early Access on 06-08 and launched on 08-06.
  - Coinbase's MCP version cannot send or trade at all; GPT missed Wallet MCP, the per-action approval path.
  - MetaMask counts multi-hop swaps twice for certain, not "may".
  - OKX can export the seed phrase; the agent then loses access.
  - BNB's "demand still has to be proven" comes from the BNB Chain blog of 2026-07-16; the source for the ERC-8004 / 8183 Draft status was also wrong.
  - x402 verifies first and settles later by default; it is not "pay first".
  - GPT gave no demand data, did not mention wash trading, and did not report Mantle's 7702, 4337 and 8004 support.

## T Glossary {depth=2}
```glossary
TEE | trusted execution environment | An isolated area inside the CPU where keys are created and used; the host system cannot read them. | not the same as safe policy
MPC | threshold signing | The private key is split into shares on different machines that sign together; no single place can rebuild the full key.
smart account | contract account | An account whose signature rules live in a contract, so it can reject transactions by rule. | not an EOA
session key | | A temporary key issued by the owner, usable only on set contracts and functions, within a cap and before an expiry. | not the main key
EIP-7702 | EOA delegation | Lets an EOA delegate to contract code; the protocol itself has no permission system.
ERC-4337 | account abstraction | A contract-account design with no consensus change: EntryPoint, bundler, paymaster and 2D nonce.
paymaster | gas sponsor contract | An ERC-4337 contract that pays gas for the user and may charge an ERC-20 instead.
ERC-7579 | modular account standard | Defines module interfaces for contract accounts; Crossmint wallets use it.
ERC-1271 | contract signature check | A standard interface for contract accounts to validate signatures. | not an ECDSA v,r,s signature
ERC-7715 | permission request | The wallet RPC `wallet_requestExecutionPermissions`, which dapps use to request permission to act for the user.
ERC-7710 | delegation redemption | The `redeemDelegations` interface: check the delegation, then execute for the delegator.
caveat enforcer | | An on-chain contract in the MetaMask Delegation Framework that applies a limit and reverts when it fails.
EIP-3009 | transferWithAuthorization | One signed off-chain authorization moves a set amount; anyone can submit it while it is valid. | revoking the agent does not void it
Permit2 | | Uniswap's approval contract; one signature hands token spending power to a third party.
x402 | HTTP 402 payments | A pay-per-request protocol: the server returns 402 and a price, and the client resends with a signed payment.
facilitator | | The x402 service that verifies payments and settles them on chain for the server; it holds no funds.
Bazaar | x402 service directory | Coinbase's directory for finding x402 services.
MPP | Machine Payments Protocol | A 402 payment protocol by Stripe and Tempo that is not tied to one payment rail.
AP2 | Agent Payments Protocol | Uses checkout and payment mandates plus receipts to record purchase authority and dispute evidence.
ERC-8004 | trustless agents | Identity, reputation and validation registries; does not handle payment. | not a trust certificate
ERC-8183 | job escrow | A state machine for job escrow, submission, evaluator decision and refund on expiry.
MCP | Model Context Protocol | A protocol for agents to call external tools.
skill | agent skill | Notes and scripts for the agent that say when to run which command. | not a server-side limit
BYOK | bring your own wallet | MetaMask's local signing mode: the user supplies a seed phrase in an environment variable.
Guard Mode | | MetaMask's protective mode: threat scanning, network / address / recipient allowlists and a rolling 24-hour limit.
Beast Mode | | MetaMask's open mode: threat scanning only, no allowlists or limits.
outflow limit | | MetaMask's rolling 24-hour limit on simulated USD outflow; signed approvals are not counted. | not a loss cap
Transaction Shield | | MetaMask's threat scanning and transaction protection; not available on Mantle.
Secure Auto Sign | | Binance's service that runs actions without per-action prompts after one approval.
Developer Mode | | Binance's controlled exception that opens arbitrary contract calls; app-only, with its own limit and an expiry.
Onchain OS | | OKX's data and trading tool platform; Agentic Wallet is its execution part.
TWAK | Trust Wallet Agent Kit | Trust Wallet's agent CLI, which creates and encrypts the wallet locally.
KYT | know your transaction | Transaction risk screening; Coinbase blocks flagged transfers before they reach the chain.
root user | Turnkey root | A Turnkey user that bypasses the policy engine; an agent must not be one.
Prompt injection | | Instructions hidden in outside content that push the agent into actions the user did not ask for.
wash trading | | Trading with yourself to create fake volume.
```

## U References {depth=2}
1. [MetaMask Agent Wallet: Architecture](https://docs.metamask.io/agent-wallet/reference/architecture/) — two wallet modes, TEE, 7702 relay, 7821 batching. **PRIMARY**
2. [MetaMask: Trading modes](https://docs.metamask.io/agent-wallet/reference/trading-modes/) — Guard / Beast, policy YAML, 2FA conditions. **PRIMARY**
3. [MetaMask: Outflow policy](https://docs.metamask.io/agent-wallet/reference/outflow-policy/) — how the limit counts, Permit2 not counted, multi-hop counting. **PRIMARY**
4. [MetaMask: Agent rules](https://docs.metamask.io/agent-wallet/agent-rules/) — confirm first, no automatic x402 retry. **PRIMARY**
5. [MetaMask: Supported chains](https://docs.metamask.io/agent-wallet/reference/supported-chains/) — Mantle 5000, Transaction Shield = No. **PRIMARY**
6. [MetaMask: Pay for APIs with x402](https://docs.metamask.io/agent-wallet/guides/pay-for-apis-x402/) — exact + 3009, stateless script. **PRIMARY**
7. [MetaMask blog: Introducing MetaMask Agent Wallet](https://metamask.io/news/introducing-metamask-agent-wallet) and [EA press release](https://metamask.io/news/metamask-launches-agent-wallet-giving-ai-agents-full-defi-access-with-default-security-on-every-transaction) — GA on 08-06, EA on 06-08, export FAQ. **PRIMARY**
8. [MetaMask: Agent Wallet quickstart](https://metamask.io/news/metamask-agent-wallet-quickstart) — server-wallet export not available yet. **PRIMARY**
9. [MetaMask Smart Accounts Kit: Advanced Permissions](https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/) and [caveat enforcers](https://docs.metamask.io/smart-accounts-kit/concepts/delegation/caveat-enforcers/) — 7715 / 7710, on-chain enforcement. **PRIMARY**
10. [Coinbase CDP: Agentic Wallet](https://docs.cdp.coinbase.com/agentic-wallet/welcome) — CLI vs MCP scope. **PRIMARY**
11. [Coinbase CDP: Agentic Wallet CLI](https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome) — networks, key isolation, per-call / per-session caps, KYT. **PRIMARY**
12. [Coinbase CDP: Agentic Wallet MCP FAQ](https://docs.cdp.coinbase.com/agentic-wallet/mcp/faq) — caps set in the UI, agent cannot change them, sponsored gas. **PRIMARY**
13. [Coinbase CDP: Spend Permissions](https://docs.cdp.coinbase.com/wallets/using-wallets/spend-permissions) — on-chain Spend Permissions vs off-chain Policies. **PRIMARY**
14. [Coinbase CDP: Wallet MCP](https://docs.cdp.coinbase.com/ai-agents/coinbase-for-agents/wallet-mcp) — every write action needs approval. **PRIMARY**
15. [Coinbase: Agentic Wallets launch post](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) — 2026-02-11, TEE, session caps. **PRIMARY**
16. [Binance announcement: Agentic Wallet](https://www.binance.com/en/support/announcement/detail/0c533c5a820341ce87e5ddda76f36ac0) — 2026-04-24, separate keyless wallet, SAS. **PRIMARY**
17. [Binance Web3 dev docs: Agentic Wallet](https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction) and [Developers docs](https://developers.binance.com/en/docs/products/agentic-wallet/welcome) — MPC, API-layer rules, scope, Developer Mode. **PRIMARY**
18. [Binance Blog: Agentic Wallet Controls](https://www.binance.com/en/blog/tech/7276731523787720812) — four limits, forced allowlist, Developer Mode limits. **PRIMARY**
19. [binance/binance-skills-hub](https://github.com/binance/binance-skills-hub) `binance-agentic-wallet/SKILL.md @b402990` — confirmation rule, command list. **PRIMARY**
20. [OKX: Agentic Wallet launch](https://www.okx.com/en-gb/help/okx-wallet-officially-launches-agentic-wallet) and [Onchain OS docs](https://web3.okx.com/onchainos/dev-docs/wallet/agentic-wallet) — 2026-03-18, TEE, 50 sub-wallets. **PRIMARY**
21. [okx/onchainos-skills](https://github.com/okx/onchainos-skills) `okx-agentic-wallet @0346354` — four policy rules, export, `--force`, any calldata. **PRIMARY**
22. [OKX Onchain OS: Supported Networks](https://web3.okx.com/onchainos/dev-docs/wallet/supported-networks) — Mantle ✓, x402 payments "-". **PRIMARY**
23. [BNB Chain Blog: Agent Studio v1](https://www.bnbchain.org/en/blog/bnb-agent-studio-is-live-on-bnb-chain-ai-agents-from-one-prompt), [v2](https://www.bnbchain.org/en/blog/bnb-agent-studio-v2-your-agents-your-rules), [v3](https://www.bnbchain.org/en/blog/bnb-agent-studio-v3-turnkey-joins-as-a-wallet-option) — timeline, payments to agents, wallet options. **PRIMARY**
24. [BNB Chain Docs: BNB Agent Studio](https://docs.bnbchain.org/developer-kit/bnbchain-studio) — signing is fixed code, read-only MCP. **PRIMARY**
25. [BNB Chain Blog: AI Agent Landscape](https://www.bnbchain.org/en/blog/bnb-chain-ai-agent-landscape-agents-tools-and-payments) — "application-level demand … still has to be proven". **PRIMARY**
26. [Altana Docs: Sessions](https://docs.altana.network/concepts/sessions) — on-chain enforcement, no calls list means no limit. **PRIMARY**
27. [Turnkey: Agentic Wallets](https://docs.turnkey.com/solutions/company-wallets/agentic-wallets) and [Root quorum](https://docs.turnkey.com/concepts/users/root-quorum) — non-root agents, root bypasses policy. **PRIMARY**
28. [Trust Wallet TWAK: Key Management](https://developer.trustwallet.com/developer/agent-sdk/key-management) and [CLI Reference](https://developer.trustwallet.com/developer/agent-sdk/cli-reference) — local encryption, watcher. **PRIMARY**
29. [Phantom MCP Server](https://docs.phantom.com/phantom-mcp-server) and [Tools](https://docs.phantom.com/phantom-mcp-server/tools) — dedicated wallet, KMS, confirmation flag, supported chains. **PRIMARY**
30. [Crossmint: Agents](https://docs.crossmint.com/agents/overview), [Wallet architecture](https://docs.crossmint.com/wallets/architecture), [Scopes](https://docs.crossmint.com/wallets/guides/signers/scopes), [Cards](https://docs.crossmint.com/agents/cards/overview) — contract-enforced limits, transfer scope, card networks. **PRIMARY**
31. [Safe: AI agent quickstarts](https://docs.safe.global/home/ai-agent-quickstarts/introduction) — 4 setups, 1-of-1 discouraged. **PRIMARY**
32. [Privy: Agent wallets](https://docs.privy.io/wallets/overview/solutions/agent-wallets) and [Policies](https://docs.privy.io/controls/policies/overview) — TEE-enforced policy, deny by default. **PRIMARY**
33. [Stripe: Link Agent Wallet](https://docs.stripe.com/agentic-commerce/link-cli) and [MPP](https://docs.stripe.com/payments/machine/mpp) — per-spend approval; MPP positioning. **PRIMARY**
34. [x402: Payment Schemes](https://docs.x402.org/schemes/overview), [Network and token support](https://docs.x402.org/core-concepts/network-and-token-support), [Facilitator](https://docs.x402.org/core-concepts/facilitator) — schemes, flows, new-network checklist, reconciliation. **PRIMARY**
35. [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) — identity registry, no payments, Sybil risk. **PRIMARY**
36. [EIP-8183](https://eips.ethereum.org/EIPS/eip-8183) — job escrow, evaluator, no arbitration. **PRIMARY**
37. [AP2 specification v0.2](https://ap2-protocol.org/ap2/specification/) — mandates, deterministic code, open payment methods. **PRIMARY**
38. [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715) and [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710) — permission request and redemption. **PRIMARY**
39. [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) and [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) — contract accounts and EOA delegation. **PRIMARY**
40. [Anthropic: Prompt injection defenses](https://www.anthropic.com/research/prompt-injection-defenses) — attack success rates and "No browser agent is immune". **PRIMARY**
41. [OpenAI: Agent Builder safety](https://developers.openai.com/api/docs/guides/agent-builder-safety) — tool approvals, untrusted data. **PRIMARY**
42. [Artemis: x402](https://classic.artemis.ai/asset/x402) and [Agentic Payments](https://www.artemis.ai/sectors/agentic-payments) — daily txs, value, gamed split; the Dec 2025 report is seen only second-hand.
43. [8004scan](https://8004scan.io/agents) and [arXiv 2606.26028](https://arxiv.org/pdf/2606.26028v3) — registrations; share with valid endpoints.
44. [Mantle: Skadi upgrade](https://docs.mantle.xyz/network/for-node-operators/network-updates/changelogs/mantle-v2-v1.3.1-skadi-upgrade.md) — Prague features and EIP-7702. **PRIMARY**
45. [Pimlico: Supported chains](https://docs.pimlico.io/guides/supported-chains) — Mantle EntryPoints and 7702. **PRIMARY**
46. [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts) and [Mantle press release](https://www.prnewswire.com/news-releases/mantle-unlocks-autonomous-economy-with-erc-8004-deployment-302688549.html) — Mantle mainnet registry addresses. **PRIMARY**
47. Routescan API: implementation ABIs of Mantle USDC `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` and USDT0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` — 3009 signature forms. **PRIMARY**
48. [USDT0: EIP-3009](https://docs.usdt0.to/technical-documentation/token-features/eip-3009) — validity window and cancelAuthorization. **PRIMARY**
49. [arXiv 2605.19337: Agentic Trading](https://arxiv.org/pdf/2605.19337v2) — retrieval latency vs high-frequency strategies.
