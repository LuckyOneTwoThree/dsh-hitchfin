# dsh-hitchfin 项目理解报告

> **状态说明（2026-11-10）**：本文是 0.3.1 时期的快照。此后已完成 Anthropic Messages 协议、账号优先级/停用、模型归属、熔断与清理链路等改动；其中“协议未打通”“17 项测试”“生产路径不调用 stop()”等结论已经过期。当前行为的准绳是源码与测试；阅读历史判断时请以本节之后的“历史快照”定位来看。

本文作为后续优化决策的依据。

## 1. 结论

dsh-hitchfin 是运行在 DeepSeek Harness（DSH）内的原生订阅接入插件，把用户已有的 WorkBuddy CN、Qoder CN、Trae CN 官方账号订阅模型注册成 DSH 模型供应商。官方登录、多账号、账号级代理、免费模型过滤、模型可见性、sticky 路由与冷却故障转移、设置页已形成闭环。

项目已越过「能不能跑通」的阶段。当前主要短板不是功能缺失，而是**协议完整性、真实渠道可靠性、故障域隔离、状态一致性、可观测性与测试深度**。最值得优先解决的是协议路由与配套契约测试，其次是 worker 生命周期与安全边界；前端结构性治理宜押后。

产品定位是个人账号桥接工具，不是 API Key 聚合器，也不是 magpie 的第二网关；明确不共享账号、不自动签到、不绕过厂商限制（`README.md:33-35,130-136`）。

## 2. 项目定位与整体架构

| 层次 | 组成 | 职责 |
|---|---|---|
| DSH 宿主 | llm / credentials / authorization / webServer | 通过 Cordis 插件层加载 `apply(ctx, config)`，提供模型注册、凭据、授权与本地 HTTP 能力 |
| 插件主进程（`lib/`） | `LlmAdapter`、设置路由、`ChannelWorkerHost`、`AccountStore` | 模型目录与账号路由、本地设置 API、worker RPC、凭据读写 |
| Worker | 单个 `worker_threads`（`worker/index.mjs`） | 渠道包 hooks、代理 dispatcher、厂商 fetch、登录与额度 |
| 厂商端点 | WorkBuddy CN / Qoder CN / Trae CN | 由渠道包给出 baseURL、认证头、模型目录与额度 |

旁路：`client/client.js` 经 `window.__ModuleLoader__` 注入设置页，通过 loopback `/dsh-hitchfin/*` 与本地 HTTP API 交互；账号落在宿主 credential grant。

三层转换构成技术核心：OpenCode 渠道包 API → DSH `LlmAdapter`、OpenAI SSE → `StreamChunk`、渠道 auth → DSH credentials；账号设置与凭证共同存于凭据记录。关键设计：

- 哨兵域名 `hitchfin.local/v1/chat/completions` 承载 OpenAI 兼容请求，在 worker 内换成渠道包 baseURL（`src/adapter/openai-sse.ts:10`、`worker/index.mjs:243-262`）。
- 第三方渠道包在 worker 中加载，主线程每次调用只传当前账号的 auth 快照（`src/host/worker-host.ts:105-110`）。
- 代理通过 `AsyncLocalStorage` + `undici.ProxyAgent` 注入（`worker/index.mjs:5,42-73`）。
- `cordis.patch.yml` 只 insert 一层 bundle，不改宿主默认 provider。

## 3. 目录与模块职责

