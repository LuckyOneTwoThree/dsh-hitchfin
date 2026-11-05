# 02 · 核心能力 A：多账号订阅池与渠道桥接规范 (Channels & Subscription Pool Spec)

本文档定义 `dsh-hitchfin` 如何基于 DSH `0.2.1-rc.5` 的 `ctx.credentials` 与 `ctx.authorization` 原生能力，实现**多账号订阅池、无竞态的 Magpie 协同/迁移、受控子进程插件宿主以及合规边界**。

---

## 1. 基于 `ctx.credentials` 的多账号池存储设计 (`src/channels/pool.ts`)

### 1.1 为什么不自建 `accounts.vault.json`，也不直接使用 `llm-pi-ai` 的存储键？
1. 自建 JSON 文件缺乏跨进程排他锁，当多个 DSH 窗口或进程同时刷新一次性旋转的 OAuth `refresh_token` 时会导致令牌作废。
2. DSH 官方的 `@deepseek-ai/dsh-credentials` 提供了带跨进程互斥锁的 `ctx.credentials.modifyRecord(key, mutate)`，但原生 `@deepseek-ai/dsh-llm-pi-ai` 将存储键写死为 `credentialKey('llm-pi-ai', providerId)`（即每个 `providerId` 只能存 1 个账号）。

### 1.2 Hitchfin 的多账号槽位寻址规范
`dsh-hitchfin` 完整复用 `ctx.credentials`，并使用自有 Scope `'dsh-hitchfin'` 与符合 `[a-z0-9-]+` 语法（`isCredentialKeySegment`）的复合槽位 ID：

* **账号记录键格式**：
  $$\text{Key} = \texttt{credentialKey}(\texttt{'dsh-hitchfin'}, \texttt{`\$\{channelId\}-acct-\$\{slotId\}`})$$
  例如：
  * `dsh-hitchfin/openai-codex-acct-1`
  * `dsh-hitchfin/openai-codex-acct-2`
  * `dsh-hitchfin/workbuddy-acct-main`
* **并发安全刷新流程**：
  当某个账号的 `access_token` 距离过期不足 5 分钟时，调用 `ctx.credentials.modifyRecord(key, async (current) => { ... })`：
  * 在排他锁内部首先检查 `current` 中的 `expiresAt` 是否已被其他进程刷新；
  * 若已更新则直接返回最新凭证，避免重复发起网络刷新请求；
  * 若仍需刷新，则在锁内完成 OAuth token 刷新并写入新记录。

---

## 2. 三类渠道供给源与安全边界

### 2.1 供给源一：本机 Magpie 协同桥接与安全迁移 (`magpie-bridge.ts` & `magpie-migrator.ts`)

为彻底规避两个进程同时刷新同一个 `refresh_token` 的竞态问题，严格区分以下两种模式：

| 模式 | 适用场景 | 凭证所有权与锁机制 | DSH 侧表现 |
| :--- | :--- | :--- | :--- |
| **1. Magpie 桥接模式**<br>*(Bridge Mode，默认安全选项)* | 用户希望继续保留后台运行的 Magpie (`127.0.0.1:3425`) | **Magpie 独占 `refresh_token`**；Hitchfin 仅读取网关接口与配额快照，绝不自行刷新 OAuth | 自动将 Magpie 的模型按上游渠道拆分为独立 Provider 组注册进 `ctx.llm`（取代原先手改 `cordis.patch.yml` 的单一 `Magpie` 桶），并在输入框展示实时额度徽标 |
| **2. 单向接管迁移模式**<br>*(Takeover Mode)* | 用户希望彻底关掉外部 Magpie，仅跑 DSH | 1. 探测 `127.0.0.1:3425` 与 `~/.config/magpie/*.lock`；若 Magpie 仍在运行，要求用户先退出 Magpie<br>2. 自动备份 `~/.config/magpie` 与 `cordis.patch.yml`<br>3. 将账号导入 `ctx.credentials` (`dsh-hitchfin/*`) 并提供一键回滚按钮 | 由 Hitchfin 独立接管多账号刷新、路由组与配额查询 |

