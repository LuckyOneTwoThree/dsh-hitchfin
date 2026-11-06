# Phase 0 契约验证报告

> 日期：2026-11-06  
> 宿主：DeepSeek Harness `0.2.2-rc.1`（桌面版运行时，临时 `DSH_HOME` 启动 web profile）  
> 结论：**GO**。DSH 原生 `LlmAdapter` 可以注册并流式输出；pi-ai 自定义 `fetch` 可用；WorkBuddy / Trae / Qoder 渠道包可在 Node 24 下加载并暴露所需 hooks。

---

## 1. 验证环境

- DSH web profile：`DSH_HOME=/tmp/dsh-spike-home`，`--profile web --no-open --port 54321`
- Spike 插件：`/tmp/dsh-spike-plugin`（fake `LlmAdapter`）
- 安装方式：`dsh plugin --profile web add /tmp/dsh-spike-plugin`，并在 `profiles/web/cordis.patch.yml` 插入：
  ```yaml
  - insert:
      - id: dsh-hitchfin-spike
        name: 'dsh-hitchfin-spike'
  ```
- 浏览器：Qoder Browser Connector 打开 `http://127.0.0.1:54321/?token=…`

---

## 2. 已验证

### 2.1 插件加载

- profile patch 的 `insert` 条目可加载普通 npm 包/本地目录。
- 包不需要 `dsh.bundle` 也能作为 profile 层被插入；`dsh plugin add` 会提示 “declares no dsh.bundle — installed as a plain dependency”，但 profile patch 的 `insert` 仍然有效。

### 2.2 LlmAdapter 必需方法

第一次启动报错：

```
TypeError: adapter.providerRetryPolicy is not a function
```

补上 `providerRetryPolicy()` 并返回 `undefined` 后继续。

发送消息时报错：

```
registration.adapter.prepareCall is not a function
```

补上：

```js
async prepareCall(provider, model, signal) {
  const info = await this.resolveModel(provider, model, signal)
  return { model: info, stream: (options) => this.stream(options) }
}
```

结论：**`providerRetryPolicy`、`prepareCall`、`stream` 都是运行时必需**；`providerInfo`、`listModels`、`resolveModel` 也必须实现。

### 2.3 reasoning 元数据

第一次 `resolveModel` 返回：

```js
reasoning: { efforts: [] }
```

模型选择器显示：

```
Hitchfin Spike 加载失败：adapter returned invalid reasoning metadata for provider "hitchfin-spike" model "spike-model"
```

改成**不返回 `reasoning` 字段**后正常。结论：没有推理档位时省略 `reasoning`，不要传空数组。

### 2.4 模型选择器与流式输出

- 模型选择器出现：provider `Hitchfin Spike` → model `Spike Model`。
- 选择后发送消息，DSH 正确渲染：
  - `hello from hitchfin spike`
  - usage：`5 tok`
  - 会话标题自动生成
  - 1 秒完成
- 这说明 `listModels` / `resolveModel` / `prepareCall` / `stream` / `usage` / `finish` 的最小闭环成立。

### 2.5 pi-ai 自定义 fetch

用 `@earendil-works/pi-ai@1.3.0` 的 `compat.stream` + fake HTTP SSE server 验证：

```
custom fetch called: http://127.0.0.1:60110/v1/chat/completions
event types: start,text_start,text_delta,text_end,done
result stopReason: stop
usage: input=1 output=4 totalTokens=5
```

注意：`compat.stream` 需要传 `apiKey`，否则在调用 fetch 之前就报：

```
No API key for provider: fake
```

结论：**自定义 fetch 可用**；适配器需要为每个请求提供 `apiKey`（渠道包的实际 `apiKey` 或占位值）。

### 2.6 渠道包在 Node 24 下加载

测试 `/tmp/channel-test/test-channels.mjs`，以最小 OpenCode client shim 调用渠道工厂。

| 渠道 | 导出 | hooks | auth.loader | fetch | usage | chat.headers |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| WorkBuddy CN | `WorkBuddyAuthPlugin` | config, chat.headers, provider, auth | ✅ | ✅（loader 内） | ✅ | ✅ |
| WorkBuddy AI | `WorkBuddyAIAuthPlugin` | 同上 | ✅ | ✅ | ✅ | ✅ |
| Trae CN | `TraeCNAuthPlugin` | 同上 | ✅ | ✅ | ✅ | ✅ |
| Trae Global | `TraeGlobalAuthPlugin` | 同上 | ✅ | ✅ | ✅ | ✅ |
| Qoder | `QoderAuthPlugin` | 同上 | ✅ | ✅ | ✅ | ✅ |
| Qoder CN | `QoderCNAuthPlugin` | 同上 | ✅ | ✅ | ✅ | ✅ |
| QwenWork | `QwenWorkAuthPlugin` | 同上 | ✅ | ✅ | ✅ | ✅ |
| QwenWork Enterprise | `QwenWorkEnterpriseAuthPlugin` | 同上 | ✅ | ✅ | ✅ | ✅ |

验证结果：

- 所有包在 Node 24 下 import 成功，无 Bun 专有 API 依赖。
- `auth.methods` 结构可用（oauth / api）。
- `auth.loader(getAuth)` 在无账号时返回 `{}`。
- `chat.headers` 能按 sessionID 输出会话头（如 `x-magpie-workbuddy-session`）。
- `provider.models` 在无认证时返回 0 个模型，符合预期。

结论：**渠道包可直接复用**；需要补的是宿主 shim、账号选择、凭据写回和 DSH 流式转换。

---

## 3. 尚未验证（进入 Phase 1/2）

- `ctx.credentials` 的 GrantRecord 写入/读取与锁行为。
- `ctx.authorization` 的浏览器登录流在 DSH UI 中的实际表现。
- `settings.section` 与 `conversation.input.model.label` 的真实渲染。
- DSH 原生 OAuth（Codex/Copilot/Claude/Kimi）在 Settings → Models 的实际入口。
- 真实 WorkBuddy/Qoder/Trae 账号的完整请求、工具调用、推理、额度。
- `llm/models-updated` 动态刷新行为。

---

## 4. Go / No-Go

**GO。**

理由：

1. DSH 原生 adapter 注册与流式链路已跑通。
2. pi-ai 自定义 fetch 已跑通。
3. 三个目标渠道包在 Node 24 下可用，且 hooks 齐全。
4. 需要的 DSH 接缝（credentials / authorization / settings / slots）在类型与打包代码中存在，进入 Phase 1 继续验证。

---

## 5. 对开发计划的修正

- `LlmAdapter` 必须实现 `providerRetryPolicy` 与 `prepareCall`，不能只实现 `stream`。
- 没有推理档位时省略 `reasoning` 字段。
- pi-ai `compat.stream` 必须传 `apiKey`。
- `dsh plugin add` 只安装依赖；要作为 profile 层生效，需要在 `cordis.patch.yml` 里 `insert` 或给包加 `dsh.bundle.patch`。
- OpenCode Zen free 仍不进核心；其 Bun/OpenCode 伪装限制未变。
