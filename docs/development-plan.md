# dsh-hitchfin 开发支撑文档

> 版本：v0.1 草案  
> 日期：2026-11-06  
> 目标宿主：DeepSeek Harness Desktop / Web `0.2.2-rc.1`  
> 文档定位：产品范围、技术方案、页面流程、任务分解、验收标准与风险登记的统一支撑文档。

---

## 0. 结论摘要

**产品定位**

dsh-hitchfin 是一个运行在 DSH 内的**原生订阅接入插件**，先把有免费层的订阅工具接进 DSH 桌面版：

- **P0：WorkBuddy CN 免费层**
- **P1：Qoder CN 免费层**
- **P2：Trae CN 免费层（插件本身标记 Experimental，需真机 spike）**
- **P3：OpenCode Zen free（可选实验渠道，不进核心；需要 Bun sidecar）**

**技术路线**

- 不重写渠道协议，直接复用 magpie 正在使用的社区渠道包（登录、刷新、模型、额度、厂商协议都在包里）。
- 不在 DSH 外再跑一个 magpie 网关；用 DSH 原生 `ctx.llm` + `LlmAdapter` + `ctx.credentials` + `ctx.authorization` + `ctx.settings`。
- 用 pi-ai 1.3.0 的自定义 `fetch` 承担标准 OpenAI/Anthropic 请求的序列化与解析；渠道包负责厂商转换。
- 用 DSH `dsh-llm-retry` 在 agent step 边界做切号重试，不做流内切号。

**MVP 默认策略**

- 每渠道单账号。
- “仅免费模型”默认开启。
- 不做免费号池、免费号轮换、自动签到、自动预热。
- 不做脱敏、搜索、生图、Library、MCP、LAN、Docker、同步、路由组、意图路由。

**关键判断**

渠道层不是难点；难点是三层合同转换：

1. **宿主合同**：OpenCode 插件 API → DSH Cordis / `LlmAdapter`。
2. **流式合同**：OpenAI/Anthropic SSE → DSH `StreamChunk`。
3. **账号合同**：magpie `plugin-auth.json` → DSH `ctx.credentials`，含刷新锁与 per-account scope。

---

## 0.5 关于产品形态参考与截图

本机 magpie 正在运行（`127.0.0.1:3425`），但它是菜单栏应用，没有可直接访问的 Web UI。本文档的 UI 参考来自：

- magpie GUI 源码：`internal/gui/assets/index.html`、`app.js`、`i18n.js`
- 官方产品截图：`site/public/img/add-zh-light.png`、`providers-light.png`、`agents-zh-light.png`、`routing-zh-light.png`、`panel-light.png`
- magpie 实际 Provider / Add provider / Agents / Routing / 面板流程

**当前不需要用户截图。** 后续做像素级 UI 走查时，只需要 3 张不含账号、邮箱、密钥的截图：

1. Providers 页（渠道列表）
2. Add provider 订阅卡片区
3. 订阅额度卡片 / 账号详情

---

## 1. 背景与产品定位

### 1.1 DSH 已经有什么

DSH 0.2.2-rc.1 的打包代码已经提供：

- `ctx.llm`：`LlmAdapter` 注册、模型目录、流式调用、usage、错误与重试策略。
- `ctx.credentials`：带跨进程排他锁的凭证记录存储，`modifyRecord` 是唯一写路径。
- `ctx.authorization`：OAuth / Device Code / 粘贴密钥的登录流。
- `ctx.settings`：非敏感配置持久化。
- `dsh-llm-retry`：在 agent step 边界重试 `RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT`、`EMPTY_RESPONSE`。
- `@earendil-works/pi-ai@1.3.0`：内置协议层，`StreamOptions` 支持自定义 `fetch`、`headers`、`onPayload`、`onResponse`。
- 客户端 Slot：`settings.section`、`settings.plugins.tab`、`conversation.input.model.label`、`conversation.input.right`。

按 `dsh-llm-pi-ai` 的 `registerPiAiFlows`，至少以下订阅 OAuth 登录流是注册的：

- `openai-codex`（ChatGPT Plus/Pro）
- `github-copilot`
- `anthropic`（Claude Pro/Max）
- `kimi-coding`

`UNSERVED_OAUTH` 只排除了 `openai` 直连。**建议在 Settings → Models 实测确认。**

### 1.2 DSH 缺什么

- 每个 provider 只有一条凭证记录（`recordKeyFor(providerId)`），没有多账号池。
- 没有 Trae / WorkBuddy / Qoder / OpenCode Zen 这些渠道。
- 没有订阅额度窗口、免费模型窗口、免费模型筛选。
- 没有跨渠道的账号选择、冷却、sticky、failover。
- 没有面向“免费订阅”的产品化 UI。

### 1.3 目标用户与场景

**目标用户**

- 已经在使用 Trae CN、WorkBuddy、Qoder CN、OpenCode 等工具，但希望把它们的免费额度集中到 DSH 里使用。
- 不想再维护 magpie 或第二个本地网关。
- 愿意接受“免费层不稳定、可能随时失效”的现实。

**核心场景**

1. 安装插件 → 在 Settings → Hitchfin 添加 WorkBuddy 账号 → DSH 模型列表出现 WorkBuddy 免费模型 → 选中即可对话。
2. 打开“仅免费模型”，避免误用付费模型。
3. 在输入框旁看到当前免费额度/免费模型窗口。
4. 免费额度用完时，得到清晰提示，而不是静默失败或自动花积分。
5. 后续添加 Qoder CN、Trae CN，共用同一套页面与模型选择体验。

---

## 2. 研究结论：magpie 与 DSH 的复用边界

### 2.1 magpie 的分层

| 层 | 位置 | 作用 | 对本项目的意义 |
| :--- | :--- | :--- | :--- |
| 渠道包 | `@magpie-community/opencode-*-auth` | 登录、刷新、模型、额度、厂商协议、fetch | **100% 复用** |
| 插件宿主 | `magpie/internal/plugin/host.js` | OpenCode 插件 API、client shim、loader/fetch/usage 调度 | **借用 shim 思路，适配约 200–500 行** |
| Go 网关 | `magpie/internal/gateway`、`provider` | 协议转换、路由、账号池、额度、fallback | **不搬**；DSH 用 `LlmAdapter` + pi-ai + credentials + retry 替代 |
| DSH 配置写入 | `magpie/internal/agent/dsh.go` | 写 profiles/home patch/settings.yaml/.env/.credentials.yaml | **不需要**；原生插件不写 YAML |
| GUI | `magpie/internal/gui` | Providers / Agents / Routing / Usage / Settings | **只参考形态与流程**；DSH 用 client slots 重画 |

### 2.2 可复用资产清单

| 资产 | 版本 / 路径 | 复用方式 |
| :--- | :--- | :--- |
| WorkBuddy 渠道包 | `@magpie-community/opencode-workbuddy-auth@0.2.24` | 原样加载；auth/fetch/models/usage/checkin |
| Qoder 渠道包 | `@magpie-community/opencode-qoder-auth@0.2.61` | 原样加载；Qoder / Qoder CN / QwenWork；PAT |
| Trae 渠道包 | `@magpie-community/opencode-trae-auth@0.2.30` | 原样加载；Trae CN / Global；实验性 |
| OpenCode Zen free | `opencode-zen-freex@0.5.16` | 可选实验；需要 Bun；核心不引入 |
| magpie 插件宿主 | `magpie/internal/plugin/host.js` | 参考 `makeClient`、`servers`、`chat.headers`、`auth.loader`、`fetchAs` |
| 旧实现传输层 | `db4574a:src/adapter/pi-ai-transport.ts` | 参考 pi-ai 事件 → DSH StreamChunk 转换；按 0.2.2 复验 |
| 旧实现 SSE 传输 | `db4574a:src/adapter/openai-sse-transport.ts` | 参考 OpenAI SSE 解析；仅作 fallback |
| 旧实现账号池 | `db4574a:src/channels/pool.ts` | 参考 credential key 与账号记录模型 |
| 旧实现路由 | `db4574a:src/router/group-router.ts` | 参考 sticky / cooldown 思路；v0.1 不实现 |
| 旧实现 UI | `db4574a:src/client/index.tsx` | 参考 slot 注册与页面组织；需大幅裁剪 |