| 路径 | 职责 | 版本控制 |
|---|---|---|
| `src/index.ts` | 装配入口：注册 adapter、授权流、HTTP 路由，触发 auth 迁移 | 已入库 |
| `src/channels/descriptor.ts`、`src/channels/registry.ts` | 三渠道静态描述（含 `protocols`）、包名/导出名/版本、包解析与 fallback 目录 | 已入库 |
| `src/adapter/hitchfin-adapter.ts` | 模型目录（30s 缓存）、sticky、冷却、跨账号 failover、错误分类 | 已入库 |
| `src/adapter/openai-sse.ts` | Chat 请求构造、状态码→错误码、SSE→`StreamChunk` | 已入库 |
| `src/accounts/store.ts` | credential grant 读写、auth 归一化、账号 ID 分配、渠道级设置批量写 | 已入库 |
| `src/host/worker-host.ts` | worker 生命周期、RPC、base64 chunk → `ReadableStream`、`stop()` / `restart()` | 已入库 |
| `worker/index.mjs` | OpenCode / magpie shim、渠道包动态加载、登录、模型、额度、代理、厂商 fetch | 已入库，且是唯一入库的运行时产物 |
| `src/routes.ts` | 约 13 个本地端点、loopback/Origin 围栏、登录状态机 | 已入库 |
| `src/client/index.tsx` | 约 2700 行单体 React 设置页：样式、状态机、请求、渲染、双语 | 已入库 |
| `tests/` | 109 项 Node 测试（0.4.5）：账号存储、适配器路由与冷却、SSE 映射、代理隧道 | 已入库 |
| `lib/`、`client/` | tsc / esbuild 构建产物 | 未入库 |
| `dsh-hitchfin-*.tgz` | 本地发布包 | 未入库 |
| `magpie/` | 上游 `yetone/magpie` 本地克隆，仅作渠道包与 UI 参考 | 未入库，不参与构建与运行时 |
| `docs/`、`assets/`、`locale/`、`screenshots.json` | 开发计划、Phase 0 契约验证、市场上架 kit、图标与截图、双语 name/description | 已入库 |

纳入版本控制的是源码、配置、文档与运行时 worker；构建产物、本地发布包与参考仓库不入库。

## 4. 核心业务流程与数据流

1. **登录（双轨）**：设置页选渠道与方式 → `POST /login/start` → `registry.loadInfo` → `worker.authorize` → 浏览器 / 设备码 / API Key → `/login/callback` → `normalizeAuth`（`success` → `oauth`）→ 写 credential grant（记录内含 `auth`、`freeOnly`、`hiddenModels`、`proxy`、`label`）→ 触发 `llm/models-updated`（`src/routes.ts:442-593`、`worker/index.mjs:448-500`）。另有 `src/index.ts:73-143` 的 DSH 原生 `registerFlow`，固定账号 `acct-1`、仅注册 `authMethods[0]`。
2. **模型目录**：遍历该渠道所有账号 → 按账号拉模型 → freeOnly / hidden 过滤 → 按 model id 合并（保留更优 free 元数据，并记录 `accountId`）→ 按显示名打分去重（`src/models.ts:21-47`）→ DSH 模型列表。
3. **聊天**：`prepareCall` / `stream` → 路由键 `provider + model + session` 取 sticky → 排除冷却账号 → 逐账号尝试 → `ChannelWorkerHost.fetch` → worker 合并 `auth.loader` / `chat.headers` / Bearer / dispatcher → 厂商 fetch → base64 chunk 回传组流 → SSE → `StreamChunk` → DSH 渲染。**首块输出前失败才允许切号**，首块后失败直接终止。冷却窗口：AUTH 10 分钟、QUOTA 15 分钟、RATE_LIMIT 60 秒（或 `Retry-After`）、SERVER 60 秒、TRANSPORT 30 秒、MODEL_NOT_FOUND 30 分钟且限定账号+模型。
4. **设置页刷新**：先无额度拉取，350 ms 后带额度；登录过程每 1.5 秒轮询状态（`src/client/index.tsx:1324,1360`）。
5. **数据归属**：凭证只落宿主凭据库；设置页只接收掩码后的账号标签与代理；无 WebSocket、无环境变量、无遥测。

## 5. 关键依赖与配置项

