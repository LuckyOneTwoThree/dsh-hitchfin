<p align="center">
  <img src="https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/assets/icon.png" width="92" alt="dsh-hitchfin" />
</p>

<h1 align="center">dsh-hitchfin</h1>

<p align="center">
  <strong>Use your existing WorkBuddy, Qoder and Trae subscriptions inside DeepSeek Harness.</strong>
</p>
<p align="center">
  Multi-account priority and failover · per-account HTTP(S) proxies · free-model filter · model visibility
</p>

<p align="center">
  <a href="README.md">简体中文</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#channels">Channels</a> ·
  <a href="#multi-account-routing">Routing</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/DSH-%E2%89%A50.2.2--rc.1-111827?style=flat-square" alt="DSH" />
  <img src="https://img.shields.io/badge/version-0.4.4-2F6B5F?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/tests-89%20passing-2F6B5F?style=flat-square" alt="tests" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
</p>

![dsh-hitchfin settings](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-light.png)

## Why dsh-hitchfin

DSH already has first-class API-key providers. `dsh-hitchfin` covers the other case: subscription plans you already pay for, accessed through their official account login flows.

It adds WorkBuddy CN, Qoder CN and Trae CN as native DSH model providers. Sign in with an official account, and the models you are entitled to appear in the DSH model picker. No account sharing, no automatic check-in, no attempt to bypass vendor limits.

## Installation

### From the DSH plugin market

Once listed, open **Plugins → Discover**, search for **dsh-hitchfin**, and install it from the card. Restart DSH if the host asks you to.

### From npm (web / CLI profiles)

```sh
dsh plugin --profile web add dsh-hitchfin
```

### From a local build

```sh
npm install
npm run build
npm pack
dsh plugin --profile web add ./dsh-hitchfin-0.4.4.tgz
```

> The DSH Desktop profile is managed by the Electron application. Install through the app's **Plugins** page or the plugin market rather than editing the desktop profile by hand.

