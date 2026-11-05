# 03 · 核心能力 B：智能路由组与协议适配规范 (Smart Routing & Protocol Bridge Spec)

本文档定义 `dsh-hitchfin` 的智能路由组算法、与 `@deepseek-ai/dsh-llm-retry` 原生重试机制的协同切号契约、并发安全的 Sticky Session 粘性缓存，以及基于 `@earendil-works/pi-ai` 的协议桥接规范。

---

## 1. 与 DSH 原生能力咬合的路由与 Failover 机制 (`src/router/`)

### 1.1 为什么不自己重写 `purpose` 子代理拦截，也不做流内隐式重试？
1. **角色与用途路由复用原生设置**：
   * 在 DSH `0.2.1-rc.5` 中，`GenerateOptions.purpose` 仅包含 `'compaction' | 'session-title'`（不含 `'subagent'`），且 DSH 已经内置了原生的默认模型设置（`dsh-agent-default-model`）、子代理模型设置（`ui-settings-subagent`）与会话标题生成模型配置（`dsh-session-title-llm`）。
   * 因此，`dsh-hitchfin` 的职责是将配置好的**智能路由组**（如 `hitchfin/daily-coding`、`hitchfin/fast-economy`）作为标准模型发布到 `ctx.llm` 目录中，用户可直接在 DSH 原生的主对话、Subagent、标题生成配置里选用对应路由组，零侵入、零硬编码。
2. **与 `@deepseek-ai/dsh-llm-retry` 协同实现 Step 边界无损 Failover**：
   * 若在 `LlmAdapter.stream()` 内部自行捕获错误并重连，一旦上游在发出 `block-start` 或半截文本后才中断，流内重试会导致 DSH 的 `BlockAssembler` 收到重复或错乱的块索引；同时还会与 `@deepseek-ai/dsh-llm-retry` 叠加成双重重试。
   * **正确契约（Cooldown + Native Step Retry）**：

```mermaid
sequenceDiagram
    participant Loop as DSH Agent Loop + dsh-llm-retry
    participant Adapter as HitchfinAdapter
    participant Router as SmartRouter & CooldownTable
    participant Acct1 as 账号 #1 (首选)
    participant Acct2 as 账号 #2 (备选)

    Loop->>Adapter: Attempt 1: stream(options)
    Adapter->>Router: selectCandidate(options)
    Router-->>Adapter: 命中 账号 #1
    Adapter->>Acct1: 发起请求
    Acct1-->>Adapter: 返回 HTTP 429 / Quota Exhausted
    Adapter->>Router: markCooldown(Acct1, cooldownMs)
    Adapter-->>Loop: yield finish { kind: 'error', failure: { code: 'RATE_LIMIT', providerRetryAfterMs: 100 } }
    Note over Loop: dsh-llm-retry 捕获 RATE_LIMIT：<br/>1. 丢弃 Attempt 1 的任何未完成分片<br/>2. 写入持久化 llm/retry 事件<br/>3. 等待 100ms 后在同一 Turn 重跑 Step
    Loop->>Adapter: Attempt 2: stream(options)
    Adapter->>Router: selectCandidate(options) (此时 Acct1 处于 Cooldown)
    Router-->>Adapter: 自动命中 账号 #2
    Adapter->>Acct2: 发起请求
    Acct2-->>Adapter: 200 OK (流式输出)
    Adapter-->>Loop: 正常输出 StreamChunk 直至 finish { kind: 'stop' }
```

* **对于非 Agent Loop 的直接调用（如 `session-title` 单次调用）**：
  仅在**尚未向调用方 yield 任何 `StreamChunk`（即 `commitPointReached === false`，连首个 `block-start` 都未发出）**的连接/首包 HTTP 状态码错误阶段，允许在连接建立阶段切换一次备用账号；一旦发出首个 `StreamChunk`，即锁定不可回滚，任何中途错误均转化为标准 `finish { kind: 'error', failure }`。

---

## 2. 路由组策略与 Sticky Session 规范 (`group-router.ts` & `sticky-cache.ts`)

### 2.1 路由组选号策略（修正版）
过滤掉所有处于 `cooldown`、`quota-exhausted`、`reauth-required` 的候选后，支持以下策略：

1. **`order`（严格主备优先级 —— 默认策略）**：
   * 按用户在路由组中排列的成员与账号顺序，始终选择第一个健康账号；仅当其进入冷却或耗尽时切往下一顺位。
2. **`rotate`（轮询负载均衡）**：
   * 当不存在有效的 Sticky Session 锁时，在所有健康候选间按 Round-Robin 轮转。
3. **`smart`（同档位窗口到期优先）**：
   * 针对有明确 `windowResetAt` 与 `remainingPct` 的订阅账号，优先选择距离 `windowResetAt` 最近且 `remainingPct >= 10%` 的账号（注：仅在同渠道或用户配置的同权重档位内比较百分比，跨档位支持配置权重系数 `tierWeight`）。
