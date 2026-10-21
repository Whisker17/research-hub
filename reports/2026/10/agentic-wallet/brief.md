---
title: Agentic Wallet：产品形态、技术原理与 agent 的活动空间
summary: 拆解 MetaMask、Coinbase / Base、Binance / BNB Chain、OKX 等 agentic wallet：产品形态怎么设计、用了什么技术原理、要解决什么问题、边界在哪，以及 agent 在 crypto 经济里真正的活动场景
slug: agentic-wallet
domain: crypto
tags: [ai-agent, account-abstraction, payment, security, mantle, wallet]
visibility: private
---

# Agentic Wallet：产品形态、技术原理与 agent 的活动空间

## 想知道什么
1. 产品形态：各家 agentic wallet 分别给 agent 和用户提供了什么？包括入口（CLI / Skills / MCP）、账户模式（独立预算钱包 / 主账户的受限授权 / 完整平台）、能做的操作，以及默认要不要人确认。
   - 核心四家：MetaMask Agent Wallet；Coinbase Agentic Wallet（Base）；Binance Agentic Wallet / BNB Agent Studio；OKX Agentic Wallet（Onchain OS）。
   - 其它生态：Phantom（Solana，MCP server）；Crossmint（agent wallets + agent 卡，可对照 crypto 与卡网络两条路线）；Trust Wallet Agent Kit（TWAK，本地密钥）；Safe（有 agent 相关产品就纳入，没有就作为智能账户对照）。
   - 底层基础设施（Privy、Turnkey、Altana）只作技术对照。
2. 技术原理：密钥放在哪里（TEE / MPC / 本地加密 / 智能账户 session key）？权限策略在哪一层执行（提示词 / API / TEE / 链上），谁能修改？交易怎么构建和执行（gas 代付、批处理、模拟、风险扫描）？各自有哪些已知的绕过路径和边界？
3. 要解决什么问题：逐条检验我的判断——agents 不能控制私钥；agents 需要被权限约束；需要确定性的指令执行、减少推理；如何把 agents 提升为一等公民；给 agents 充分的活动空间。还有哪些我没考虑到（例如提示注入、持续运行与故障恢复、退出与恢复、支付后能否拿到应得的东西）？
4. 活动场景：agent 替代的是原本人在生态里的活动范围。哪些活动适合 agent（根据信息推理后再操作），哪些应该留给确定性 bot（例如三角套利）？现有数据和案例能证明 agent commerce 的需求有多真实？
5. 钱包之外还缺什么：x402、ERC-8004、ERC-8183、AP2、ERC-7715 / 7710、ERC-4337 / 7702 各自负责哪一层，和钱包怎么拼在一起？
6. 对 Mantle 的启示：上述产品在 Mantle 上的实际支持情况（例如 MetaMask 已列出 Mantle，但 Transaction Shield 不可用）；x402 等支付路径在 Mantle 上能否走通；Mantle 应优先补哪一层。

## 为什么现在
personal agent 爆发，agents commerce 重新升温，首当其冲的就是 agent 的入口。MetaMask 推出了 Agent Wallet（https://x.com/MetaMask/status/2110426474071097697），BSC、Base、OKX 也推出了类似产品。

## 范围
- 包括：核心四家产品的形态、技术原理、要解决的问题和边界；扩展生态按统一维度对比，不逐家展开到同样深度；agent 的活动场景；钱包周边协议（只讲它们和钱包怎么衔接）；Mantle 启示（末尾单独一个面板，正文保持中立视角）。
- 不包括：真实资金测试和安全审计；投资建议；协议规范的逐字段细节。

## 读者
懂 EVM 和钱包 / AA 基础的开发者与产品，还没系统看过 agentic wallet。

## 已有资料
- `Research Briefs/drafts/agentic-wallet-deep-dive.md`：我的想法，研究问题的原话出处。
- `Research Briefs/references/agentic-wallet-deep-dive.md`：GPT Deep Research 结果（2026-10-21），只作线索，论断要追到一手来源。
- 资料之外：允许补查一手来源（官方文档、规范、公告、GitHub、链上数据），查不到的标 speculative。

## 交付要求
- research 模式 explainer：5 分钟拿到结论，30 分钟讲清原理，完整阅读能复核。
- 用统一维度对比各产品：密钥托管、策略在哪层执行、入口、能力范围、人工确认、退出与恢复、已知边界。
- 图：agent 经济栈分层（工具 / 账户与授权 / 支付 / 身份 / 任务）、权限检查发生在哪一层、一次受限授权从提案到执行的时序。
- 逐条回应我的五个判断：哪些成立，哪些要修正。
- 中英文双版 + 推特卡片。
