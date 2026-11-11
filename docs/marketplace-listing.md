# 收录进 DSH 插件市场

本文是把 `dsh-hitchfin` 提交进 DeepSeek Harness 插件市场的操作手册。所有规则均按 2026-11-10 的
`dshmarket` 客户端与 `awesome-dsh-plugin` 策展仓库现状核对过，**不是推测**。

## 一、谁决定收录

| 角色 | 是什么 | 你是否要碰 |
| --- | --- | --- |
| `dshmarket`（市场 App，本机 1.73.17） | 只是**客户端**，负责浏览、安装、更新、评论 | 不要往它的仓库提条目 |
| [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | **策展仓库**，唯一的数据源；站点 `awesome-dsh-plugin.com` 与市场都读它生成的 `plugins.json` | ✅ 在这里开 PR |
| npm / GitHub Release | 安装介质，可选 | 视安装体验决定 |

关键约束：市场的安装**只接受策展清单里出现过的源**，清单外的仓库直接在客户端被拒。所以"先能被装、
再被收录"的顺序不成立——必须先被收录，普通用户才能在 Discover 里装到。

## 二、硬条件自检

| 条件 | 现状 |
| --- | --- |
| `package.json` 声明 `dsh.bundle`（只声明 `dsh.client` 会被拒） | ✅ `dsh.bundle.patch: ./cordis.patch.yml` |
| 仓库根有 `cordis.patch.yml` | ✅ 只 `insert` 自己，不动默认模型 |
| 含真实可跑代码（非占位/非纯 README） | ✅ TypeScript，`lib/` `client/` 安装时构建 |
| 仓库创建满 1 天 | ✅ 2026-11-05，已 5 天 |
| 仓库带 `dsh-plugin` topic | ✅ 已带（连同 `deepseek-harness`、`dsh`、`cordis` 等 11 个） |
| 活跃维护 | ✅ 持续发版至 0.5.2 |
| 仓库未被归档 | ✅ |

全部满足，可以直接提。

## 三、条目文件

PR 只加**一个文件**，路径 `data/plugins/<owner>__<repo>.yml`：

`data/plugins/LuckyOneTwoThree__dsh-hitchfin.yml`

```yaml
url: https://github.com/LuckyOneTwoThree/dsh-hitchfin
name: LuckyOneTwoThree/dsh-hitchfin
category: model
description:
  en: 'Bring WorkBuddy, Qoder and Trae subscription models into DeepSeek Harness with multi-account failover, per-account HTTP(S) proxies and model visibility controls.'
  zh: '将 WorkBuddy、Qoder、Trae 的订阅模型接入 DSH，支持多账号故障转移、账号级 HTTP(S) 代理与模型可见性管理。'
icon: https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/assets/icon.png
```

写法要点，错一个就是 CI 红：

- **不要手工改 `README.md` / `README.zh.md`**。两份 README 由 `data/plugins/*.yml` 生成，合并后自动重建，手改会冲突。
- **不要加 `npm:` 键**。npm 映射由 CI 按仓库 URL 和包内 `repository` 字段自动采集，手写会被校验拒绝。
- **描述里出现 `: `（冒号+空格）必须整体加引号**，否则 YAML 解析失败。上面两条已加。
- `description.en` 必填、必须以句号结尾；`zh` 可选（缺失由维护者补，不是打回理由）。
- 描述只讲功能，不许营销词、最高级；描述里的数字与 API 名会被拿去和源码对。
- `category` 取值：`agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun`。选错不会被打回，维护者会自己改。
- `icon` 必须是 **GitHub 托管的位图**（png/jpg/webp），约 96px 显示，方形最佳；**SVG 会被拒**。本仓库声明的是 `assets/icon.png`（512×512 PNG），`icon.svg` 只是给包用的，不要写进条目。

## 四、截图

不再往策展仓库的 `data/screenshots.json` 加新键（那是旧条目的回退路径，只在有终点的场景保留）。
截图声明在**自己仓库根**的 `screenshots.json`，与本文件同级：

```json
[
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-light.png",
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/accounts.png",
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/model-visibility.png",
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-dark.png"
]
```

规则：1–8 张；可写相对路径（不能以 `/` 开头、不能含 `..`）或绝对 URL，绝对 URL 必须是 GitHub 托管
（`raw.githubusercontent.com`、`user-images.githubusercontent.com`、`camo.githubusercontent.com`、GitHub 附件），
第三方图床会被拒。不声明也行，市场会从 README 自动抽取；声明的作用是**控制顺序与选取**。

图片必须在开 PR 前就推到 `main`，否则 raw URL 404，站点构建会挂。截图内是构造的演示数据，无真实账号、
token、邮箱与真实额度。

## 五、安装介质（可选，但影响体验）

**npm 发布不影响收录**，不发布也能从 GitHub 源码装。已发布包的好处是市场能按下载量排序；
发布后 `repository.url` 必须指回本仓库，否则不会关联。本仓库 `package.json` 已带正确 `repository`。

坑：从 GitHub 源码装要在安装期跑构建（本仓库 `lib/` `client/` 被 gitignore，靠 `prepack` 生成），
pnpm 默认拦截构建脚本，用户会看到"允许构建脚本并重试"。要消除这一下点击，就给一个预构建 tarball：

1. 打 GitHub Release，资产名**不带版本号**，例如 `dsh-hitchfin.tgz`；
2. 条目里加一行：

```yaml
tarball: https://github.com/LuckyOneTwoThree/dsh-hitchfin/releases/latest/download/dsh-hitchfin.tgz
```

`latest/download/` 只在请求时解析 `latest`，文件名按字面取——资产名带版本号的话，下次发版即 404。
要么名字不带版本（如上），要么钉死 tag：

```yaml
tarball: https://github.com/LuckyOneTwoThree/dsh-hitchfin/releases/download/v0.5.2/dsh-hitchfin.tgz
```

`tarball` 只有"仓库无法从源码安装"时才是必需项，我们是可选项。

## 六、提 PR 的流程

1. 确认本仓库 `main` 已包含要收录的版本（当前 0.5.2，tag `v0.5.2`）。
2. Fork `awesome-dsh-plugin/awesome-dsh-plugin`。
3. 加 `data/plugins/LuckyOneTwoThree__dsh-hitchfin.yml`，内容见第三节。若要加 tarball 行，也写进这个文件。
4. 开 PR，标题写清插件名，正文说明它做什么、装法、以及"个人订阅账号自用、无自动签到/免限流/账号共享"。
5. 等 CI 与人工评审。

PR 阶段注意：

- **一个 PR 最多 3 条条目**，超出会被 CI 直接拒并要求拆分。
- **只改自己那一条**。动别人的描述会被 gate 逐条点名。
- CI 顺序：条目数量 → `dsh.bundle` 探测 → 仓库年龄 → `awesome-lint` 与站点构建（含双语一致性、截图可达）。
- 失败会在 PR 里说明要改什么，**同一分支继续推**即可，不用重开 PR。
- 被标 `held: author` 是"需修改"不是"拒绝"，PR 在合并队列里暂停；推修复后留一条评论说明，标签只有重评审才摘。
- gate 显示 `—` 通常不是你的问题：几乎总是分支与 `main` 冲突（生成型 README 造成），推提交解决不了，由维护者 rebase。
- `READMEs match data/plugins` 变红多为分支 README 快照落后，同样不归你修；归你修的是 `awesome-lint` 与陈旧 fork 守卫。

## 七、评审会看什么

CI 绿只是前置条件，维护者会真的打开仓库读。八条：代码与条目声明是否一致（含描述里的数字）、分类是否合理、
是否真实可用代码、是否与已有条目重复（撞车时"不是先来后到，是谁更好"）、源码有无可疑（混淆/凭据外传/异常
安装期行为）、PR 有无动无关条目、是否只是纯聚合包（只收插件不收 meta-package）、聚合包依赖是否指回原作者。

收录不等于安全审查，只是常识性检查。也要注意条目**不是永久**的：仓库消失、归档、长期停更或行为异常会被移除，
所以发版节奏本身也是收录的维持成本。

## 八、收录之后

1. 在 DSH 里打开 **Plugins → Discover**，搜 `hitchfin` 确认卡片出现，并核对它显示的 DSH 版本要求是 `>= 0.2.2-rc.1`。
2. 干净环境装一次（换 profile 或新机器），确认没残留。
3. 重启 DSH，进 **Settings → 订阅接入**，确认三个渠道 Tab、账号开关、额度与模型可见性都正常。
4. 卡片里的 Comments 是 giscus 挂的 GitHub Discussions，唯一会话线程，站点与本市场共用。

## 九、后续维护

改描述、调分类、加截图、下架，都是**同一个文件的小 PR**，同样只碰自己那一条，不要顺手格式化别人的条目。
版本号变更不需要改条目（条目里不写版本），市场按 npm 或提交比对自行提示更新。