### 2.3 不可直接搬的部分

- **Go 网关**：语言不同、进程不同，DSH 插件无法 import。运行它等于继续跑 magpie，不是插件。
- **`dsh.go` 配置写入**：magpie 因为站在 DSH 外面才需要改 YAML；原生插件用 `ctx.llm.registerAdapter`，不需要写配置。
- **magpie GUI**：DOM/组件体系不同；只参考信息架构与交互，不复用代码。
- **`plugin-auth.json`**：magpie 的凭证格式；DSH 用 `ctx.credentials`，不能直接读写。

---

## 3. 范围与优先级

### 3.1 渠道矩阵

| 渠道 | 免费形态 | 渠道包成熟度 | 认证方式 | 协议 | 优先级 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **WorkBuddy CN** | 免费计划 + 免费模型日窗口；有 `Free models only` | 高（0.2.24，真实测量多） | 浏览器 / 桌面导入 / API key | OpenAI Chat + Anthropic Messages | **P0** |
| **Qoder CN** | 积分用完后可用免费基础模型；签到送积分 | 高（0.2.61，Qoder CN 已实测） | 浏览器 / PAT | 厂商自有 SSE → 标准响应 | **P1** |
| **Trae CN** | 免费层可用 | 中低（README 标 Experimental，CN 未实测） | 浏览器回调 | 厂商自有 SSE → OpenAI | **P2** |
| **OpenCode Zen free** | 共享 `public` 凭证；仅 OpenCode 客户端；按出口 IP 限额 | 特殊（Bun；伪装 OpenCode prompt/tools） | `public` key | Chat / Responses / Anthropic | **P3，可选实验** |

### 3.2 版本范围

**v0.1（MVP）**

- WorkBuddy CN，单渠道、单账号。
- 浏览器登录（或 API key，二选一先做）。
- 免费模型列表 + “仅免费模型”开关。
- 模型显示/隐藏。
- 免费窗口/额度徽标。
- Settings → Hitchfin 一个页面。
- 中英文。

**v0.2**

- Qoder CN，PAT 优先。
- 免费模型过滤、额度展示。
- 账号重新登录、账号删除。
- 错误态与空状态完善。

**v0.3**

- Trae CN，真机 spike 后决定是否进主线。
- 兼容性说明与实验标签。

**v0.4（可选）**

- OpenCode Zen free 独立实验包 / Bun sidecar。
- 多账号池、免费优先路由、失败切换。
- 从 magpie 导入账号（一次性、只读快照）。
- 更多渠道。

### 3.3 明确不做

- 脱敏 / 隐私 masking
- 联网搜索
- 生图 / 视频
- Library / MCP / Skills
- Sessions / Usage 账本
- LAN 共享 / Docker / WebDAV 同步
- 多 agent 配置发现与迁移
- 每日自动签到 / 自动预热（可保留手动按钮，默认关闭）
- 免费号池 / 多账号轮换 / 账号共享 / 转售
- 意图路由 / 嵌套路由组
- 自建凭证 vault（使用 `ctx.credentials`）

---

## 4. 产品形态与页面流程

### 4.1 从 magpie 借鉴什么

参考截图与源码后，推荐借鉴以下形态：

| magpie 页面 | 借鉴点 | DSH 中的落点 |
| :--- | :--- | :--- |
| **Add provider** 订阅卡片 | 卡片式渠道选择；名称 + 套餐范围；搜索；分组 | Hitchfin 设置页的“添加账号”弹层 |
| **Providers** 列表 | 行式渠道/账号；状态点；账号数；模型数；chevron 详情 | Hitchfin 设置页的渠道/账号列表 |
| **Agents** 模型选择 | 渠道图标 + 模型名 + 下拉；状态文案 | DSH 原生模型选择器自动展示；不重复做 Agents 页 |
| **菜单栏面板** | 快速切模型；额度胶囊 | DSH 输入框的模型选择 + 额度徽标/胶囊 |
| **Routing** 页 | 路由组卡片、实时决策 | v0.1 不做；后续可做“免费池”虚拟模型 |
| **Usage / Allowances** | 额度窗口、账号卡片 | 内联额度徽标 + 设置页额度卡片 |
| **Settings** 多 tab | 分组清晰，但 tab 偏多 | Hitchfin 只做一个 section，内部 2–3 个分组 |
| **Hide accounts** | 截图时隐藏账号/邮箱 | Hitchfin 设置页提供“隐藏账号”开关 |

### 4.2 DSH 页面结构

**Settings → Hitchfin**（单页，三个分组）

```
Settings > Hitchfin

订阅接入
┌──────────────────────────────────────────────────────────────┐
│ [W] WorkBuddy CN          免费模型 3 个    账号 1    正常     │
│     免费计划 · 今日免费窗口 62%                    [管理]     │
├──────────────────────────────────────────────────────────────┤
│ [Q] Qoder CN              免费模型 5 个    账号 0    —        │
│     未登录                                          [添加账号] │
├──────────────────────────────────────────────────────────────┤
│ [T] Trae CN               实验             账号 0    —        │
│     未登录 · 插件标记 Experimental                  [添加账号] │
└──────────────────────────────────────────────────────────────┘
[+ 添加订阅账号]

免费额度
┌──────────────────────────────────────────────────────────────┐
│ WorkBuddy CN · 今日免费窗口                                   │
│ 已用 38% · 剩余 62% · 明日 00:00 重置          [刷新]        │
└──────────────────────────────────────────────────────────────┘

模型
┌──────────────────────────────────────────────────────────────┐
│ WorkBuddy CN   [仅免费模型 ✓]   [搜索模型…]                  │
│ ☑ DeepSeek-V4.1-Flash      免费    上下文 1M                 │
│ ☑ GLM-5.3                  免费    上下文 1M                 │
│ ☐ Hy4 preview              付费    上下文 1M                 │
└──────────────────────────────────────────────────────────────┘

[隐藏账号]  [检查更新]  [卸载说明]
```

**为何不做多页**

- 用户明确反感重复 CTA、入口过深、层级过多。
- 订阅接入的核心动作只有三个：添加账号、看额度、选模型。
- 一个 section 足够；路由、用量、脱敏等后续能力再按需增加。

### 4.3 添加账号流程

```
点击 [添加账号]
  → 选择渠道（WorkBuddy CN / Qoder CN / Trae CN）
  → 选择登录方式
       ├─ 浏览器登录：打开授权页 → 轮询 → 成功
       ├─ PAT / API Key：粘贴 → 校验模型列表 → 成功
       └─ 从桌面应用导入（可选，后续）
  → 写入 ctx.credentials
  → 读取模型列表 + 免费窗口
  → 默认开启“仅免费模型”
  → 回到设置页，账号行显示正常/额度
```

**交互要求**

- 登录过程中显示状态：等待浏览器、已授权、读取账号、读取模型。
- 失败时保留上下文，允许重试/取消；不打印 token。
- 成功后不自动跳到聊天页；用户自己选模型。
- 账号名默认用邮箱/uid，但设置页提供“隐藏账号”显示模式。

### 4.4 模型选择与聊天流程

```
用户在 DSH 模型选择器选择 WorkBuddy CN / DeepSeek-V4.1-Flash (免费)
  → 输入框模型标签显示 “免费 · 今日窗口 62%”
  → 发送
  → HitchfinAdapter 选择账号（v0.1 单账号）
  → worker: auth.loader(getAuth) → { baseURL, headers, fetch }
  → pi-ai stream(custom fetch) → 厂商
  → 转 DSH StreamChunk → DSH 渲染
```

