# DSH Plugin Market listing kit

This file is the copy-and-paste source for publishing `dsh-hitchfin`. It follows the
current awesome-dsh-plugin registry format: one YAML file per plugin, plus optional
screenshots declared against the plugin repository URL.

## Storefront card

| Field | Value |
| --- | --- |
| Name | `dsh-hitchfin` |
| Category | `model` |
| Version | `0.3.1` |
| License | MIT |
| DSH | `>= 0.2.2-rc.1` |
| Repository | https://github.com/LuckyOneTwoThree/dsh-hitchfin |
| Icon | https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/assets/icon.png |

### Description

**English**

> Bring WorkBuddy, Qoder and Trae subscription models into DeepSeek Harness with multi-account failover, per-account HTTP(S) proxies and model visibility controls.

**中文**

> 将 WorkBuddy、Qoder、Trae 的订阅模型接入 DSH，支持多账号故障转移、账号级 HTTP(S) 代理与模型可见性管理。

Avoid superlatives and claims that are not in the code: the plugin does not farm
free tiers, auto check-in, share accounts, or bypass vendor limits.

## Registry entry

Create `data/plugins/LuckyOneTwoThree__dsh-hitchfin.yml` in the
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) repo:

```yaml
url: https://github.com/LuckyOneTwoThree/dsh-hitchfin
name: LuckyOneTwoThree/dsh-hitchfin
category: model
description:
  en: Bring WorkBuddy, Qoder and Trae subscription models into DeepSeek Harness with multi-account failover, per-account HTTP(S) proxies and model visibility controls.
  zh: 将 WorkBuddy、Qoder、Trae 的订阅模型接入 DSH，支持多账号故障转移、账号级 HTTP(S) 代理与模型可见性管理。
icon: https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/assets/icon.png
```

Notes:

- Do **not** add an `npm:` key. The catalog resolves the npm package from the
  repository URL and the package's `repository` field.
- The npm package name is `dsh-hitchfin` and is unpublished at the time this kit
  was written; publish it before submitting so the market can use the fast npm
  install path.
- If the plugin is not published to npm, create a GitHub Release asset with a
  version-free name (for example `dsh-hitchfin.tgz`) and add:
  `tarball: https://github.com/LuckyOneTwoThree/dsh-hitchfin/releases/latest/download/dsh-hitchfin.tgz`
- The catalog requires `description.en` and recommends `description.zh`. The
  description must be factual and end with a period.

## Screenshots

`../screenshots.json` in this repository contains the public raw GitHub URLs.
When submitting, also add this entry to `data/screenshots.json` in the catalog
repository (keyed by the exact repository URL):

```json
"https://github.com/LuckyOneTwoThree/dsh-hitchfin": [
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-light.png",
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/model-visibility.png",
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-dark.png",
  "https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/mobile.png"
]
```

Images must be committed to `main` before the PR is opened, otherwise the raw URLs
will 404. The screenshots are sanitized demo data: no real account labels, tokens,
email addresses or live quota figures.

## GitHub About

Use this for the repository About description (GitHub limit 350 characters):

> WorkBuddy, Qoder & Trae subscriptions for DeepSeek Harness — multi-account failover, per-account HTTP(S) proxies, free-model filter and model visibility. · 将 WorkBuddy / Qoder / Trae 订阅模型接入 DSH。

Suggested topics:

```text
deepseek-harness
dsh
dsh-plugin
cordis
workbuddy
qoder
trae
llm
subscription
multi-account
proxy
```

Suggested website: the repository README (or leave the website field empty until
there is a dedicated landing page).

## Release checklist

1. Bump `version` in `package.json` and update the README badge.
2. Run:
   ```sh
   npm install
   npm run typecheck
   npm run build
   npm test
   ```
3. Build the package and inspect the file list:
   ```sh
   npm pack --dry-run
   ```
   It must contain `lib/`, `worker/`, `client/`, `assets/icon.svg`,
   `assets/icon.png`, `cordis.patch.yml`, locale files, README files and LICENSE.
4. Publish to npm:
   ```sh
   npm publish --access public
   ```
   Verify:
   ```sh
   npm view dsh-hitchfin version repository.url
   ```
   The npm `repository.url` must point back to this GitHub repository; the
   catalog uses it to resolve the npm mapping.
5. Push the README, screenshots, icon and `screenshots.json` to `main`.
6. Create a GitHub Release for `v0.3.1` (optional if npm is the install path;
   recommended for source-free installs and a stable changelog).
7. Open a PR to `awesome-dsh-plugin/awesome-dsh-plugin` with the YAML entry and
   the screenshots entry. Wait for the catalog CI to validate the repo,
   `dsh.bundle.patch`, screenshot URLs and package metadata.
8. Once the market lists the plugin, verify a clean install in **Plugins →
   Discover**, then restart DSH and open **Settings → 订阅接入**.

## Pre-submission audit

- [ ] `package.json` has `dsh.bundle.patch`, `engines.dsh`, `icon`, `repository`,
      `homepage`, `bugs`, `license` and a factual description.
- [ ] `files` includes `assets`, `README.md`, `README.zh.md`, `lib`, `worker`,
      `client`, `cordis.patch.yml` and `locale`.
- [ ] All screenshots are sanitized and return HTTP 200 from `raw.githubusercontent.com`.
- [ ] README clearly states personal-account-only usage and no automatic check-in.
- [ ] Qoder/Trae live-request status is described accurately; Trae is marked
      experimental.
- [ ] `npm test` and `npm run build` pass on the published commit.
- [ ] No tokens, proxy credentials, account identifiers or real quota values are
      present in the repository, README, screenshots or commit messages.
- [ ] `cordis.patch.yml` only inserts the plugin; it does not change the default
      model or other providers.
