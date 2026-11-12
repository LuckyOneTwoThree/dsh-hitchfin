<p align="center">
  <img src="https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/assets/icon.png" width="92" alt="dsh-hitchfin" />
</p>

<h1 align="center">dsh-hitchfin</h1>

<p align="center">
  <strong>把已经在用的 WorkBuddy、Qoder、Trae 订阅账号接进 DeepSeek Harness。</strong>
</p>
<p align="center">
  多账号优先级与故障转移 · 账号级 HTTP(S) 代理 · 免费模型过滤 · 模型可见性
</p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="#安装">安装</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能">功能</a> ·
  <a href="#渠道">渠道</a> ·
  <a href="#多账号路由">多账号路由</a> ·
  <a href="#开发">开发</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/DSH-%E2%89%A50.2.2--rc.1-111827?style=flat-square" alt="DSH" />
  <img src="https://img.shields.io/badge/version-0.5.2-2F6B5F?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/tests-148%20passing-2F6B5F?style=flat-square" alt="tests" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
</p>

![dsh-hitchfin 设置页](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-light.png)

## 为什么做这个插件

DSH 已经有一整套通用 API Key 供应商能力。`dsh-hitchfin` 覆盖的是另一种情况：你已经在付费或免费使用的订阅套餐，通过厂商官方账号登录来使用。

插件把 WorkBuddy CN、Qoder CN、Trae CN 注册成 DSH 原生模型供应商。用官方账号登录后，账号有权的模型会直接出现在 DSH 模型选择器里。不共享账号、不自动签到、不绕过厂商限制。

## 安装

### 从 DSH 插件市场安装

插件收录后，打开 **插件 → 发现**，搜索 **dsh-hitchfin**，从卡片直接安装。宿主提示需要重启时重启 DSH。

### 从 GitHub 仓库直接安装（Web / CLI profile）

无需等待插件市场收录，直接从仓库拉取即可。安装时会自动构建插件，需要本机有 Node.js ≥ 20.18.1 和 git。

```sh
dsh plugin --profile web add github:LuckyOneTwoThree/dsh-hitchfin
```

如需固定版本，可以指定 tag 或提交，例如 `github:LuckyOneTwoThree/dsh-hitchfin#v0.5.2`。安装后按提示重启 DSH。

> 如果你的 npm 提示该包的安装脚本（`prepare`）需要批准，请按提示允许；该脚本只执行 `npm run build`。

### 从 npm 安装（Web / CLI profile）

```sh
dsh plugin --profile web add dsh-hitchfin
```

### 从本地构建安装

```sh
npm install
npm run build
npm pack
dsh plugin --profile web add ./dsh-hitchfin-0.5.2.tgz
```

> DSH Desktop 的 desktop profile 由 Electron 应用独占管理。请通过应用的 **插件** 页面或插件市场安装，不要手动修改 desktop profile。