**要求**

- 模型列表按渠道分组，显示渠道图标/名称。
- 免费模型带 `badge`（DSH `LlmModelInfo.badge`），文案“免费”。
- 付费模型在“仅免费模型”开启时不出现；关闭后出现并带明显价格/付费标识。
- 当前模型的内联额度徽标只读、不可点击；可交互详情放在输入框工具栏或设置页。

### 4.5 失败与空状态

| 场景 | 页面/输入框文案 | 行为 |
| :--- | :--- | :--- |
| 未登录 | “先添加账号才能使用此渠道” + 按钮 | 打开添加账号 |
| 登录过期 | “登录已过期，请重新登录” | 打开该账号的重新登录 |
| 免费模型下架 | “此模型已不免费，刷新列表” | 刷新模型目录 |
| 免费额度用完 | “免费额度已用完，X 后重置” | 不自动切付费；不自动重试 |
| 触发限流 | “请求过快，X 后重试” | 显示 retry-after |
| 上下文超限 | “上下文超出模型窗口，请压缩” | 不重试 |
| 网络错误 | “网络异常，请重试” | 允许 DSH retry |
| 渠道进程崩溃 | “渠道进程异常，已重启” | 自动重启 worker，单次重试 |
| 渠道包不兼容 | “渠道包版本不兼容，请更新” | 禁用该渠道，提示更新 |

---

## 5. 架构设计

### 5.1 组件图

```
DSH Host (Node 24 / Cordis)
└─ dsh-hitchfin
   ├─ HitchfinAdapter (extends LlmAdapter)
   │   ├─ listModels / resolveModel / prepareCall / stream
   │   └─ providerRetryPolicy
   ├─ AccountStore (ctx.credentials, scope: dsh-hitchfin)
   ├─ AuthFlows (ctx.authorization)
   ├─ ChannelWorkerHost
   │   └─ child process(es)
   │       ├─ OpenCode client shim
   │       ├─ WorkBuddy package
   │       ├─ Qoder package
   │       └─ Trae package
   ├─ QuotaService
   └─ Settings (ctx.settings)

DSH Client (React)
├─ settings.section: Hitchfin 设置页
├─ conversation.input.model.label: 额度徽标
└─ conversation.input.right: 可选额度胶囊
```

### 5.2 请求路径

```
Agent Loop
  → ctx.llm.stream(options)
  → HitchfinAdapter.stream(options)
  → AccountSelector.select(options.sessionId, provider, model)
  → WorkerHost.fetch({ channelId, accountId, sessionId, protocol, request })
  → 渠道包 auth.loader(getAuth) → { baseURL, headers, fetch }
  → pi-ai stream(model, context, { fetch, headers, signal })
  → 渠道包 fetch → 厂商
  → 厂商 SSE/JSON → 渠道包标准化 → pi-ai 事件
  → HitchfinAdapter 转 DSH StreamChunk
  → DSH Agent Loop / 渲染
```

### 5.3 模块结构

```text
dsh-hitchfin/
├─ package.json                 # dsh.bundle.patch, dsh.client, engines
├─ cordis.patch.yml             # insert dsh-hitchfin
├─ src/
│  ├─ index.ts                  # Cordis 入口，装配服务
│  ├─ config.ts                 # Schemastery 配置
│  ├─ types.ts                  # 共享类型
│  ├─ adapter/
│  │  ├─ hitchfin-adapter.ts    # LlmAdapter 实现
│  │  ├─ stream.ts              # pi-ai 事件 → StreamChunk
│  │  └─ errors.ts              # 厂商错误 → LlmFailure
│  ├─ channels/
│  │  ├─ descriptor.ts          # ChannelDescriptor 接口
│  │  ├─ workbuddy.ts           # WorkBuddy 描述符
│  │  ├─ qoder.ts               # Qoder 描述符
│  │  ├─ trae.ts                # Trae 描述符
│  │  └─ index.ts               # 注册表
│  ├─ accounts/
│  │  ├─ store.ts               # ctx.credentials 读写
│  │  ├─ select.ts              # 单账号 / sticky / cooldown
│  │  └─ quota.ts               # 额度快照与刷新
│  ├─ host/
│  │  ├─ worker-host.ts         # 子进程生命周期 / IPC
│  │  ├─ protocol.ts            # host ↔ worker 消息
│  │  └─ package.ts             # 渠道包加载、版本、校验
│  └─ settings/
│     └─ schema.ts              # 插件配置
├─ worker/
│  ├─ index.ts                  # 子进程入口
│  ├─ shim.ts                   # OpenCode client shim
│  └─ scope.ts                  # AsyncLocalStorage 账号作用域
├─ client/
│  ├─ index.tsx                 # slot 注册
│  ├─ SettingsPage.tsx          # 订阅接入页
│  ├─ AddAccountSheet.tsx       # 添加账号
│  ├─ QuotaBadge.tsx            # 内联徽标
│  ├─ QuotaCapsule.tsx          # 可选工具栏胶囊
│  └─ styles.css
├─ locale/
│  ├─ zh.json
│  └─ en.json
├─ tests/
│  ├─ unit/
│  ├─ contract/
│  ├─ integration/
│  └─ fixtures/fake-channel/
└─ docs/
   └─ development-plan.md
```

### 5.4 Worker 设计

**为什么用子进程**

- 渠道包是第三方可执行代码，拥有用户权限；子进程隔离崩溃。
- 主进程不把全量凭证交给 worker，只传当前账号的认证快照。
- 单个渠道包卡死/崩溃不拖垮 DSH 主进程。

**IPC 消息**

| 方向 | 消息 | 说明 |
| :--- | :--- | :--- |
| host → worker | `loadChannel` | 加载渠道包、校验版本、传入选项 |
| host → worker | `listModels` | 读取某账号的模型列表 |
| host → worker | `usage` | 读取额度窗口 |
| host → worker | `beginAuth` / `pollAuth` | 浏览器/PAT 登录 |
| host → worker | `fetch` | 发起一次模型请求（流式） |
| host → worker | `cancel` | 取消请求 |
| worker → host | `chunk` | 流式响应片段 |
| worker → host | `authChanged` | 渠道包刷新了 token，写回 `ctx.credentials` |
| worker → host | `log` / `toast` | 日志与用户提示 |
| worker → host | `error` | 结构化错误 |

**账号作用域**

- worker 内使用 `AsyncLocalStorage` 保存当前请求的 `accountId`。
- `getAuth()` 只返回当前账号的认证快照。
- `client.auth.set()` 写回当前账号，不跨账号。
- 主进程用 `ctx.credentials.modifyRecord` 串行化刷新，防止 refresh token 竞态。

### 5.5 复用 magpie host.js 的哪几段

| host.js 能力 | 用途 | 适配 |
| :--- | :--- | :--- |
| `makeClient()` | 提供 `client.auth.set/get`、`client.app.log`、`client.tui.showToast` | 换成 DSH 日志/提示；auth 写 `ctx.credentials` |
| `servers()` | 从渠道包导出中找插件工厂 | 原样参考 |
| `chat.headers` 调用 | 传入 `sessionID` / provider / model，拿会话头 | 原样参考 |
| `auth.loader(getAuth)` | 拿 `{ baseURL, apiKey, headers, fetch }` | 原样参考 |
| `fetchAs()` | 把标准请求交给渠道包 fetch | 改造为 IPC 流式 |
| `auth.usage` / `auth.refresh` / `auth.checkin` | 额度、刷新、签到 | 额度/刷新接；签到手动 |
| `inScope()` | per-account 作用域 | 用 AsyncLocalStorage 复刻 |

---

## 6. 数据模型

### 6.1 ChannelDescriptor

