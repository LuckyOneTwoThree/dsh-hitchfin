# dsh-hitchfin (`DeepSeek Harness · Hitchfin`) 项目文档中心

> **Hitchfin（䲟鱼）**：吸附于巨鲸（DeepSeek Harness）之上的共生领航者。  
> 基于本机 **DeepSeek Harness Desktop (`0.2.1-rc.5`)** 真实服务契约（`ctx.llm`、`ctx.credentials`、`dsh-llm-retry`、`@earendil-works/pi-ai`），为 DSH 增量补齐**多账号订阅池、跨渠道智能路由组、实时配额窗口徽标与策略化出站隐私脱敏**能力。

---

## 1. 项目定位与设计原则（Build vs. Reuse）

经过对本机 DSH `0.2.1-rc.5` 源码与类型定义的严格交叉核验（详见 [`00-verification.md`](./00-verification.md)），`dsh-hitchfin` 确立了 **「最大化复用 DSH 原生 Seam，仅自研高价值增量」** 的核心工程原则：

| 能力层 | DSH `0.2.1-rc.5` 已有原生底座（直接复用） | `dsh-hitchfin` 自研增量（核心价值） |
| :--- | :--- | :--- |
| **模型协议与流组装** | `@earendil-works/pi-ai` (`openai-completions` / `openai-responses` / `anthropic-messages`) + `LlmRuntime` + `ReplayEnvelope` | 在 `@earendil-works/pi-ai` 之上封装**多账号池动态选号**与自定义 `fetch` 桥接 |
| **凭证存储与登录** | `ctx.credentials.modifyRecord`（自带跨进程排他锁）+ `ctx.authorization`（OAuth / Device Code 交互） | 突破 `llm-pi-ai` 的「单渠道单账号」限制，按 `dsh-hitchfin/<channel>-<slot>` 支持**单渠道 N 账号池** + **Magpie 桥接/迁移双模式** + **隔离子进程运行 `@magpie-community` 插件** |
| **限流重试与切号** | `@deepseek-ai/dsh-llm-retry`（在 Agent Step 边界持久化重试） | **账号冷却状态机（Cooldown）+ 路由组（`smart`/`order`/`rotate`/`pace`）+ Sticky Cache**：遇 429 标记账号冷却并交由 `dsh-llm-retry` 在 Step 边界干净重跑切往下一账号 |
| **角色与子代理分流** | 原生 `dsh-agent-default-model`、`dsh-session-title-llm`、`ui-settings-subagent` | 将路由组（如 `hitchfin/daily-coding`、`hitchfin/fast`）注册为标准可选模型，供原生设置页直接绑定 |
| **Token 计量与配额** | `ctx.tokenMeter`（统计输入/输出/缓存与上下文压力） | 新增**订阅账号 5h/7d 滚动配额窗口快照、重置倒计时与自动预热/签到** |
| **隐私脱敏** | `@deepseek-ai/dsh-client-ui-secret-mask`（仅限前端用户发送文本视觉遮罩） | 基于 `ctx.on('llm/stream')` Waterfall 的**真实出站请求脱敏** + **防 Tool Call 外泄策略（Exfiltration Guard）** |

---

## 2. 文档目录导航

本项目全套支撑文档如下（阅读顺序建议从 `00` 开始）：

0. **[`00-verification.md` · 本机环境与 DSH `0.2.1-rc.5` 契约核验基线 (ADR)](./00-verification.md)**
   * 本机 DSH `0.2.1-rc.5` 与 Magpie `0.1.2891` 实测事实、真实 `.d.ts` 接口核对表，以及 6 项核心架构收敛决策（ADR-01 ~ ADR-06）。
1. **[`01-architecture.md` · 系统架构设计方案](./01-architecture.md)**
   * 基于 DSH 原生 Seam 的增量架构图、双轨运行模式（Magpie 桥接模式 vs 独立多号池模式）、`TypertRemoteService` 通信契约与工程目录规划。
2. **[`02-channels-and-subscriptions.md` · 核心能力 A：多账号订阅池与渠道桥接规范](./02-channels-and-subscriptions.md)**
   * `ctx.credentials` 多账号槽位寻址、防 Refresh Token 竞态的 Magpie 桥接/迁移协议、独立子进程 `MagpiePluginWorker` 沙箱契约与合规边界（ToS）。
3. **[`03-routing-and-rosetta.md` · 核心能力 B：智能路由组与协议适配规范](./03-routing-and-rosetta.md)**
   * 与 `@deepseek-ai/dsh-llm-retry` 协同的 Step 边界无损 Failover 机制、`smart`/`order`/`rotate`/`pace` 选号模型、复合键 Sticky Session 以及基于 `@earendil-works/pi-ai` 的协议桥接。
4. **[`04-masking-and-ui.md` · 核心能力 C：策略化出站脱敏与原生 Slot UI 规范](./04-masking-and-ui.md)**
   * 威胁模型（防 Tool Call 密钥外泄）、`block-end` 完整块还原与 JSON 转义、持久化 Salt，以及基于 `conversation.input.model.label` / `conversation.input.right` / `settings.section` 的收敛式 UI 设计。
5. **[`05-roadmap-and-milestones.md` · 分阶段开发计划（含 Phase 0 POC）与测试矩阵](./05-roadmap-and-milestones.md)**
   * **Phase 0（5 个 Go/No-Go 真机 POC）** $\rightarrow$ **Phase 1（最小垂直切片 MVP）** $\rightarrow$ **Phase 2（多账号池与智能路由组）** $\rightarrow$ **Phase 3（出站脱敏与额度看板）**，以及完整测试与回滚方案。