| 类别 | 内容 |
|---|---|
| 宿主 | DSH `>= 0.2.2-rc.1`；`src/types.ts:1-8` 是宿主 API 的手写 duck-typed 镜像，无编译期契约 |
| 唯一硬依赖 | `undici ^7.30.2`，用于 worker 内 `ProxyAgent` |
| 渠道包 | `@magpie-community/opencode-qoder-auth@0.2.61`、`opencode-trae-auth@0.2.30`、`opencode-workbuddy-auth@0.2.24`，精确锁版本 optionalDependencies；缺包时 `/login/start` 返回 409、模型为空 |
| optional peer | 7 个（`@deepseek-ai/*` 四个 `0.2.2-rc.1`、`cordis ~4.1.0`、`schemastery ^3.19.0`、`pi-ai ^1.3.0`）在源码中均无 import。`pi-ai` 在 `docs/development-plan.md:25,294` 中描述为传输层，实际由自建 `openai-sse.ts` + worker fetch 桥替代 |
| 宿主元数据 | `dsh.bundle.patch` → `cordis.patch.yml`；`dsh.client.inject` 声明的两个模块在 `.tsx` 中未 import；`platform: web` 而 README 称支持 Desktop；`engines.dsh` 双写且非 npm 标准键；README 的 Node ≥ 20.18.1 无 `engines.node` 校验 |
| 用户配置 | 仅 `devSpike` / `devStaticModels` / `channelPackages`；无配置文件、无 schema、无环境变量。策略大量硬编码：冷却表、超时 30s/60s/15min、8s/5s、缓存 30s、64KB body、sticky 200、未知模型伪造 128000 / 16384 |
| 构建与发布 | `tsc → lib`（include 仅 `src/**/*.ts`，不含 `.tsx`）+ esbuild → `client/client.js`；`prepack` 自动 build；`files` 8 项白名单。0.3.1 tarball 共 47 项，含 `lib/index.js`、`client/client.js`、`worker/index.mjs`、`assets/`、`locale/`、双 README 与 patch |

## 6. 现有实现约束

- **协议未打通**：`ChannelProtocol` 定义了 `anthropic-messages`（`src/channels/descriptor.ts:7-10`），WorkBuddy 声明该协议（`src/channels/registry.ts:45`），但运行时代码未读取该字段。请求体固定 OpenAI Chat Completions、URL 固定哨兵 `/v1/chat/completions`；worker 虽已有 `sdkHeaders` 对 `@ai-sdk/anthropic` 发 `x-api-key`、`channelUrl` 有 `/v1/messages` 分支，但这些分支不可达（`worker/index.mjs:255-257,502-508`）。渠道包明确 Claude 模型走 Anthropic `/v1/messages`（`node_modules/@magpie-community/opencode-workbuddy-auth/index.mjs:153-177`）。
- **故障域未隔离**：单个 `worker_threads` 实例，所有渠道共享全局 `channels` 模块缓存与 `globalThis.fetch` 猴补丁。线程隔离保护了宿主，但未隔离渠道之间。`docs/development-plan.md:419-421,1110` 描述的「子进程隔离」「完整性校验」与实现不符（`worker/index.mjs:194` 动态 import 无校验）。
- **worker 生命周期**：`ensureWorker` 在 exit 时置空实例，下次调用惰性重建；`restart()` 已实现并在 `cancelAuth` 中于 `streams.size === 0` 时调用（`src/host/worker-host.ts:127-130,324-347`）。缺的是主动健康探测、崩溃熔断与卸载清理：`stop()` 已实现，但仅测试内显式调用，生产装配路径未调用，`apply()` 未注册清理钩子。崩溃路径的 `exit → failAll` 无在途请求保护。
- **代理机制非标准**：替换 `globalThis.fetch` 并给 `undici.fetch` 传 `dispatcher`，对 Node / undici 版本与渠道包请求方式敏感。
- **状态全在内存**：sticky、cooldown、登录记录、模型缓存，以及 worker 内 `authSessions` / `proxyAgents` 均无持久化；重启或热重载后丢失，多进程 profile 不共享。
- **模型与账号解耦**：目录按 model id 合并、按显示名去重，元数据虽记下 `accountId`，但 `stream` 选账号只按 sticky 与冷却筛选，不校验所选账号是否拥有该模型（`src/adapter/hitchfin-adapter.ts:295-334,457-469`）。
- **渠道级设置是逐账号复制**：`setChannelFreeOnly` / `setChannelHiddenModels` 循环写入每个账号（`src/accounts/store.ts:120-132`）；新增账号继承默认值，已有账号之间可能漂移。
- **双登录入口**：设置页 HTTP 状态机与 DSH 原生 `registerFlow` 并存，后者固定单账号、单一登录方式。
- **错误分类较粗**：404 一律 `MODEL_NOT_FOUND`（`src/adapter/openai-sse.ts:204-205`）；JSON 非流响应默认 `SERVER`（仅识别 401 为 AUTH）；未知异常统一 `SERVER` → 60 秒冷却（`src/adapter/hitchfin-adapter.ts:120`）。渠道包已有的结构化错误信息未被利用。
- **可观测性弱**：约 20 处空 catch、无脱敏诊断日志，而 `worker/index.mjs:610` 用 `console.error` 打印完整 error，可能带凭证信息。
- **前端单体**：2700 行 `.tsx` 不受 typecheck（`tsconfig.json:16`）、零测试。
- **测试偏 happy path**：历史快照中的 17 项测试全部针对 `lib` 产物，未覆盖真实渠道包加载、Anthropic 协议、登录取消竞态、worker 崩溃恢复、模型跨账号差异与前端交互。