Requirements are listed under [Compatibility](#compatibility).

## Quick start

1. Open **Settings → 订阅接入** and pick a channel.
2. Choose a sign-in method. Browser sign-in opens your default browser automatically; use API Key / PAT where the channel offers it.
3. Keep **Free models only** enabled unless you explicitly want paid models.
4. The channel's models appear in the DSH model picker. Add a second account or reorder the failover list at any time.

## Features

- **Official channels** — WorkBuddy CN, Qoder CN and Trae CN, with their official app icons and official login flows.
- **Multi-account** — set a primary account, reorder failover, or disable an account without deleting its credentials, proxy and settings. Each card shows its role, last use, cooldown countdown and that account's own usage (spent / limit).
- **Automatic failover** — requests stay on the last working account for a session and model; authentication, quota, rate-limit, server or transport failures move the request to another account before any content is emitted.
- **Cooldown after a failure** — a failed account cools down for a code-specific window instead of being retried against the vendor; when every account is cooling down, DSH gets a clear retry time.
- **Per-account HTTP(S) proxies** — a proxy is applied to that account's sign-in, model list, usage and chat requests. Other accounts stay direct. Proxy credentials are masked in the UI and are never written to logs.
- **Free-model filter** — free-only is on by default. Channels without free/paid metadata (currently Trae CN) are shown in full instead of hiding everything.
- **Model visibility** — search the catalog, hide individual models, or hide paid models in one action. Visibility settings apply to the whole channel.
- **Native DSH UX** — channel tabs, quota progress bars, account menus, account-level proxy editor, model manager, toasts, dark mode and a layout that holds up on narrow screens.
- **One-click browser sign-in** — clicking browser sign-in opens the system browser directly with the official authorization URL. The re-open link in the settings page is a fallback, not a required second click.
- **Local-first** — credentials live in DSH's credential store on this device. The plugin does not run telemetry or send account data anywhere except the vendor endpoints the channel package is designed to call.

## Screenshots

**Multi-account management** — a switch per account, ↑ ↓ to reorder the retry chain, and clear primary / backup / cooling / disabled states.

![Multi-account management](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/accounts.png)

**Dark mode** — follows the DSH theme, with progress bars and status colours tuned for dark surfaces.

![Dark mode](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/overview-dark.png)

**Model visibility** — search within a channel, hide models one by one, or hide every paid model at once.

![Model visibility](https://raw.githubusercontent.com/LuckyOneTwoThree/dsh-hitchfin/main/docs/images/model-visibility.png)

## Channels

| Channel | Status | Sign-in | Free/paid metadata | Verification |
| --- | --- | --- | --- | --- |
| WorkBuddy CN | Stable | Browser, API Key | Yes | Live model catalog and a real free-model chat request verified |
| Qoder CN | Stable | Browser, PAT | Yes | Login flow verified; live chat validation is on the roadmap |
| Trae CN | Experimental | Browser | No — all models are shown | Login flow verified; live catalog deduplicated from 90 internal IDs to 68 display models |

Channel support is powered by maintained OpenCode-compatible adapter packages. Vendor catalogs, quotas and free-tier rules can change at any time.

## Multi-account routing

You control which account is used, and the settings page makes it visible:

- **Primary and order** — the first enabled account is the primary one. Move accounts up or down to change failover order; the order is stored explicitly instead of depending on the host's credential record order.
- **Per-account switch** — disabling an account keeps its credentials, proxy and model settings, but removes it from routing. Re-enable it at any time.
- **Visible state** — each account shows primary / backup / disabled, its last successful use and any active cooldown countdown. Usage is per account only: two accounts' allowances cannot be added together, so there is no channel-wide total.
- **Session stickiness** — the route key is **provider + model + session**. A successful account stays preferred within that session to protect prompt-cache locality, so a session may keep using a backup account even when a primary is set. New sessions start from the primary and list order.
- If the preferred account fails before the first stream chunk, the adapter tries the remaining enabled accounts in list order. Once any chunk has been emitted, the request is not switched mid-stream — you never get duplicated text from two accounts.

| Failure | Cooldown |
| --- | --- |
| `AUTH` | 10 minutes |
| `QUOTA` | 15 minutes |
| `RATE_LIMIT` | 60 seconds |
| `SERVER` | 60 seconds |
| `TRANSPORT` | 30 seconds |
| `TIMEOUT` | 60 seconds |
| `MODEL_NOT_FOUND` | 30 minutes, scoped to that account and model |

When all accounts are cooling down, the request fails with a retry time instead of repeatedly hitting the vendors. A `Retry-After` value extends the cooldown for any failure type when it is longer than the default. Re-authenticating an account, changing its proxy, toggling it or removing it clears its routing state.

## FAQ

**No models show up in the picker after signing in.**
Check that the channel has at least one enabled account, then check whether model visibility is hiding everything. On channels with free/paid metadata (WorkBuddy, Qoder), *Free models only* also filters out paid models.

**A session keeps using a backup account even though a primary is set.**
That is session stickiness: a session and model stay on the last account that worked, to protect the prompt cache. Only new sessions start from the primary and list order.

**Usage says "unavailable".**
Usage is a separate request with a 5-second timeout. A transient vendor failure shows that line without affecting chat or the model list; it recovers on its own.

**Why does Trae CN have no free/paid metadata?**
The channel package does not provide it, so *Free models only* has no effect on Trae and its full catalog is shown.

## Privacy and scope

- Credentials are stored through DSH's credential service; the plugin does not write tokens into its own config or expose them to the settings renderer.
- The settings page only receives models, quota summaries, masked account labels and a masked proxy URL.
- Requests go to the official vendor endpoints through the channel package. An optional proxy is per account and can be cleared at any time.
- This is a personal-account bridge. It does not share accounts, farm free tiers, automate check-in, bypass paywalls or evade rate limits.
- Free tiers are provided by the vendors and may change or disappear at any time. Use your own accounts and follow each vendor's terms.

## Compatibility

| Item | Requirement |
| --- | --- |
| DSH | `>= 0.2.2-rc.1` |
| Node.js | `>= 20.18.1` (the host runtime in current DSH desktop builds already satisfies this) |
| Profiles | DSH Web and DSH Desktop |
| OS | macOS, Windows, Linux; browser sign-in uses the platform's default-browser opener (`open`, `rundll32` or `xdg-open`) |
| DSH model UI | Model picker, per-model badges, reasoning effort metadata when provided by the channel |

## Development

```sh
npm install
npm run typecheck
npm run build
npm test
```

- `src/adapter/` — DSH `LlmAdapter`, model catalog merge and account routing.
- `worker/` — channel package host, proxy dispatcher and OpenAI-compatible stream bridge.
- `src/routes.ts` — local settings API: accounts, login, proxy, visibility.
- `src/format.ts` — how usage windows are presented (counts, grouping, shares).
- `src/client/` — native DSH settings section.
- `tests/` — adapter routing/cooldown/failover, account storage, proxy tunnel, SSE mapping and quota presentation tests.

See [docs/development-plan.md](docs/development-plan.md) for the design notes and verification history. Marketplace submission copy and the release checklist live in [docs/marketplace-listing.md](docs/marketplace-listing.md).

## Roadmap

- Qoder CN and Trae CN live chat verification.
- More granular per-account quota refresh diagnostics.
- Additional channels only when their official login and terms permit this kind of bridge.

Trae CN is intentionally marked experimental. OpenCode Zen is not part of this plugin.

## About

`dsh-hitchfin` is an independent community plugin for DeepSeek Harness. It is not affiliated with DeepSeek, Tencent, Alibaba, ByteDance or the maintainers of the channel adapter packages. WorkBuddy, Qoder, Trae and their logos are trademarks of their respective owners.

If you find a channel-package or vendor-side issue, please open an issue with the DSH version, channel, sign-in method and a redacted error message. Never paste access tokens, refresh tokens or full credential payloads.

## License

MIT. See [LICENSE](LICENSE).