4. **`pace`（周窗口余量匀配）**：
   * 综合检查 5h 窗口（必须 `>= 10%`）与 7d 周窗口余量速率 $\text{PaceScore} = \text{tierWeight} \times \frac{\text{WeeklyRemainingPct}}{\max(1, \text{HoursUntilWeeklyReset})}$，选择得分最高者。

### 2.2 复合键 Sticky Session 粘性缓存 (`sticky-cache.ts`)
为了保护上游 Prompt Cache 且避免会话中途切换模型/推理档位时错配旧账号：
* **复合粘性键（Sticky Key）**：
  $$\text{StickyKey} = \texttt{`\$\{sessionId ?? 'ephemeral'\}|\$\{provider\}|\$\{model\}|\$\{reasoningEffort ?? 'default'\}`}$$
* **优先级与并发规则**：
  * **优先级**：`Sticky Session（未过期且账号健康）` > `路由组选号策略（smart / rotate / order / pace）`。即只要粘性锁有效，即使是 `rotate` 策略也保持在同一账号上以维持 KV Cache。
  * **并发安全**：同一会话（或多子代理）并发发起请求时，若粘性目标账号正在处理请求且未报 429，并发请求共享该粘性目标；一旦任一并发请求收到 429，原子清除该 `StickyKey` 并触发冷却切换。

---

## 3. 基于 `@earendil-works/pi-ai` 的协议桥接与流契约 (`src/adapter/`)

### 3.1 全面对齐 `@deepseek-ai/dsh-llm@0.2.1-rc.5` 的 `StreamChunk` 与错误码
`HitchfinAdapter` 严格产出符合 `0.2.1-rc.5` 规范的 `StreamChunk` 序列：

| 分片阶段 | 精确 `StreamChunk` 结构 (`0.2.1-rc.5`) | 关键实现约束 |
| :--- | :--- | :--- |
| **块开始** | `{ type: 'block-start', index: number, blockType: 'text' \| 'reasoning' \| 'tool-call' }` | 思考块类型必须是 `'reasoning'`（绝不是 `'thinking'`） |
| **文本增量** | `{ type: 'text-delta', index: number, text: string }` | 增量文本 |
| **推理增量** | `{ type: 'reasoning-delta', index: number, text: string }` | 分片类型必须是 `'reasoning-delta'` |
| **工具调用增量** | `{ type: 'tool-call-delta', index: number, id: ToolCallId, name?: string, argumentsDelta: string }` | `argumentsDelta` 为原始 JSON 字符串片段 |
| **块结束** | `{ type: 'block-end', index: number, block: TextBlock \| ReasoningBlock \| ToolCallBlock }` | **必须携带完整的已组装 `block`** |
| **Token 计量** | `{ type: 'usage', usage: { inputTokens, outputTokens, totalTokens?, cacheReadTokens?, cacheWriteTokens?, reasoningTokens? } }` | `inputTokens` 为**未缓存输入**（需从含缓存总 prompt_tokens 中减去 `cacheReadTokens`） |
| **终止分片** | `{ type: 'finish', reason: FinishReason, replayState?: ReplayEnvelope }` | `aborted` 与 `error` 均必须携带 `failure: LlmFailure` |

### 3.2 标准错误码映射表 (`LlmFailure.code`)
上游错误统一映射为 DSH 消费方与 `dsh-llm-retry` 识别的标准机器码：
* `RATE_LIMIT`：HTTP 429 或上游并发/速率受限（附带 `providerRetryAfterMs`）；
* `QUOTA`：订阅窗口额度耗尽、积分用尽或 HTTP 402；
* `AUTH`：HTTP 401/403 且刷新凭证失败；
* `MISSING_CREDENTIAL` / `INVALID_CREDENTIAL`：未配置账号或 Token 含非法 Header 字符；
* `CONTEXT_WINDOW_EXCEEDED`：输入超出模型上下文上限；
* `IMAGE_OFFLOAD_REQUIRED`：图片总字节超出路由预算（触发 `dsh-compaction-image-offload`）；
* `EMPTY_RESPONSE` / `SERVER` / `TIMEOUT` / `TRANSPORT`：上游空包、5xx、超时与网络异常。

### 3.3 `ReplayEnvelope` 与跨模型切换降级保护 (`replay.ts`)
* 当请求在同一 Adapter 实例和同一模型下连续对话时，通过 `finish.replayState` 保存并恢复 `@earendil-works/pi-ai` 的版本化 `ReplayEnvelope`（保留 `responseId`、`thinkingSignature`、`thoughtSignature`）。
* 当路由组发生**跨模型或跨协议故障转移**（例如从 Anthropic 切到 OpenAI Responses）时，自动检测历史消息中 `replayState` 的 `provider/api` 与当前选定目标不一致，**主动剥离异构签名并以 provider-neutral 纯文本/结构化块发送**，防止上游因不识别异构签名而返回 `400 Bad Request`。
