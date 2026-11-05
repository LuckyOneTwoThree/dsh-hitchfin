# 00 · 本机环境与 DSH `0.2.1-rc.5` 契约核验基线 (Verification Baseline & ADR)

> **定位**：本文档记录针对本机实际运行环境与 `@deepseek-ai/*@0.2.1-rc.5` 真实解包类型（`.d.ts` 及编译产物）的交叉核验结果，作为 `dsh-hitchfin` 不可违背的工程事实底座与架构决策记录（ADR）。

---

## 1. 本机运行环境实测基线（已验证 ✅）

| 检查项 | 实测路径 / 命令 | 实测版本 / 状态 | 结论与影响 |
| :--- | :--- | :--- | :--- |
| **DSH Desktop 宿主** | `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/runtime.json` | `desktopVersion: "0.2.1-rc.5"` (`darwin-arm64`) | 所有 `@deepseek-ai/*` 接口必须严格对齐 **`0.2.1-rc.5`**（而非 GitHub `master` 分支未发布改动） |
| **内置 Node / pnpm** | `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/versions.json` | Node `24.21.0` / pnpm `11.28.5` | 插件构建与测试统一使用 DSH 自带 Node `24.21.0`，支持原生 `fetch` 与 Web Streams |
| **活跃 Profile 目录** | `~/.dsh/profiles/desktop/` | 含 `package.json`、`cordis.patch.yml` | 插件挂载通过 `dsh.bundle.patch` (`cordis.patch.yml`) 与 `dsh.client` (`client.js`) |
| **本机 Magpie 网关** | `~/.config/magpie/` & `127.0.0.1:3425` | Magpie `0.1.2891` 正在监听 | 存在 `logins.json`、`plugin-auth.json`、`providers.json` 及 `.lock` 锁文件；需防 Refresh Token 旋转竞态 |
| **本机 `@magpie-community` 插件** | `~/.config/magpie/plugins/node_modules/@magpie-community/` | 已安装 `opencode-workbuddy-auth@0.2.21`、`opencode-trae-auth`、`opencode-zcode-auth` | 纯 ESM 模块，无 `Bun` 专有 API 引用；但包导出入口为 `opencode.mjs` / `opencode2.mjs`，且属第三方可执行代码 |

---

## 2. DSH `0.2.1-rc.5` 核心服务契约核验表（已验证 ✅）

以下契约直接提取自 `@deepseek-ai/dsh-llm@0.2.1-rc.5`、`@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.5`、`@deepseek-ai/dsh-llm-retry@0.2.1-rc.5`、`@deepseek-ai/dsh-credentials@0.2.1-rc.5` 与 `@deepseek-ai/dsh-client-ui-*@0.2.1-rc.5` 的 `.d.ts` 与源码：

### 2.1 `@deepseek-ai/dsh-llm` (`ctx.llm: LlmRuntime`)
1. **服务类名与拦截器**：
   * `ctx.llm` 实例类型为 `LlmRuntime`（继承自 `TypertRemoteService`）。
   * 提供全局流式拦截 Waterfall：`ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>)`。
   * Loop 构造的请求携带 `isAgentLoopRequest(options)` 标记且**处于深度冻结（deep-frozen）状态**，严禁原地修改 `options`。
2. **拓扑变更通知**：
   * 事件名为**无参数的 `'llm/adapters-updated'(): void`**（不存在 `'llm/models-updated'`）。
   * 调用 `ctx.llm.registerAdapter(providers, adapter)`、返回句柄的 `handle.replace(providers)`、或 `registerConfigurableProviders` 的 `replace()` 时，`LlmRuntime` 内部会自动触发 `'llm/adapters-updated'`。
3. **模型目录与元数据 (`LlmModelInfo` & `LlmResolvedModelInfo`)**：
   * `LlmModelInfo` 仅含 `{ provider, id, name, description?, inputModalities? }`，**不含 `badge` 字段**。
   * 上下文窗口（`context.contextWindow`）、默认输出上限（`defaultMaxTokens`）、推理档位（`reasoning.efforts` / `defaultEffort`）、`systemPromptUpdate` (`'in-history'`)、`toolUpdate` (`'in-history' | 'addition-only'`) 均由 `adapter.resolveModel(provider, model, signal)` 返回。