```ts
interface ChannelDescriptor {
  id: string;                    // workbuddy-cn / qoder-cn / trae-cn
  providerId: string;            // DSH provider route: hitchfin-workbuddy-cn
  displayName: string;
  icon: string;
  status: 'stable' | 'experimental';
  protocols: Array<'openai-completions' | 'openai-responses' | 'anthropic-messages'>;
  authMethods: AuthMethod[];     // browser / pat / api-key
  freeOnlyDefault: boolean;
  supportsFreeWindow: boolean;
  packageName: string;           // @magpie-community/...
  packageVersion: string;
}
```

### 6.2 AccountRecord（存 `ctx.credentials`）

```ts
interface AccountRecord {
  channelId: string;
  slotId: string;                // acct-1 / acct-2
  label: string;                 // 用户可改；默认 email/uid
  authType: 'oauth' | 'pat' | 'api-key';
  auth: unknown;                 // 渠道包自己的认证对象，原样保存
  plan?: string;
  status: 'active' | 'expired' | 'reauth' | 'cooldown' | 'disabled';
  freeOnly: boolean;
  hiddenModels: string[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  cooldownUntil?: number;
}
```

**Credential key**

```ts
credentialKey('dsh-hitchfin', `${channelId}-${slotId}`)
// 例：dsh-hitchfin/workbuddy-cn-acct-1
```

### 6.3 ModelEntry

```ts
interface ModelEntry {
  channelId: string;
  id: string;                    // 渠道模型 id
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  input: Array<'text' | 'image'>;
  efforts: Array<{ id: string; name: string }>;
  free: boolean;
  freeReason?: 'free-model' | 'free-window' | 'free-plan';
  hidden: boolean;
  accountIds: string[];          // 哪些账号可用
}
```

### 6.4 QuotaSnapshot

```ts
interface QuotaSnapshot {
  channelId: string;
  accountId: string;
  plan?: string;
  windows: Array<{
    name: string;                // 5h / 7d / free-window / daily
    used?: number;               // 0-100；未知不填
    remaining?: number;          // 0-100
    resetsAt?: number;
    display?: string;
    free?: boolean;
  }>;
  fetchedAt: number;
  source: 'channel-usage' | 'request-error' | 'manual';
}
```

### 6.5 Settings

```ts
interface HitchfinSettings {
  channels: Record<string, {
    enabled: boolean;
    freeOnly: boolean;
    visibleModels?: string[];    // 空 = 全部
    hiddenModels?: string[];
  }>;
  quotaRefreshMinutes: number;   // 默认 5，最小 1
  showQuotaBadge: boolean;       // 默认 true
  hideAccounts: boolean;         // 截图隐私
  experimental: {
    opencodeZenFree?: boolean;   // 默认 false
  };
}
```

---

## 7. 关键流程

### 7.1 首次安装

1. 插件被安装到 DSH desktop profile，`cordis.patch.yml` insert `dsh-hitchfin`。
2. DSH 启动时插件注册 adapter、auth flows、settings section。
3. Settings 出现 “Hitchfin” section。
4. 用户打开，看到三个渠道卡片（WorkBuddy / Qoder / Trae）。
5. 没有任何账号时，空状态文案：“先添加一个免费订阅账号”。

### 7.2 添加账号

1. 点击渠道卡片 `添加账号`。
2. 弹层列出登录方式：
   - WorkBuddy：浏览器登录 / API key / 桌面导入（可选）
   - Qoder：PAT / 浏览器登录
   - Trae：浏览器登录
3. 浏览器登录：
   - 调渠道包 `auth.methods[].authorize`。
   - 显示 `session.notify({ url, code })`。
   - 轮询 `poll`，成功后 `client.auth.set`。
4. PAT/API key：
   - `session.prompt({ kind: 'secret' })`。
   - 渠道包 `auth.loader` 校验；读取模型列表。
5. 成功：
   - 写 `ctx.credentials`。
   - 读模型列表与额度。
   - 默认 `freeOnly = true`。
   - 刷新 adapter 模型目录，发 `llm/models-updated`。
6. 失败：
   - 显示可读错误；保留登录方式；允许重试。
   - 不记录 secret。

### 7.3 模型可见性

- 每个渠道可展开模型列表。
- 默认隐藏别名、重复模型、不可用模型。
- 用户可勾选/取消；保存到 settings。
- 搜索框过滤。
- “仅免费模型”开关优先级最高：开启时付费模型不显示。

### 7.4 聊天请求

1. DSH 选择模型（provider = `hitchfin-workbuddy-cn`）。
2. Adapter 读取模型元数据。
3. 选择账号（v0.1 单账号；v0.4 多账号）。
4. 取账号认证快照，调用 worker `fetch`。
5. worker：
   - `hooks["chat.headers"]` 注入 session。
   - `auth.loader(getAuth)` 取 baseURL/headers/fetch。
   - 用 pi-ai 序列化请求。
   - 调渠道包 fetch。
   - 把响应转成标准事件流回传。
6. Adapter 转 DSH StreamChunk：
   - `block-start` / `text-delta` / `reasoning-delta` / `tool-call-delta` / `block-end` / `usage` / `finish`。
7. 成功后更新 quota（可选，避免额外请求）。
8. 失败：
   - 401/403 → `AUTH`，标记 reauth。
   - 429 → `RATE_LIMIT`，带 `providerRetryAfterMs`；有备用账号则重试，没有则 `QUOTA`。
   - 402/免费额度耗尽 → `QUOTA`，不重试。
   - 404 模型下架 → `MODEL_NOT_FOUND`，刷新模型。
   - 400 上下文 → `CONTEXT_WINDOW_EXCEEDED`。
   - 5xx → `SERVER`；网络 → `TRANSPORT`；空响应 → `EMPTY_RESPONSE`。
   - 用户取消 → `aborted` + failure。
9. 不做流内切号。切号交给 `dsh-llm-retry` 在 step 边界重跑。

### 7.5 额度刷新

- 设置页打开时刷新。
- 添加账号后刷新。
- 请求返回 429/402 后刷新。
- 用户手动点“刷新”。
- 同一账号最小刷新间隔 60 秒；页面不可见时不轮询。
- 不做后台自动签到/预热；如需签到，设置页提供手动按钮，默认关闭。

### 7.6 删除账号 / 卸载

- 删除账号：确认弹层 → `ctx.credentials.deleteRecord` → 刷新模型列表 → 清理 quota 缓存。
- 卸载插件：DSH 移除插件 → 凭证记录可能成为孤儿；提供“清理 Hitchfin 凭证”说明或脚本。
- 不删除用户其他插件的凭证。

### 7.7 从 magpie 迁移（可选，后续）

- 默认不自动读取 magpie 的 `plugin-auth.json` / `logins.json`。
- 若提供导入：
  - 要求 magpie 已退出，检查 `*.lock`。
  - 备份 magpie 配置。
  - 只导入账号快照；提示 refresh token 可能已轮换。
  - 不长期双跑。
- 更推荐“在 Hitchfin 里重新登录”。

---

## 8. DSH 契约与适配细节

### 8.1 LlmAdapter 方法

| 方法 | 实现 |
| :--- | :--- |
| `providerInfo(provider)` | 返回渠道显示名 |
| `listModels(provider)` | 合并账号模型；过滤免费/隐藏；返回 `LlmModelInfo[]` |
| `resolveModel(provider, model, signal)` | 返回 context / defaultMaxTokens / reasoning / inputModalities |
| `stream(options)` | 选账号 → worker fetch → pi-ai → StreamChunk |
| `prepareCall(provider, model, signal)` | 默认实现；不绑定账号，避免 retry 时锁死 |
| `providerRetryPolicy(provider)` | normal 模式；禁止 always 模式（免费层会被打爆） |

### 8.2 StreamChunk 映射