## 7. 潜在风险

| 影响 / 概率 | 风险 | 证据 |
|---|---|---|
| 高 / 中高 | WorkBuddy Claude 模型可见但请求失败，直接破坏「模型可用」的核心承诺 | `descriptor.ts:10`、`registry.ts:45`、`openai-sse.ts:244`、渠道包 `index.mjs:153-177` |
| 高 / 中 | 单 worker 共享导致渠道间故障传播；崩溃时 `exit → failAll` 一并终止在途请求 | `worker/index.mjs:5-8`、`worker-host.ts:127-130,431-441` |
| 高 / 中 | 本地 HTTP 与供应链边界：无 Origin 直接放行、异常 Origin 在 catch 中放行、`/login/apikey` 收明文 key 且未走代理、动态 import 无校验且 fallback 目录可被本地改写 | `routes.ts:76-96,530-538`、`worker/index.mjs:194`、`registry.ts:10` |
| 中高 / 中 | 代理机制随 Node / undici 或渠道包请求方式变化失效 | `worker/index.mjs:56-73` |
| 中高 / 待验证 | auth 写回与设置更新是否互相覆盖，取决于宿主 `modifyRecord` 的锁语义；`updateAuth` / `update` 均基于现有 payload 合并，Phase 0 将宿主 GrantRecord 锁行为列为尚未验证 | `store.ts:187-197,207+`、`docs/phase-0-spike-report.md:131` |
| 中 / 高 | 重启后 sticky / cooldown 丢失 → prompt cache 命中下降、重复撞限流 | `hitchfin-adapter.ts:222-240,270-273` |
| 中 / 中 | 登录记录无 TTL 与清理、`cancelAuth` 的 setInterval 无上限；`completeLogin` 成功分支不检查 `cancelled`，取消后仍可能写入账号 | `routes.ts:699-711`、`worker-host.ts:329-340` |
| 中 / 中 | 模型元数据被跨账号合并覆盖，账号独有模型可能被路由到无权限账号 | `hitchfin-adapter.ts:295-334,457-469` |
| 中 / 中 | 文档与验证状态落差：Qoder 标 Stable 但 live chat 未验证；Node 要求无 engines 校验；`pi-ai` 描述失实；`dsh.client.inject` 声明未被引用；开发计划承诺的完整性校验未实现 | `README.md:105,143`、`docs/development-plan.md:25,294,1110`、`package.json` |
| 中 / 低 | 源码、构建产物与 tarball 的版本关系靠人工维护。npm 发布路径本身完整（`prepack` + `files` 白名单），源码安装按 README 需先 build；干净克隆直接 `npm test` 会因缺少 `lib/` 失败 | `package.json:44-54,78`、`README.md:76-81,150-155` |
| 外部条件 | 厂商免费层、模型目录与接口随时变化；第三方渠道包持有用户网络与凭据访问能力，锁版本降低漂移的同时也意味着安全更新需主动跟进 | `README.md:108,173-177` |

