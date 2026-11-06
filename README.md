# dsh-hitchfin

DeepSeek Harness (DSH) 官方订阅账号接入插件。

## 🎯 定位与核心原则

- **聚焦官方订阅套餐**：专为 ChatGPT (Plus / Team / Pro / Codex)、GitHub Copilot、Trae (字节跳动)、WorkBuddy (腾讯混元)、ZCode (智谱 GLM) 等官方订阅账号提供接入、会话与路由池管理。
- **不做 API Key 接入**：DeepSeek Harness 本身已原生具备完备的通用 API Key 配置能力，本插件专注于官方订阅账号接入与复用。
- **自主可控**：支持完全手动的官方账号添加、状态监控与展示模型按需选择。
- **纯净轻量**：独立原生运行，界面简洁直观。

---

## 🚧 开发状态

Phase 0–3 的核心骨架已完成：

- Phase 0 报告：[docs/phase-0-spike-report.md](docs/phase-0-spike-report.md)
- 完整开发计划：[docs/development-plan.md](docs/development-plan.md)
- Host：DSH `LlmAdapter` + channel worker + 真实 WorkBuddy/Qoder/Trae 渠道包加载。
- Client：`settings.section` 订阅设置页，支持登录、取消、重新登录、账号删除。
- 配置能力：仅免费模型、模型可见性勾选、套餐/额度窗口展示。
- WorkBuddy 实测：Free plan；17 个 live 模型，其中 2 个免费；`hy4-free` 真实请求返回 200 SSE；adapter 端到端拿到 reasoning + 文本 + usage + finish。
- WorkBuddy 支持浏览器 / 桌面 / API Key 三种登录方式。
- 渠道包随插件以固定版本 optionalDependencies 安装（WorkBuddy / Qoder / Trae），不再依赖 magpie 安装目录。
- Qoder CN 浏览器登录与 PAT 输入链路已验证；Trae CN 浏览器登录启动已验证，取消会释放本地回调端口。
- Trae CN live 目录的 90 个内部 ID 已按显示名去重为 68 个模型；`-Official`、`_advisor_`、`Doubao_1_6` 等别名合并，空名称过滤。
- Trae CN 不提供免费/付费标记，因此显示全部模型并禁用“仅免费模型”过滤；WorkBuddy/Qoder 仍按免费标记过滤。
- 设置页首屏快速渲染，额度异步补齐；模型可见性、仅免费模型、套餐/额度均已接入。
- 已确认 DSH 模型目录包含 `hitchfin-workbuddy-cn`、`hitchfin-qoder-cn`、`hitchfin-trae-cn`。

```sh
npm install
npm run build
npm test
```

仍待验证/补齐：Qoder CN / Trae CN 真实登录与请求、多账号/代理/路由，以及安装到主 DSH desktop profile。

## 安装（开发版）

```sh
npm install
npm run build
npm pack
```

Web profile 可以直接用 DSH CLI 安装：

```sh
dsh plugin --profile web add /path/to/dsh-hitchfin-<version>.tgz
```

桌面版需要注意：**desktop profile 由 Electron 应用独占，`dsh plugin --profile desktop` 会被拒绝**。请在 DSH 桌面版的插件页安装本仓库 / 本地 tarball，或由维护者按以下方式安装：

```sh
cd ~/.dsh/profiles/desktop
pnpm add /path/to/dsh-hitchfin-<version>.tgz
# 并把 "dsh-hitchfin" 加入 package.json 的 dsh.profile.bundles
```

插件会：

- 安装 WorkBuddy / Qoder / Trae 三个 optional 渠道包
- 在设置里增加「订阅接入」页面
- 不修改 magpie 已有路由，也不改默认模型

已验证：

- 干净 web profile：三个渠道均显示可用，登录前模型目录为空，不会出现开发用 spike provider。
- macOS DSH Desktop `0.2.2-rc.1` 主 desktop profile：设置页出现「订阅接入」，magpie 的 `llm-pi-ai` 路由和默认模型保持不变。
- 安装前备份位于 `~/.dsh/backups/dsh-hitchfin-<timestamp>`。
- 主 profile 不会继承临时测试 profile 的 WorkBuddy 登录，需要重新登录一次。

---

*项目正在重构中，当前为可安装的 Phase 4 开发版。*
