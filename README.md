# `dsh-hitchfin`

> **DeepSeek Harness (`dsh`) 原生订阅复用、多号池智能路由、策略化出站脱敏与实时配额插件**

`dsh-hitchfin` 汲取 [`yetone/magpie`](https://github.com/yetone/magpie) 的产品精髓（**订阅白嫖复用 + 多渠道智能路由 + 隐私脱敏**），深度适配 **DeepSeek Harness (`dsh >= 0.2.1-rc.1`)** 的 Cordis 微内核架构。

---

## 核心特性

1. **订阅与多渠道双轨接入 (`Bridge` & `Standalone`)**：
   - **Mode A · Magpie 本地网关动态分拆桥接**：自动探测本机 `http://127.0.0.1:3425`，将其聚合的模型按真实渠道（`hitchfin-codex`、`hitchfin-workbuddy`、`hitchfin-trae`、`hitchfin-zcode` 等）动态拆分为独立 Provider 注入 `ctx.llm`，零 Token 刷新锁冲突。
   - **Mode B · 进程内原生多号池直连**：基于 `ctx.credentials.modifyRecord` 跨进程排他锁管理多账号槽位（`credentialKey('dsh-hitchfin', '<channel>-acct-<slot>')`），并通过 `child_process.fork` 受控子进程 (`MagpiePluginWorkerHost`) 安全托管 `@magpie-community/*` 插件。
2. **智能路由组与 Step 边界无损切号 (`GroupRouter`)**：
   - 支持 `order`（主备优先级）、`rotate`（轮询均摊）、`smart`（剩余额度水位优先）、`pace`（按重置倒计时优先消耗临期额度）四种选号策略。
   - 复合键 `(sessionId, providerId, modelId, reasoningEffort)` Sticky Session 保持多轮 Prompt Cache 命中率。
   - 账号触发 `429` 时自动标记 `Cooldown` 并抛出携带 `providerRetryAfterMs: 100` 的 `RATE_LIMIT` `LlmError`，交由 `@deepseek-ai/dsh-llm-retry` 在 Agent Step 边界干净重跑并自动切换至下一健康账号。
3. **策略化出站脱敏与防外泄护栏 (`PolicyGuard`)**：
   - 挂载于 `llm/stream` Waterfall，在不改动冻结原始请求（`Object.freeze`）的前提下将敏感凭证替换为固定 19 字符占位符 `{{HF_SEC_xxxxxxxx}}`。
   - 流式还原引擎 (`StreamingUnmasker`) 同时处理 `*-delta` 与 `block-end.block`，并对 `ToolCallBlock.arguments` 进行 JSON 字符串安全转义。
   - **`PolicyGuard` 防外泄**：严禁向 `bash`、`run_command`、`curl`、`web_fetch` 等高危执行/网络工具自动还原机密真值，彻底阻断 Prompt Injection 诱导外泄。
4. **原生 DSH UI 插槽集成**：
   - `conversation.input.model.label`：内联非交互式窗口额度徽标（如 `[5h 85%]`）。
   - `conversation.input.right`：输入框底部交互式额度胶囊 (`HF · 85%`)。
   - `settings.section`：双设置页（`Hitchfin 路由与订阅`、`Hitchfin 隐私与配额`）。

---

## 构建与测试

> **注意**：请使用 DeepSeek Harness Desktop 自带的 Node `24.21.0` 与 pnpm `11.28.5` 运行构建与测试。

```bash
export PATH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin:$PATH"
alias dsh-pnpm='node "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs"'

dsh-pnpm run typecheck
dsh-pnpm run build
dsh-pnpm test
```

---

## 规格与架构文档 (`docs/`)

详见 [`docs/README.md`](./docs/README.md)：
- [`docs/00-verification.md`](./docs/00-verification.md) — 本机环境实测与架构决策记录 (ADR)
- [`docs/01-architecture.md`](./docs/01-architecture.md) — 系统总体架构与宿主生命周期集成
- [`docs/02-channels-and-subscriptions.md`](./docs/02-channels-and-subscriptions.md) — 订阅复用、多账号池与合规分级设计
- [`docs/03-routing-and-rosetta.md`](./docs/03-routing-and-rosetta.md) — 智能路由组、Sticky Session 与 `pi-ai` 协议复用
- [`docs/04-masking-and-ui.md`](./docs/04-masking-and-ui.md) — 策略化出站脱敏与原生 Slot UI 设计
- [`docs/05-roadmap-and-milestones.md`](./docs/05-roadmap-and-milestones.md) — 分阶段里程碑与测试矩阵