| 渠道/pi-ai 事件 | DSH StreamChunk |
| :--- | :--- |
| 文本开始 | `{ type: 'block-start', index, blockType: 'text' }` |
| 文本增量 | `{ type: 'text-delta', index, text }` |
| 推理开始 | `{ type: 'block-start', index, blockType: 'reasoning' }` |
| 推理增量 | `{ type: 'reasoning-delta', index, text }` |
| 工具调用开始 | `{ type: 'block-start', index, blockType: 'tool-call' }` |
| 工具参数增量 | `{ type: 'tool-call-delta', index, id, name?, argumentsDelta }` |
| 块结束 | `{ type: 'block-end', index, block }`（必须完整 block） |
| usage | `{ type: 'usage', usage: { inputTokens, outputTokens, ... } }` |
| 结束 | `{ type: 'finish', reason, replayState? }` |

**注意**

- `inputTokens` 是不含缓存的输入；缓存放 `cacheReadTokens` / `cacheWriteTokens`。
- 推理块类型必须是 `reasoning`，不是 `thinking`。
- 工具参数必须是原始 JSON 字符串片段。
- `finish.error` / `aborted` 必须带 `failure`。
- 同 provider/model 保留 replayState；跨 provider 切号时剥离异构签名。
- 不要修改 deep-frozen 的 `GenerateOptions`。

### 8.3 模型元数据

- `contextWindow`：来自渠道模型列表；未知则不填。
- `defaultMaxTokens`：保守值；不要虚高，否则 DSH 压缩策略异常。
- `inputModalities`：文本/图片；按渠道能力。
- `reasoning.efforts`：渠道提供的档位；没有则不提供。
- `badge`：免费模型用 `{ text: { en: 'Free', zh: '免费' }, tone: 'success' }`。

### 8.4 授权流

- `ctx.authorization.registerFlow({ key, label, methods, run })`。
- 每个渠道/账号槽位一个 key。
- `run(session)`：
  - `session.notify({ message, url, code })`
  - `session.prompt({ kind: 'secret' | 'text' | 'select' })`
  - 成功后必须通过 `ctx.credentials.modifyRecord` 提交记录。
- 浏览器登录：打开 URL，轮询；把渠道包的 authorize 结果桥接到 session。
- PAT/API key：prompt secret；校验后提交。
- 取消：`session.signal`；清理临时状态。

### 8.5 凭证

- 只使用 `ctx.credentials.modifyRecord` 写；不要自己写 JSON。
- 每个账号一个 record；scope `dsh-hitchfin`。
- token 刷新在 host 进程的锁内完成；worker 只通过 IPC 请求刷新。
- 不把全量凭证传给 worker；每次请求只传当前账号快照。
- 日志中不打印 token、邮箱、账号名（可打印哈希/槽位）。

### 8.6 客户端 Slot

| Slot | 用途 | 约束 |
| :--- | :--- | :--- |
| `settings.section` | Hitchfin 设置页 | 单页；不要拆多个 section |
| `settings.section.icon` | 可选图标 | 与 section id 一致 |
| `conversation.input.model.label` | 当前模型免费额度徽标 | 非交互，只读 |
| `conversation.input.right` | 额度胶囊/账号切换（后续） | 可交互 |

---

## 9. 安全与合规

### 9.1 合规边界

- **个人自有账号、个人使用**；不做账号共享、转售、代挂。
- 免费层 + 第三方客户端本身可能违反厂商条款；插件需明确提示风险。
- 不实现额外规避：不改系统提示词以绕过检测、不伪造设备指纹、不破解验证码、不做自动批量注册。
- 渠道包已有的客户端身份模拟属于上游实现；核心插件保持渠道无关，渠道包作为可选安装项。
- Trae 插件标记 Experimental；OpenCode Zen free 需要伪装 OpenCode，默认不进核心。
- 不承诺“永久免费”“无限额度”。

### 9.2 凭证与隐私

- 凭证只存 `ctx.credentials`；不落自定义文件。
- 设置页默认隐藏账号邮箱/名称；提供“隐藏账号”开关。
- 日志脱敏：token、email、Authorization、cookie 不落日志。
- 错误信息不回显 secret。
- worker 只拿当前账号快照；不拿全量凭证。
- 不发送遥测；不上传提示词/回复。

### 9.3 供应链

- 渠道包固定版本；不后台静默 `npm install @latest`。
- 安装/更新前展示包名、版本、权限说明。
- 可选 SHA-256 校验。
- 渠道包在子进程运行；崩溃可重启。
- 渠道包升级需用户确认；升级后跑契约测试。

---

## 10. 测试策略

### 10.1 单元测试

- 模型元数据映射（context/maxTokens/efforts/input）。
- 免费模型过滤。
- 错误码映射。
- quota 窗口解析。
- credential key 生成。
- SSE 解析与工具参数拼接。

### 10.2 契约测试

- Fake channel fixture：模拟 `auth.loader`、`fetch`、`models`、`usage`。
- Adapter 流式输出快照：文本、推理、工具调用、usage、finish。
- 取消：`AbortSignal` 后不再发 chunk。
- 401/429/402/404/400/5xx 错误映射。
- Deep-frozen `GenerateOptions` 不被修改。
- `dsh-llm-retry` 配合：429 后第二次 stream 选到下一个账号（v0.4）。

### 10.3 集成测试

- 真实 WorkBuddy 账号：登录、模型列表、免费模型、聊天、工具调用、额度。
- 真实 Qoder CN 账号：PAT、模型、免费模型、额度。
- 真实 Trae CN 账号：浏览器登录、模型、聊天；记录问题。
- 账号过期：手动吊销/改 token，验证 reauth。
- 免费额度耗尽：验证清晰报错，不自动花积分。
- worker 崩溃：kill 子进程，验证重启与单次重试。

### 10.4 UI 测试

- Settings 页空状态、加载、错误、账号存在。
- 添加账号弹层：三种登录方式。
- 模型可见性：搜索、勾选、保存。
- 额度徽标：未知/加载/正常/耗尽。
- 窄屏 420 / 800 / 1100（如 DSH 客户端支持）。
- 中英文文案。

### 10.5 手工验收矩阵

| 渠道 | 登录 | 模型列表 | 免费过滤 | 聊天 | 工具 | 推理 | 额度 | 过期重登 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| WorkBuddy CN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Qoder CN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Trae CN | ✅ | ✅ | 视情况 | ✅ | ✅ | ✅ | 视情况 | ✅ |
| OpenCode Zen | 可选 | 可选 | 可选 | 可选 | 可选 | 可选 | — | — |

---

## 11. 开发任务分解（WBS）

> 估算按 1 名熟悉 TypeScript / Node / React 的全职开发计算，单位为“人日”。真实账号联调会浮动。

### Phase 0 — 契约验证（2–3 人日）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P0-01 | 在 DSH 0.2.2 实测 Codex / Copilot / Claude / Kimi 原生 OAuth | 验证记录；确定哪些不需要本项目做 | 0.5 | — |
| P0-02 | 验证自定义 `LlmAdapter` 注册与动态模型列表 | 最小 adapter demo；事件记录 | 1 | — |
| P0-03 | 验证 pi-ai 1.3.0 自定义 `fetch` | fake HTTP server 流式回复 | 0.5 | — |
| P0-04 | 验证 Node worker 加载 WorkBuddy 包并调用 `auth.loader` / `fetch` | spike 脚本 | 0.5 | — |
| P0-05 | 验证 `ctx.credentials.modifyRecord` 锁与授权流 | 测试记录 | 0.5 | — |
| P0-06 | 验证三个客户端 Slot 在 0.2.2 渲染 | 最小页面 | 0.5 | — |
| P0-07 | 写 spike 报告与 go/no-go | 报告 | 0.5 | P0-01..06 |

**Go/No-Go**