环境要求见 [兼容性](#兼容性)。

## 快速开始

1. 打开 **设置 → 订阅接入**，选择一个渠道。
2. 选择登录方式。浏览器登录会自动打开系统默认浏览器；渠道支持时也可以使用 API Key / PAT。
3. 默认保持「只显示免费模型」。需要付费模型时再手动关闭。
4. 模型会出现在 DSH 模型选择器里。之后可随时添加第二账号，或用上移/下移调整优先级。

## 功能

- **官方渠道**：WorkBuddy CN、Qoder CN、Trae CN，使用官方应用图标与官方登录流程。
- **多账号**：指定主账号、调整故障转移顺序、单独停用账号而不删除凭据与设置。每张账号卡显示角色、最近使用时间、冷却倒计时，以及按账号的额度（已用 / 总量）。
- **自动故障转移**：同一会话、同一模型优先沿用上次成功的账号；鉴权、额度、限流、服务端或传输失败时，在输出任何内容之前切换到其他账号。
- **失败即冷却**：失败账号按错误类型进入冷却，不再继续请求厂商；全部账号冷却时，请求会明确返回重试时间。
- **账号级 HTTP(S) 代理**：代理只作用于该账号的登录、模型列表、额度与聊天请求，其他账号保持直连；代理凭据在界面中掩码，不写入日志。
- **免费模型过滤**：默认只显示免费模型。没有免费/付费元数据的渠道（目前是 Trae CN）显示全部模型，而不是全部隐藏。
- **模型可见性**：支持搜索模型、逐个隐藏、全选 / 全不选（可只作用于搜索结果）、一键隐藏全部付费模型；设置对整个渠道生效。
- **原生 DSH 界面**：接入概览状态条、频道 Tab、额度进度条、账号菜单、行内代理编辑、模型管理、Toast、暗色模式与窄屏适配；设置页按统一的设计系统排版，明暗主题均满足 WCAG AA 文本对比度。
- **浏览器登录直达**：点击浏览器登录后直接拉起系统默认浏览器；设置页里的「重新打开」只是兜底，不是必需的第二次点击。
- **本地优先**：凭据保存在本机 DSH credential store。插件不做遥测，也不会把账号数据发到渠道包指定厂商接口以外的地方。

## 截图

**多账号管理**：每个账号独立开关，用 ↑ ↓ 调整尝试顺序；主账号、备用、冷却与停用状态一眼可辨。

![多账号管理](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/accounts.png)

**暗色模式**：跟随 DSH 主题切换，暗色下额度条与状态色单独调过对比度。

![暗色模式](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-dark.png)

**模型可见性**：按渠道搜索模型、逐个隐藏、全选或全不选（有搜索词时只作用于匹配结果），或一键隐藏全部付费模型。

![模型可见性](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/model-visibility.png)

## 渠道

| 渠道 | 状态 | 登录方式 | 免费/付费标记 | 验证情况 |
| --- | --- | --- | --- | --- |
| WorkBuddy CN | 稳定 | 浏览器、API Key | 有 | 已验证真实模型目录与真实免费模型对话 |
| Qoder CN | 稳定 | 浏览器、PAT | 有 | 已验证登录链路；真实对话验证在路线图中 |
| Trae CN | 稳定 | 浏览器 | 无，显示全部模型 | 已验证登录链路；live 目录 90 个内部 ID，过滤 IDE 内部条目并按显示名去重后为 62 个显示模型 |

渠道能力来自持续维护的 OpenCode 兼容适配包。厂商模型目录、额度和免费层规则可能随时变化。

实时目录读取失败时，插件不会把渠道包内置的占位模型当真实目录发布：设置页提示「目录读取失败」并保留上次成功读取的目录，模型选择器也不会突然清空。可在「模型可见性 → 刷新模型」强制重新读取。Trae 的 `-auto` 路由别名与 `*_subagent` 等 IDE 内部条目会被过滤，不会出现在模型选择器里。

## 多账号路由

用哪个账号由你控制，而且看得见：

- **主账号与顺序**：列表中第一个启用账号是主账号。用上移/下移调整故障转移顺序，顺序会显式保存，不再依赖宿主返回凭据记录的顺序。
- **账号开关**：停用账号会保留凭据、代理与模型设置，只是不再参与路由，可随时重新启用。
- **状态可见**：每张账号卡显示主账号 / 备用 / 已停用、最近一次成功使用时间和冷却倒计时。额度只按账号展示——不同账号的额度不能相加，所以插件不提供渠道级的「总余额」。
- **会话粘滞**：路由键是 **供应商 + 模型 + 会话**。同一会话内成功的账号会继续保持优先，以保护 prompt cache 命中率；因此即使设了主账号，某个会话仍可能继续用备用账号。新会话从主账号和列表顺序开始。
- 首选账号在首个流式内容之前失败时，会按列表顺序尝试其余启用账号；一旦已经输出内容，不再中途换号，避免同一段回复出现两份文本。

| 失败类型 | 冷却时间 |
| --- | --- |
| `AUTH` | 10 分钟 |
| `QUOTA` | 15 分钟 |
| `RATE_LIMIT` | 60 秒 |
| `SERVER` | 60 秒 |
| `TRANSPORT` | 30 秒 |
| `TIMEOUT` | 60 秒 |
| `EMPTY_RESPONSE` | 30 秒 |
| `CHANNEL_ERROR` | 60 秒 |
| `PROXY` | 5 分钟 |
| 其它未列出的失败 | 60 秒 |
| `MODEL_NOT_FOUND` | 30 分钟，仅作用于该账号和该模型 |

`ABORTED`、`WORKER_STOPPED`、`INVALID_REQUEST`、`UNSUPPORTED_CONTENT` 不进入冷却：换账号不能解决，或恢复由宿主自己完成。

全部账号冷却时，请求会返回明确的重试时间，而不是继续请求厂商。厂商返回的 `Retry-After` 比默认值更长时，会延长任意失败类型的冷却。重新登录、修改代理、切换启用状态或删除账号，都会清理该账号的路由状态。

## 常见问题

**登录后模型选择器里没有模型。**
先确认该渠道至少有一个账号处于启用状态，再检查「模型可见性」是否把模型全部隐藏了。对提供免费/付费标记的渠道（WorkBuddy、Qoder），「只显示免费模型」也会过滤掉付费模型。

**设了主账号，某个会话却仍在用备用账号。**
这是会话粘滞：同一会话、同一模型会沿用上次成功的账号，以保护 prompt cache。新会话才会从主账号和列表顺序开始。

**额度显示「额度暂不可用」。**
额度是独立请求（5 秒超时）。厂商接口偶发失败时会显示这句，不影响对话和模型列表，稍后会自行恢复。

**设置页提示「目录读取失败」。**
渠道包的实时模型目录偶发失败时（网络、登录态、厂商侧抖动），插件会保留上次成功的模型列表并提示，不会退回内置的占位目录。点「模型可见性」里的「刷新模型」会重建渠道包实例并重新读取，绕开渠道包内部的短时负缓存；仍失败时请检查账号登录态与代理后重试。

**Trae CN 为什么没有免费/付费标记。**
渠道包不提供该元数据，所以「只显示免费模型」对 Trae 不生效，Trae 会显示全部模型。

## 隐私与边界

- 凭据通过 DSH credential service 保存。插件不会把 token 写进自己的配置，也不会暴露给设置页渲染层。
- 设置页只接收模型列表、额度摘要、掩码后的账号标签与代理地址。账号标签只保留首尾字符（如 `abcd…7890`、`s…t`）。
- 用 API Key 重复登录同一个 key 时，插件用 key 的 SHA-256 摘要判断是否已存在，不会产生两个无法区分的账号；摘要只用于比较，不写日志、不进设置页。
- 请求通过渠道包发往厂商官方接口。代理是可选的、按账号配置的，可随时清除。
- 这是个人账号桥接工具：不共享账号、不刷免费额度、不自动签到、不绕过付费墙或限流。
- 免费额度由厂商提供，可能随时变化或取消。请使用自己的账号并遵守各厂商条款。

### 渠道包是受信任代码

渠道能力来自 `@magpie-community/opencode-*-auth` 包。插件把它们加载到 DSH 的 worker 线程里执行——**worker 线程不是安全沙箱**，渠道包与插件同权限，可以访问环境变量和文件系统。只安装你信任的渠道包版本，并留意依赖升级。

渠道包默认从插件自己的依赖里解析（`node_modules/@magpie-community/...`）。插件不再默认读取 `~/.config/magpie/plugins`——那棵树用户可写、且在依赖图之外。确实需要时才在插件配置里打开 `allowMagpieFallback: true`，启动日志会记录实际加载路径。

插件按固定下标调用渠道包的登录方式（WorkBuddy 的 API Key 是下标 2）。升级渠道包后，若版本与插件声明的版本不一致，启动日志会给出警告；`npm run test:contract` 可以直接比对实际包的登录方式数组。

## 兼容性

| 项目 | 要求 |
| --- | --- |
| DSH | `>= 0.2.2-rc.1` |
| Node.js | `>= 20.18.1`（当前 DSH Desktop 自带运行时已满足） |
| Profile | DSH Web、DSH Desktop |
| 系统 | macOS、Windows、Linux；浏览器登录使用平台默认打开方式（`open`、`rundll32` 或 `xdg-open`） |
| 模型界面 | 模型选择器、模型 badge、渠道提供时的 reasoning effort 元数据 |

## 开发

```sh
npm install
npm run typecheck
npm run build
npm test
npm run test:contract   # 比对真实渠道包的登录方式数组
```

- `src/adapter/`：DSH `LlmAdapter`、模型目录合并与账号路由。
- `worker/`：渠道包宿主持久化、代理 dispatcher 与 OpenAI 兼容流桥接。
- `src/routes.ts`：本地设置 API，覆盖账号、登录、代理、模型可见性。
- `src/format.ts`：额度窗口的展示口径（计数、千分位、占比）。
- `src/client/`：DSH 原生设置页。
- `scripts/contract-probe.mjs`：加载三个真实渠道包，校验登录方式下标与版本。
- `tests/`：路由/冷却/故障转移、账号存储、代理隧道、SSE 映射与额度展示测试。
- `.github/workflows/ci.yml`：Node 20/22/24（Ubuntu）与 Node 22（macOS）的 typecheck、测试、契约探针与打包检查。

设计说明与验证记录见 [docs/development-plan.md](docs/development-plan.md)。发布前真实账号冒烟清单见 [docs/smoke-test.md](docs/smoke-test.md)。插件市场提交文案与发布检查清单见 [docs/marketplace-listing.md](docs/marketplace-listing.md)。

## 路线图

- Qoder CN、Trae CN 真实对话验证。
- 更细的按账号额度刷新诊断。
- 仅在官方登录方式和条款允许时增加新渠道。

Trae CN 的登录链路与 live 模型目录已实测；与 Qoder CN 一样，真实对话验证仍在路线图中。OpenCode Zen 不包含在此插件中。

## 关于

`dsh-hitchfin` 是面向 DeepSeek Harness 的独立社区插件，与 DeepSeek、腾讯、阿里巴巴、字节跳动及渠道适配包维护方没有隶属关系。WorkBuddy、Qoder、Trae 及相关图标是各自权利人的商标。

如果遇到渠道包或厂商侧问题，请附上 DSH 版本、渠道、登录方式和脱敏后的错误信息提交 issue。不要粘贴 access token、refresh token 或完整凭据。

## License

MIT，详见 [LICENSE](LICENSE)。