## 8. 优化方向优先级

按预期收益与改动影响排序，并标注确定性。

| 序 | 方向 | 预期收益 | 改动影响 | 决策提示 |
|---|---|---|---|---|
| 1 | 打通协议路由，优先 Anthropic Messages | 最高，直接关系模型可用性承诺 | 中：descriptor / adapter / SSE / worker 边界 | 已有 Anthropic 相关分支，重点是让 `protocols` 驱动 URL 与请求体 |
| 2 | 建立真实渠道契约测试矩阵 | 高，防止协议与错误分类回归 | 小：纯测试增量 | 与 1 同属第一梯队；覆盖文本/推理/工具、Claude Messages、Qoder SSE、Trae 实验路径、401/429/404/流中断 |
| 3 | worker 故障域与生命周期治理 | 高 | 中：host 与装配层 | 已有惰性重建，缺口是按渠道或请求池隔离、崩溃熔断与健康探测、卸载清理、文档措辞对齐 |
| 4 | 本地 HTTP 与第三方包加载的可信边界 | 高：凭证与本地进程安全 | 中，边界清晰 | 对应开发计划中未兑现的完整性校验承诺 |
| 5 | 细化错误模型与可观测性 | 中高 | 中低，集中且风险低 | 保留 status / code / retryAfter / signIn，区分鉴权、额度、模型、上游与协议错误；日志需脱敏 |
| 6 | 模型归属校验与路由状态一致性 | 中高 | 中 | 合并「按 ID 合并不校验账号」「重启丢 sticky/cooldown」「渠道级设置复制」三条 |
| 7 | 登录状态机与在途请求竞态 | 中高 | 小～中，局部 | 取消后仍写账号、记录无 TTL、定时器无上限 |
| 8 | 账号记录模型：auth 与设置分离或版本化 schema | 中高但依赖前提 | 中～大 | 需先验证宿主 `modifyRecord` 锁语义，再决定是否调整数据结构 |
| 9 | 前端单体组件治理 | 中，偏长期 | 大 | 除非 UI 持续大改，收益 / 影响比最低 |
| 10 | 依赖与发布流程清理、文档对齐 | 中 | 小 | 移除未使用 peer、明确源码/产物/tarball 关系、增加发布前一致性检查；可并行 |

Qoder 与 Trae 的实时链路验证收益高，但受厂商侧条件约束，应作为独立验证任务，不计入代码优化项。

## 9. 当前验证状态与待验证事项

已验证：

- `npm run typecheck` 通过；`npm test` 109 / 109 通过（0.4.5 修复后）。
- Node.js `v22.22.2`；DSH 宿主 `0.2.2-rc.1`。
- `dsh-hitchfin-0.3.1.tgz` 共 47 项，关键产物齐全。
- 本机 desktop profile 已安装 0.3.1 tarball（现场确认，非构建产物校验）。

待验证：

- 宿主 `ctx.credentials` 的 GrantRecord 读写与锁行为（Phase 0 遗留）。
- Qoder CN、Trae CN 的实时 chat 链路。
- Claude 模型在当前实现下的实际失败表现。
- `llm/models-updated` 动态刷新行为。
- `dsh.client.inject` 声明与代码不对齐的运行期影响。