---

### 2.2 供给源二：基于 `@earendil-works/pi-ai` + `ctx.authorization` 的原生多账号登录 (`flows.ts`)

直接复用宿主内置 `@earendil-works/pi-ai` 的 Provider 登录能力，并扩展支持**多账号追加**：
* 在 `ctx.authorization` 中注册 `dsh-hitchfin` 的多账号登录流（支持 `openai-codex`、`github-copilot`、`anthropic`、`google` 等内置 OAuth / Device Code / API Key 流程）。
* 每次登录成功时，自动分配一个新的槽位 `dsh-hitchfin/<channelId>-acct-<n>` 存入 `ctx.credentials`，而不是覆盖已有账号。

---

### 2.3 供给源三：受控子进程 `MagpiePluginWorker` (`plugin-worker-host.ts`)

针对 `@magpie-community/opencode-{workbuddy,trae,zcode,qoder}-auth` 等第三方 ESM 插件，执行严格的**信任边界隔离与真实契约适配**：

1. **真实包入口与签名适配（已核验）**：
   * 加载入口严格遵循包的 `exports["."]` 或 `opencode.mjs`（如 `WorkBuddyAuthPlugin`、`TraeAuthPlugin`、`ZCodeAuthPlugin`），**绝不硬编码绕过适配层直接加载 `index.mjs`**。
   * 兼容不同插件的工厂函数签名：传入统一的上下文对象 `({ client, directory, magpie: hostMagpieApi }, options)`，并完整对接其返回的 `auth`、`config`、`chat.headers`、`chat.params`、`usage`、`magpie` 钩子。
2. **独立子进程沙箱隔离 (`child_process.fork`)**：
   * 第三方插件代码**不在 DSH Host 主进程内直接运行**，而是运行在受限的 Worker 子进程中：
     * 子进程无权访问 `ctx.credentials` 全量凭证库，仅由主进程在单次调用时传入当前选中账号的脱敏/受限认证上下文；
     * 主进程与子进程通过结构化 IPC 传递请求与流式响应分片，子进程崩溃或超时不会导致 DSH 主进程异常。
3. **供应链安全要求**：
   * 不在后台静默执行 `pnpm install @latest`；
   * 仅允许加载用户本机已安装且通过版本/完整性（SHA-256）核验的插件包，任何新增或升级操作必须在设置页展示明确的包名、版本号与权限确认弹窗。

---

## 3. 多账号池状态机与合规边界 (`ToS & Compliance`)

### 3.1 账号健康与配额状态机
每个账号槽位在内存中维护实时运行状态：
* `active`：健康可用，附带最近一次拉取的 `QuotaSnapshot`（`window5hRemainingPct`、`window5hResetAt`、`window7dRemainingPct`、`window7dResetAt`、`creditsRemaining`）。
* `cooldown`：因收到 `HTTP 429` 或瞬态 `5xx` 进入短期冷却，记录 `cooldownUntil`（优先取上游 `Retry-After`，否则按 `15s -> 30s -> 60s -> 300s` 指数退避）。
* `quota-exhausted`：5h 或 7d 窗口耗尽（或收到 `insufficient_quota`），暂停选号直至 `windowResetAt`。
* `reauth-required`：收到 `401/403` 且 Token 刷新失败，在 UI 标记需重新授权。

### 3.2 合规与服务条款（ToS）准则
1. **不做风控规避或客户端伪装卖点**：`dsh-hitchfin` 不内置、不宣传任何针对特定厂商风控错误码（如系统提示词改写、指纹伪造）的规避逻辑。
2. **仅限个人自有账号与官方授权通道**：明确提示用户仅可接入本人合法持有的 API Key 或个人订阅，严禁用于共享池售卖或企业账号违规分发。
3. **自动化操作默认关闭（Opt-in Only）**：每日积分签到与 5h 窗口定时预热（Beat）功能**默认全部关闭**，需用户在设置页阅读风险说明后手动开启。