- 若 pi-ai 自定义 fetch 不可用：改用最小 OpenAI/Anthropic SSE 适配器（参考旧实现），或对单渠道使用本地回环代理。
- 若 worker 加载渠道包失败：检查 Node 兼容性、依赖、ESM 入口。

### Phase 1 — 插件骨架（4–6 人日）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P1-01 | 初始化插件包（package.json / dsh / cordis.patch.yml / build） | 可安装骨架 | 1 | P0 |
| P1-02 | Host 入口、配置 schema、日志、版本检查 | `src/index.ts` | 0.5 | P1-01 |
| P1-03 | 定义 `ChannelDescriptor` 与注册表 | `src/channels/descriptor.ts` | 0.5 | P1-01 |
| P1-04 | `HitchfinAdapter` 骨架（注册、listModels、resolveModel、stream stub） | adapter 可注册 | 1 | P1-03 |
| P1-05 | Fake channel fixture（文本/推理/工具/usage） | 可流式测试 | 1 | P1-04 |
| P1-06 | StreamChunk 映射与错误映射骨架 | `src/adapter/stream.ts` | 1 | P1-05 |
| P1-07 | Settings section 壳 | 页面可见 | 0.5 | P1-01 |
| P1-08 | 测试与 CI 骨架 | unit + contract | 0.5 | P1-05 |

### Phase 2 — WorkBuddy 单渠道（6–9 人日）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P2-01 | Worker 子进程 + IPC + 生命周期 | `worker-host.ts` | 1 | P1-04 |
| P2-02 | OpenCode client shim（auth.get/set、log、getAuth、scope） | `worker/shim.ts` | 1 | P2-01 |
| P2-03 | 渠道包加载、版本/入口/完整性检查 | `host/package.ts` | 1 | P2-01 |
| P2-04 | WorkBuddy 描述符（登录方式、模型、usage、fetch） | `channels/workbuddy.ts` | 1 | P2-03 |
| P2-05 | 账号存储与 credential key | `accounts/store.ts` | 1 | P2-02 |
| P2-06 | 授权流（浏览器 / API key） | `auth` flows | 1.5 | P2-05 |
| P2-07 | 单账号选择 + sticky（按 session） | `accounts/select.ts` | 0.5 | P2-05 |
| P2-08 | 流式请求路径（pi-ai + custom fetch） | 可聊天 | 1.5 | P2-04, P2-06 |
| P2-09 | usage 映射 + 免费过滤（基础） | `accounts/quota.ts` | 1 | P2-08 |
| P2-10 | 真实 WorkBuddy 账号联调 | 联调记录 | 1.5 | P2-08 |
| P2-11 | 修复厂商差异、记录已知问题 | 问题清单 | 1 | P2-10 |

### Phase 3 — 免费层与 UI（5–8 人日）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P3-01 | 每渠道 free-only 策略与模型 free 元数据 | 配置/过滤 | 1 | P2-09 |
| P3-02 | 模型可见性（隐藏/显示、搜索、恢复默认） | settings + UI | 1 | P3-01 |
| P3-03 | Quota service（缓存、刷新策略、免费窗口） | `accounts/quota.ts` | 1 | P2-09 |
| P3-04 | 设置页：渠道卡片、账号行、状态、free-only | `SettingsPage.tsx` | 1.5 | P3-01 |
| P3-05 | 添加账号弹层：渠道选择、登录方式、进度、错误 | `AddAccountSheet.tsx` | 1.5 | P2-06 |
| P3-06 | 内联额度徽标 + 可选工具栏胶囊 | `QuotaBadge.tsx` | 1 | P3-03 |
| P3-07 | 中英文文案与文案审查 | locale | 0.5 | P3-04 |
| P3-08 | 空/加载/过期/耗尽/离线/模型下架状态 | UI 状态 | 1 | P3-04 |
| P3-09 | 隐藏账号、日志脱敏 | 隐私开关 | 0.5 | P3-04 |
| P3-10 | UI 测试与窄屏适配 | 测试 | 1 | P3-04 |

### Phase 4 — Qoder CN（4–6 人日）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P4-01 | Qoder 描述符与 provider ID | `channels/qoder.ts` | 0.5 | Phase 3 |
| P4-02 | PAT 授权流（优先）+ 浏览器备选 | auth flow | 1.5 | P4-01 |
| P4-03 | 模型列表、免费模型过滤、额度窗口 | adapter | 1 | P4-02 |
| P4-04 | 工具/推理/错误映射测试 | tests | 1 | P4-03 |
| P4-05 | 真实 Qoder CN 账号联调 | 联调记录 | 1 | P4-03 |
| P4-06 | 修复差异、更新文案 | 问题清单 | 1 | P4-05 |

### Phase 5 — Trae CN（4–8 人日，实验）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P5-01 | Trae 描述符与浏览器回调 | `channels/trae.ts` | 1 | Phase 3 |
| P5-02 | 真实 Trae CN 账号 spike：登录、模型、聊天 | spike 记录 | 2 | P5-01 |
| P5-03 | 工具/推理/错误映射 | tests | 1 | P5-02 |
| P5-04 | 免费层行为、额度、已知限制 | 文档 | 1 | P5-03 |
| P5-05 | go/no-go：是否进主线 | 决策 | 0.5 | P5-04 |

### Phase 6 — 打包与发布（3–4 人日）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P6-01 | 构建、版本、changelog | release | 1 | Phase 2–5 |
| P6-02 | 干净 DSH 安装/卸载测试 | 验收记录 | 1 | P6-01 |
| P6-03 | README、支持矩阵、风险声明 | docs | 0.5 | P6-01 |
| P6-04 | 可选的 magpie 迁移说明 | docs | 0.5 | P6-01 |
| P6-05 | Beta 发布与反馈渠道 | release | 1 | P6-02 |

### Optional Phase 7 — OpenCode Zen free（5–10 人日）

| ID | 任务 | 产出 | 估算 | 依赖 |
| :--- | :--- | :--- | :--- | :--- |
| P7-01 | Bun sidecar 设计与打包 | sidecar | 2 | — |
| P7-02 | Zen free 适配（public 凭证、模型、headers） | adapter | 2 | P7-01 |
| P7-03 | 实验开关、风险提示、独立安装 | settings | 1 | P7-02 |
| P7-04 | 真实环境测试与限制文档 | docs | 1–3 | P7-02 |

**总计（核心）**

- Phase 0–3：约 17–26 人日（WorkBuddy MVP + UI）
- Phase 4：约 4–6 人日（Qoder）
- Phase 5：约 4–8 人日（Trae，实验）
- Phase 6：约 3–4 人日（发布）
- 合计：约 28–44 人日（不含 OpenCode Zen free）

---

## 11.5 Phase 0 实测结果（2026-11-06）

**结论：GO。** 详细报告见 [phase-0-spike-report.md](./phase-0-spike-report.md)。

已验证：

- DSH `0.2.2-rc.1` 临时 web profile 可启动，profile patch `insert` 可加载本地插件。
- 自定义 `LlmAdapter` 注册成功，模型出现在 DSH 模型选择器。
- fake adapter 流式返回文本 + usage + finish，DSH 正常渲染并生成会话标题。
- `@earendil-works/pi-ai@1.3.0` 自定义 `fetch` 实测可用；`compat.stream` 需要传 `apiKey`。
- WorkBuddy / Trae / Qoder / QwenWork 渠道包在 Node 24 下加载成功，`auth.loader`、`fetch`、`usage`、`chat.headers` 均存在；无账号时 `loader` 返回 `{}`。

契约修正（必须写进实现）：

1. `LlmAdapter` 必须实现 `providerRetryPolicy` 与 `prepareCall`；`prepareCall` 返回 `{ model, stream }`。
2. 没有推理档位时省略 `reasoning` 字段，不能传 `{ efforts: [] }`。
3. pi-ai `compat.stream` 必须传 `apiKey`，否则在 fetch 之前报 `No API key for provider`。
4. `dsh plugin add` 只安装依赖；作为 profile 层生效需要 `cordis.patch.yml` 的 `insert`，或包自带 `dsh.bundle.patch`。