4. **流式分片 (`StreamChunk`) 与内容块 (`ContentBlock`)**：
   * 推理/思考块：`ReasoningBlock` (`{ type: 'reasoning', text: string }`)，对应流式分片为 **`{ type: 'reasoning-delta', index, text }`**（不存在 `thinking-delta`）。
   * 工具调用分片：`{ type: 'tool-call-delta', index, id, name?, argumentsDelta: string }`（`argumentsDelta` 为原始 JSON 字符串片段）。
   * **块结束分片 (`block-end`)**：`{ type: 'block-end', index, block: ContentBlock }` —— **注意：携带已组装完成的完整 `ContentBlock`（含完整的 `ToolCallBlock.arguments` JSON 字符串）**。
   * **终止分片 (`finish`)**：`{ type: 'finish', reason: FinishReason, replayState?: ReplayEnvelope }`。其中 `FinishReason` 的 `'error'` 与 `'aborted'` **均必须携带 `failure: LlmFailure`**（`{ message, code, status?, providerRetryAfterMs?, requestId? }`）。
5. **辅助请求用途 (`GenerateOptions.purpose`)**：
   * 在 `0.2.1-rc.5` 中，`purpose` 联合类型仅为 `'compaction' | 'session-title' | undefined`，**不包含 `'subagent'`**。

---

### 2.2 `@deepseek-ai/dsh-llm-pi-ai` 与 `@earendil-works/pi-ai` 的边界核验
通过直接审查 `dsh-llm-pi-ai@0.2.1-rc.5/lib/index.js` 源码，确认其能力与硬限制如下：

| 维度 | `dsh-llm-pi-ai` 已具备的能力（可直接复用） | `dsh-llm-pi-ai` 的源码级硬限制（需 Hitchfin 扩展解决） |
| :--- | :--- | :--- |
| **底层协议库** | 宿主已内置 `@earendil-works/pi-ai`，包含成熟的 `openai-completions`、`openai-responses`、`anthropic-messages` 协议序列化、SSE 解析与 `toPiReplayState` | `PROTOCOLS` 字典仅注册了上述 3 种协议，未注册 Google Gemini 原生协议；且不支持在配置中直接注入自定义 `fetch` 函数 |
| **凭证寻址** | 已打通 `ctx.credentials` 与 `ctx.authorization` | `recordKeyFor(providerId)` 硬编码为 `credentialKey("llm-pi-ai", providerId)` —— **每个 `providerId` 在凭证库中是 1:1 单例，无法存储同一渠道的多个账号（无多账号池能力）** |
| **内置 OAuth** | 支持 `openai-codex`、`github-copilot` 等内置 catalog provider 登录 | 源码第 2454 行硬编码 `UNSERVED_OAUTH = new Set(["openai"])`，且无法加载外部 `@magpie-community/*` 插件 |

---

### 2.3 `@deepseek-ai/dsh-llm-retry` 的重试边界核验
* `dsh-llm-retry` 监听在 Agent Loop 的 **`agent/request-error` waterfall** 上，遵循 **“durable before wait, open-step boundaries”**。
* 当一次 `ctx.llm.stream()` 以 `{ kind: 'error', failure }` 结束且错误码属于可重试集（`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT`、`EMPTY_RESPONSE`）时，`dsh-llm-retry` 会丢弃本次失败尝试的所有半截输出，写入持久化 `llm/retry` 事件，按 `failure.providerRetryAfterMs`（若合法且在策略上限内）或本地退避等待后，**在同一 Turn 内重新发起该 Step 的 `ctx.llm.stream()` 调用**。

---

### 2.4 客户端 UI Slot 与原生组件核验
1. **模型选择器内联标签 Slot**：
   * 名称：`conversation.input.model.label`（`kind: 'single'`, `scope: 'session'`, `inline: true`）。
   * Owner Props：`{ provider: { id, name }, model: LlmModelInfo, placement: 'trigger' | 'menu' | 'option', selected: boolean }`。
   * **强约束**：挂载在按钮与菜单行内部，**只能渲染非交互内联元素（如额度百分比徽标 `5h 84%`）**，严禁在此挂载可点击弹窗。
2. **输入框工具栏可交互 Slot**：
   * `conversation.input.left` / `conversation.input.right`（`kind: 'list'`, `scope: 'session'`，Owner Props：`{ locked: boolean }`）：适合挂载可点击的「Hitchfin 额度环与快速切号胶囊」。
3. **设置页 Slot**：
   * `settings.section`（`kind: 'list'`, `scope: 'root'`，Options：`{ id, order, label }`）或 `settings.plugins.tab`。
4. **显示层密钥遮罩**：
   * `@deepseek-ai/dsh-client-ui-secret-mask` 仅对 `UserText`（用户已发送消息气泡、队列预览）做纯视觉 `***` 遮罩，**不会修改发往上游模型的请求体，也不遮罩 Assistant 回复或 Tool Card**。

---

## 3. 核心架构决策记录 (ADR)

基于上述实测核验，我们对初版方案做出以下 6 项关键架构收敛决策：

### ADR-01：复用 `@earendil-works/pi-ai` 协议层，放弃从零手写 Rosetta SSE 解析器
* **决策**：直接调用宿主环境已有的 `@earendil-works/pi-ai`（`openAICompletionsApi`、`openaiResponsesApi`、`anthropicMessagesApi`）及 `ReplayEnvelope` 转换逻辑处理协议转换，仅在其外层封装多账号选号与自定义 `fetch` 注入。
* **收益**：砍掉约 70% 的底层协议解析与块组装代码，天然兼容 DSH 的 `ReasoningBlock`、`ReplayEnvelope` 与图片 Token 预算机制。

### ADR-02：复用 `ctx.credentials.modifyRecord` 存储多账号池，放弃自建 `accounts.vault.json`
* **决策**：所有插件自管账号凭证均通过 `ctx.credentials.modifyRecord(credentialKey('dsh-hitchfin', `${channelId}-${accountSlot}`), mutate)` 读写。
* **收益**：直接继承 DSH 官方凭证服务的跨进程排他锁（防止并发刷新旋转 Token 丢失）与安全权限管理，同时突破 `llm-pi-ai` 单渠道单账号的限制。

### ADR-03：通过 `Cooldown + dsh-llm-retry` 实现多号池 Failover，放弃流内隐式重试
* **决策**：当某账号在请求中返回 `429` 或配额耗尽时，Hitchfin 立即将该账号在内存状态表中置为 `Cooldown`，并向 DSH 返回 `{ kind: 'error', failure: { code: 'RATE_LIMIT', providerRetryAfterMs: 100 } }`；由 DSH 原生 `@deepseek-ai/dsh-llm-retry` 在 Step 边界干净重跑该步，重跑时选号器自动命中下一个健康账号。
* **收益**：彻底消除「已发出 `block-start` 后切号导致块索引错乱」与「双重重试叠加」两大隐患，且每次切号在 DSH 会话日志中均有据可查。

### ADR-04：提供「Magpie 桥接模式」与「独立多号池模式」双轨运行，消除 Refresh Token 竞态
* **决策**：
  1. **模式 A（Magpie 桥接模式 —— 当检测到本机 `127.0.0.1:3425` 运行时可选）**：不复制 `refresh_token`，而是自动将 Magpie 网关暴露的模型按真实上游渠道拆分为独立 Provider 注册到 `ctx.llm`，并同步 Magpie 的配额窗口数据到 DSH 输入框徽标。
  2. **模式 B（独立原生模式）**：通过 `ctx.authorization` 登录或单向安全接管（导入前校验 `.lock` 并提示关闭外部 Magpie），由 Hitchfin 独立管理多账号池与子进程插件宿主。

### ADR-05：将出站脱敏挂载于 `llm/stream` Waterfall，并实施「受控还原 + JSON 转义 + `block-end` 同步」
* **决策**：
  1. 脱敏拦截器挂载在 `ctx.on('llm/stream')` Waterfall 上，使其不仅保护 Hitchfin 自身路由，还能保护 DSH 内的官方 DeepSeek 及所有第三方路由；
  2. 脱敏 `salt` 持久化在 `ctx.credentials` 的 `dsh-hitchfin/masking-salt` 记录中，保证重启后旧会话占位符依然可解；
  3. 还原阶段同时处理 `*-delta` 与 `block-end.block`；写入 `tool-call` 参数时强制执行 JSON 字符串转义；
  4. **防外泄策略（Exfiltration Guard）**：默认禁止向可执行外部网络请求或任意 Shell 的工具（如 `bash`、`web_fetch`）参数中自动还原高危密钥，遇到占位符时触发告警或保持掩码，阻断 Prompt Injection 偷密钥路径。

### ADR-06：复用 `TypertRemoteService` 与原生模型设置页，精简 UI 表面积
* **决策**：
  1. 前后端通信直接继承 `TypertRemoteService`，不再自建无鉴权的裸 `/api/hitchfin/*` HTTP 路由；
  2. 不再通过 `GenerateOptions.purpose` 硬编码子代理路由，而是将路由组（如 `hitchfin/daily-coding`、`hitchfin/fast`）作为标准模型暴露，直接复用 DSH 原生的默认模型、Subagent 模型与标题模型设置；
  3. 客户端 UI 收敛为 **1 个 `conversation.input.model.label` 内联徽标 + 1 个 `conversation.input.right` 交互式额度胶囊 + 2 个 `settings.section` 页面**。