尚未验证：`ctx.credentials` 运行时锁、`ctx.authorization` 浏览器流、`settings.section` / `conversation.input.model.label` 真实渲染、DSH 原生 OAuth UI、真实账号请求。

### Phase 2/3 实现进度（2026-11-06）

已完成：

- `ChannelWorkerHost`（worker_threads）+ OpenCode client shim + 渠道包加载。
- WorkBuddy / Qoder CN / Trae CN 的真实静态模型目录接入 DSH：
  - WorkBuddy CN：15 个模型
  - Qoder CN：4 个模型（测试时通过 `channelPackages` 指向本地包）
  - Trae CN：6 个模型
- DSH 模型目录接口 `/api/session/modelCatalog` 已确认包含 `hitchfin-workbuddy-cn` / `hitchfin-qoder-cn` / `hitchfin-trae-cn`。
- `settings.section` 设置页渲染：渠道卡片、登录按钮、模型数量、登录中/取消状态。
- Host 路由（DSH webServer）：
  - `GET /dsh-hitchfin/state`
  - `POST /dsh-hitchfin/login/start`
  - `GET /dsh-hitchfin/login/status`
  - `POST /dsh-hitchfin/login/code`
  - `POST /dsh-hitchfin/login/cancel`
  - `POST /dsh-hitchfin/free-only`
  - `POST /dsh-hitchfin/delete`
- WorkBuddy 真实登录 authorize 已验证：返回真实 `workbuddy.cn` 授权 URL；取消后状态正确变为 `cancelled`。
- 发现并修复：DSH Web 中 `window.open` 会把当前页导航走，改为设置页内显式“打开登录页面”链接。

WorkBuddy 实测（2026-11-06，已完成）：

- 浏览器登录完成，账号写入 `ctx.credentials`（scope `dsh-hitchfin`）。
- 修复 auth 形状：渠道回调返回 `type: "success"`，改为 `type: "oauth"` 后 live 模型/请求才可用；旧记录已自动迁移。
- live 模型列表：17 个模型，其中 2 个免费（`hy4free`、`hy3`）；套餐为 Free plan。
- 真实请求：`hy4-free` 返回 HTTP 200 SSE，确认走 WorkBuddy 订阅。
- Adapter 端到端：`listModels` 返回 `hy4free,hy3`；真实流式 chunk 为 `block-start,reasoning-delta,block-end,text-delta,usage,finish`；文本 `OK`，reasoning 143 字符，usage 60/76；finish `stop`。
- 免费过滤：free-only 开 → 2 个；关 → 17 个；隐藏 `hy3` → 16 个；恢复后 → 2 个。
- DSH 模型目录 `/api/session/modelCatalog` 随配置变更刷新（`llm/models-updated`）。
- 额度窗口：Credits / Extra credits / Total credits 已读取并展示。
- WorkBuddy 三种登录方式：浏览器、桌面登录、API Key；API Key 的 worker 路径已验证为 `{type:"api", key}`。
- 设置页首屏约 0.4 秒（先渲染渠道/模型，额度异步补齐）。
- 修复：占位 URL 改为渠道真实 base URL（WorkBuddy `copilot.tencent.com/v2`）；修复 `modelsChanged` 递归导致缓存不失效。
- 分发验证：`npm pack` 后在全新临时 DSH profile 执行 `dsh plugin --profile web add dsh-hitchfin-0.1.0.tgz`：
  - 插件自动进入 profile bundles
  - WorkBuddy / Qoder / Trae optional 渠道包自动安装
  - 三个渠道均显示可用；无账号时模型目录为空；生产模式无 spike provider
  - 干净 profile 的 `/dsh-hitchfin/state` 与设置页均正常

Phase 4 进展（2026-11-06）：

- 渠道包改为插件的 `optionalDependencies`，版本固定：
  - `@magpie-community/opencode-workbuddy-auth@0.2.24`
  - `@magpie-community/opencode-qoder-auth@0.2.61`
  - `@magpie-community/opencode-trae-auth@0.2.30`
- 包解析不再依赖 magpie 安装目录；用户安装插件时会随 optional deps 安装渠道包。
- Qoder CN 浏览器登录启动已验证：返回真实 `qoder.cn` 设备授权 URL。
- Qoder PAT 输入链路已验证：传入 PAT 后返回 `qoder.cn/account/integrations` 授权地址，回调可继续完成 PAT 登录。
- Trae CN 浏览器登录启动已验证：返回真实 `trae.cn` 授权 URL + 本地回调端口；取消后通过重启 channel worker 释放回调服务器。
- 设置页的“渠道包未安装”状态已可用；渠道包缺失时不会显示可点击的登录按钮。

仍需验证/补齐：

- Qoder CN / Trae CN 真实登录完成与真实请求（需要真实账号）。
- WorkBuddy API key 的输入提示流程（当前已支持浏览器/桌面登录）。
- 多账号、账号命名、代理、路由组等配置能力。
- 渠道包更新/兼容性提示 UX。

Phase 5 主桌面安装（2026-11-06，已完成加载验证）：

- 备份 `~/.dsh/profiles/desktop` 的 `package.json`、`cordis.patch.yml`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis.yml` 到 `~/.dsh/backups/dsh-hitchfin-<timestamp>`。
- `dsh plugin --profile desktop add` 被 CLI 拒绝（Electron 独占 profile），改用：
  - `pnpm add /path/to/dsh-hitchfin-0.1.0.tgz`
  - 把 `dsh-hitchfin` 加入 `dsh.profile.bundles`
- compose 校验：`dsh-hitchfin` 已插入；magpie 的 `llm-pi-ai` providers 和 `agent-default-model`（Trae CN）保持不变。
- 重启桌面版后通过 CDP 确认渲染器实际渲染：设置侧栏出现「订阅接入」，WorkBuddy/Qoder/Trae 三张渠道卡和登录方式均显示；账号为空。
- 主 profile 不继承临时 web profile 的 WorkBuddy 账号，需要在桌面版重新登录一次。
- 注意：手动 pnpm 安装的插件可能不被 dshmarket 的安装状态记录；后续更新/卸载需通过 dshmarket 重新安装或手动 pnpm 处理，待后续统一优化。

### Phase 1 结果（2026-11-06）

已完成可安装的 host-only 脚手架：

- `package.json`、`cordis.patch.yml`、`tsconfig.json`、`src/`、`locale/`、`tests/`。
- `HitchfinAdapter` 实现 `providerInfo` / `providerRetryPolicy` / `listModels` / `resolveModel` / `prepareCall` / `stream`。
- 构建：`npm run build`（tsc）通过。
- 单测：`npm test` 3/3 通过。
- 安装：`dsh plugin --profile web add <repo>` 后，`dsh.profile.bundles` 自动包含 `dsh-hitchfin`，bundle patch 自动插入。
- DSH web 实测：模型选择器显示 `验证 Spike Model`；发送后返回 `hello from hitchfin scaffold`、usage 5 tok、1 秒完成。
- 模型 badge 实测：`{ text: { en: 'Spike', zh: '验证' }, tone: 'info' }` 在模型选择器正常显示。

Phase 1 未做：client settings section、channel worker、真实账号登录、真实渠道请求。

---

## 12. 里程碑与验收标准

### M0 — 契约验证

- [ ] DSH 原生订阅登录入口确认。
- [ ] 自定义 adapter 能注册并出现在模型选择器。
- [ ] pi-ai 自定义 fetch 能流式返回。
- [ ] WorkBuddy 包能在 Node worker 中加载并调用 loader/fetch。
- [ ] `ctx.credentials` 与授权流可用。
- [ ] 三个 Slot 可渲染。
- [ ] spike 报告完成。

### M1 — Fake Channel 可跑通

- [ ] fake channel 返回文本、推理、工具调用、usage。
- [ ] DSH 能正确渲染 tool call 与 reasoning。
- [ ] 取消请求后不再产生 chunk。
- [ ] 错误码映射正确。
- [ ] Settings 页可见。

### M2 — WorkBuddy MVP

- [ ] 真实 WorkBuddy CN 账号可登录。
- [ ] 模型列表出现免费模型。
- [ ] 聊天可用，含工具调用与推理。
- [ ] 免费窗口/额度可见。
- [ ] 401 能引导重新登录。
- [ ] 429/免费耗尽有清晰提示，不自动花积分。
- [ ] token 不出现在日志/UI。

### M3 — 免费层与 UI 完善

- [ ] “仅免费模型”默认开启且可切换。
- [ ] 模型可见性可编辑。
- [ ] 添加账号弹层三种方式可用（至少一种）。
- [ ] 空/加载/过期/耗尽状态完整。
- [ ] 中英文文案完成。
- [ ] 隐藏账号开关可用。

### M4 — Qoder CN

- [ ] PAT 登录可用。
- [ ] Qoder CN 免费模型列表正确。
- [ ] 工具/推理/额度正常。
- [ ] 真实账号联调通过。

### M5 — Trae CN

- [ ] 浏览器登录可用。
- [ ] 模型列表与聊天可用。
- [ ] 已知限制文档化。
- [ ] go/no-go 决策完成。

### M6 — Beta 发布

- [ ] 干净 DSH 安装可用。
- [ ] 卸载/清理说明完整。
- [ ] README、支持矩阵、风险声明完成。
- [ ] 版本号、changelog、发布包完成。

---

## 13. 风险登记表

| 风险 | 影响 | 概率 | 缓解 |
| :--- | :--- | :--- | :--- |
| 厂商 ToS / 封号 | 高 | 中 | 个人使用；不共享/不转售；不做额外规避；渠道包可选；明确风险提示 |
| 免费层策略变化 | 高 | 高 | 渠道包可独立更新；清晰错误；模型目录动态；不承诺长期可用 |
| Refresh token 竞态 | 高 | 中 | 只用 `ctx.credentials.modifyRecord`；单刷新者；不与 magpie 双跑 |
| 流式/工具映射 bug | 高 | 中 | fake channel 契约测试；真实账号矩阵；旧实现参考 |
| DSH API 变更 | 中 | 中 | 固定 `dsh.engines`；契约测试；跟进 0.2.x |
| Worker/供应链 | 中 | 中 | 子进程；版本固定；完整性校验；最小环境；只传单账号快照 |
| Trae 实验性 | 高 | 高 | 先 spike；标记 beta；不阻塞主线 |
| OpenCode Zen Bun/伪装 | 高 | 高 | 不进核心；独立实验包；默认关闭 |
| IPC 流式性能 | 中 | 低 | 批量 chunk；背压；测量 TTFT |
| 免费号池滥用 | 高 | 中 | 不做多账号免费池；不自动签到；手动、单账号 |

---

## 14. 待验证清单（开发前必须完成）

- [ ] DSH 0.2.2 Settings → Models 中，Codex / Copilot / Claude / Kimi 的 OAuth 入口是否实际可用。
- [x] 自定义 `LlmAdapter` 注册后，模型选择器是否立即出现；`llm/models-updated` 是否刷新（模型出现已验证；动态刷新待验）。
- [x] pi-ai 1.3.0 的 `fetch` 选项在 DSH 打包版本中是否被实际传递到 provider API（已用 fake SSE server 验证）。
- [ ] `ctx.credentials` 的 GrantRecord 是否能存下渠道包的 OAuth payload（大小/格式）。
- [ ] `ctx.authorization` 的 `notify({ url })` 是否能打开系统浏览器；`prompt({ kind: 'secret' })` 是否可用。
- [ ] `settings.section` 在 0.2.2 的注册参数与渲染方式。
- [ ] `conversation.input.model.label` 的 props 是否与旧文档一致（provider/model/placement/selected）。
- [ ] WorkBuddy 包在 Node 24 worker 中是否可加载（无 Bun 专有 API）。
- [ ] Qoder 包的 PAT 流程是否需要浏览器回调；Qoder CN 域名是否可用。
- [ ] Trae CN 插件是否能在真实账号上跑通（README 标 Experimental）。
- [ ] 免费模型列表是否包含价格/免费标记；WorkBuddy 的免费窗口是否来自 usage。
- [ ] 模型 `contextWindow` / `maxTokens` 在 DSH 压缩中的实际行为。

---

## 15. 复用清单与参考

### 15.1 magpie

- 渠道宿主与协议：
  - `magpie/internal/plugin/host.js`（3,457 行）
  - `magpie/internal/plugin/providers.go`
  - `magpie/internal/plugin/load.go`
- DSH 当前接入方式（只读参考，不复制）：
  - `magpie/internal/agent/dsh.go`
- GUI 形态与文案：
  - `magpie/internal/gui/assets/index.html`
  - `magpie/internal/gui/assets/app.js`
  - `magpie/internal/gui/assets/i18n.js`
  - `magpie/site/public/img/add-zh-light.png`
  - `magpie/site/public/img/providers-light.png`
  - `magpie/site/public/img/agents-zh-light.png`
  - `magpie/site/public/img/routing-zh-light.png`
  - `magpie/site/public/img/panel-light.png`

### 15.2 旧实现（git 历史）

- `db4574a:src/adapter/pi-ai-transport.ts`（261 行）
- `db4574a:src/adapter/openai-sse-transport.ts`（602 行）
- `db4574a:src/channels/pool.ts`（396 行）
- `db4574a:src/router/group-router.ts`（222 行）
- `db4574a:src/client/index.tsx`（2,462 行）
- `db4574a:src/rpc/http-routes.ts`（611 行）——**不要复用**，改用 DSH RPC

### 15.3 DSH 包

- `@deepseek-ai/dsh-llm@0.2.2-rc.1`
- `@deepseek-ai/dsh-llm-pi-ai@0.2.2-rc.1`
- `@deepseek-ai/dsh-credentials@0.2.2-rc.1`
- `@deepseek-ai/dsh-authorization@0.2.2-rc.1`
- `@deepseek-ai/dsh-settings@0.2.2-rc.1`
- `@earendil-works/pi-ai@1.3.0`

### 15.4 渠道包

- `@magpie-community/opencode-workbuddy-auth@0.2.24`
- `@magpie-community/opencode-qoder-auth@0.2.61`
- `@magpie-community/opencode-trae-auth@0.2.30`
- `opencode-zen-freex@0.5.16`（可选，不推荐进核心）

---

## 16. 附录：术语

| 术语 | 含义 |
| :--- | :--- |
| DSH | DeepSeek Harness，本项目宿主 |
| 渠道包 | `@magpie-community/opencode-*-auth` 这类 OpenCode 插件包 |
| 宿主 shim | 让渠道包以为自己在 OpenCode/magpie 中运行的适配层 |
| `auth.loader` | 渠道包提供的逐请求认证/端点/fetch 解析函数 |
| `fetch` | 渠道包提供的厂商请求转换函数 |
| `free-only` | 只显示/只允许免费模型 |
| 免费窗口 | WorkBuddy 每日免费模型 token 窗口等 |
| Sticky | 同一会话固定同一账号，保护 prompt cache |
| Cooldown | 账号 429/额度耗尽后的冷却期 |
| StreamChunk | DSH 的流式输出协议 |
| LlmAdapter | DSH 的模型提供商适配器接口 |

---

## 17. 变更记录

| 日期 | 版本 | 变更 |
| :--- | :--- | :--- |
| 2026-11-06 | v0.1 | 初稿：范围、架构、页面、WBS、验收、风险 |
