import React, { useEffect, useState } from 'react'

export const name = 'dsh-hitchfin'

export const inject = ['slots', 'locale']

interface Method {
  id: string
  label: string
  kind: string
  index: number
  placeholder?: string
}

interface Account {
  accountId: string
  label: string
  freeOnly: boolean
  hiddenModels: string[]
}

interface Model {
  id: string
  name: string
  free: boolean
  freeKnown?: boolean
}

interface QuotaWindow {
  name: string
  used?: number
  display?: string
  resetsAt?: string
  free?: boolean
}

interface Quota {
  plan?: string
  windows?: QuotaWindow[]
  signIn?: string
}

interface Channel {
  id: string
  providerId: string
  displayName: string
  status: 'stable' | 'experimental'
  packageAvailable: boolean
  methods: Method[]
  accounts: Account[]
  models: Model[]
  allModels: Model[]
  quota: Quota | null
  modelCount: number
  freeStatusKnown: boolean
  freeOnly: boolean
}

interface Login {
  id: string
  channelId: string
  status: 'pending' | 'code' | 'ok' | 'error' | 'cancelled'
  method: 'auto' | 'code'
  url?: string
  instructions?: string
  error?: string
  account?: Account
}

const CSS = `
.hf-wrap { max-width: 780px; padding: 8px 0 40px; color: var(--dsh-text, #1c1c1e); }
.hf-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 4px 0 18px; }
.hf-title { margin: 0; font-size: 20px; line-height: 1.25; font-weight: 650; letter-spacing: -0.01em; }
.hf-sub { margin: 5px 0 0; font-size: 13px; line-height: 1.5; color: #6e6e73; }
.hf-list { display: flex; flex-direction: column; gap: 10px; }
.hf-card { border: 1px solid rgba(60,60,67,.14); border-radius: 14px; background: var(--dsh-surface, #fff); padding: 14px 15px; }
.hf-row { display: flex; align-items: center; gap: 12px; }
.hf-icon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 15px; font-weight: 700; color: #fff; flex: 0 0 auto; }
.hf-icon.wb { background: #2d6cdf; }
.hf-icon.qd { background: #5b4bd6; }
.hf-icon.tr { background: #1d7a63; }
.hf-name { font-size: 15px; line-height: 1.3; font-weight: 600; }
.hf-meta { margin-top: 3px; font-size: 12px; line-height: 1.45; color: #6e6e73; }
.hf-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 999px; font-size: 11px; font-weight: 550; letter-spacing: .01em; }
.hf-chip.stable { background: rgba(47,107,95,.1); color: #2f6b5f; }
.hf-chip.experimental { background: rgba(255,149,0,.12); color: #9a5b00; }
.hf-chip.free { background: rgba(47,107,95,.1); color: #2f6b5f; }
.hf-count { margin-left: auto; font-size: 12px; color: #6e6e73; white-space: nowrap; }
.hf-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.hf-btn { appearance: none; border: 1px solid rgba(60,60,67,.18); background: transparent; color: inherit; border-radius: 9px; padding: 7px 12px; font-size: 13px; line-height: 1.2; cursor: pointer; font: inherit; }
.hf-btn:hover { background: rgba(120,120,128,.08); }
.hf-btn.primary { background: #1c1c1e; border-color: #1c1c1e; color: #fff; }
.hf-btn.primary:hover { background: #333; }
.hf-btn.danger { color: #b3261e; border-color: rgba(179,38,30,.3); }
.hf-btn:disabled { opacity: .5; cursor: default; }
.hf-toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #3a3a3c; cursor: pointer; user-select: none; }
.hf-switch { width: 34px; height: 20px; border-radius: 999px; background: rgba(120,120,128,.32); position: relative; transition: background .15s ease; flex: 0 0 auto; }
.hf-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.18); transition: transform .15s ease; }
.hf-switch.on { background: #2f6b5f; }
.hf-switch.on::after { transform: translateX(14px); }
.hf-login { margin-top: 12px; border: 1px solid rgba(60,60,67,.12); background: rgba(120,120,128,.06); border-radius: 11px; padding: 12px; }
.hf-login-line { font-size: 12.5px; line-height: 1.5; color: #3a3a3c; }
.hf-login-url { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.hf-input { flex: 1 1 220px; min-width: 160px; border: 1px solid rgba(60,60,67,.2); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; background: var(--dsh-surface, #fff); color: inherit; }
.hf-models { margin-top: 12px; }
.hf-models summary { cursor: pointer; font-size: 12.5px; color: #6e6e73; }
.hf-model-scroll { max-height: 220px; overflow: auto; margin-top: 8px; border: 1px solid rgba(60,60,67,.12); border-radius: 9px; }
.hf-model-row { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-bottom: 1px solid rgba(60,60,67,.08); font-size: 12px; color: #3a3a3c; cursor: pointer; }
.hf-model-row:last-child { border-bottom: 0; }
.hf-model-row input { accent-color: #2f6b5f; }
.hf-model-name { flex: 1; }
.hf-model-hidden { opacity: .55; }
.hf-chip.muted { background: rgba(120,120,128,.1); color: #6e6e73; }
.hf-quota { margin-top: 8px; font-size: 12px; line-height: 1.5; color: #6e6e73; }
.hf-empty { border: 1px dashed rgba(60,60,67,.22); border-radius: 14px; padding: 28px 16px; text-align: center; color: #6e6e73; font-size: 13px; }
.hf-error { margin: 0 0 12px; border: 1px solid rgba(179,38,30,.25); background: rgba(179,38,30,.06); color: #8a1c15; border-radius: 10px; padding: 9px 11px; font-size: 12.5px; line-height: 1.45; }
.hf-note { margin: 16px 0 0; font-size: 11.5px; line-height: 1.5; color: #8e8e93; }
.hf-spin { display: inline-block; width: 12px; height: 12px; border: 1.5px solid rgba(120,120,128,.3); border-top-color: #2f6b5f; border-radius: 50%; animation: hf-spin .7s linear infinite; vertical-align: -2px; margin-right: 5px; }
@keyframes hf-spin { to { transform: rotate(360deg); } }
@media (prefers-color-scheme: dark) {
  .hf-wrap { color: #f5f5f7; }
  .hf-sub, .hf-meta, .hf-count, .hf-models summary, .hf-empty { color: #a1a1a6; }
  .hf-card { background: #1c1c1e; border-color: rgba(255,255,255,.1); }
  .hf-btn { border-color: rgba(255,255,255,.16); }
  .hf-btn:hover { background: rgba(255,255,255,.06); }
  .hf-btn.primary { background: #f5f5f7; border-color: #f5f5f7; color: #1c1c1e; }
  .hf-btn.primary:hover { background: #e5e5ea; }
  .hf-btn.danger { color: #ff8a80; border-color: rgba(255,138,128,.3); }
  .hf-toggle { color: #d1d1d6; }
  .hf-login { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.1); }
  .hf-login-line { color: #d1d1d6; }
  .hf-input { background: #2c2c2e; border-color: rgba(255,255,255,.16); }
  .hf-model-scroll { border-color: rgba(255,255,255,.12); }
  .hf-model-row { border-color: rgba(255,255,255,.08); color: #d1d1d6; }
  .hf-chip.muted { background: rgba(255,255,255,.08); color: #a1a1a6; }
  .hf-quota { color: #a1a1a6; }
  .hf-empty { border-color: rgba(255,255,255,.16); }
  .hf-error { background: rgba(255,138,128,.08); color: #ffb4ab; border-color: rgba(255,138,128,.25); }
  .hf-note { color: #8e8e93; }
}
`

function isZh(): boolean {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : ''
  return (lang || navigator.language || '').toLowerCase().startsWith('zh')
}

function T(zh: string, en: string): string {
  return isZh() ? zh : en
}

function formatReset(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(isZh() ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function quotaLine(quota: Quota): string {
  const windows = quota.windows ?? []
  const total = windows.find((window) => /total/i.test(window.name)) ?? windows[0]
  const reset = total?.resetsAt
    ? `${T('重置', 'resets')} ${formatReset(total.resetsAt)}`
    : ''
  return [quota.plan ?? '', total?.display ?? '', reset].filter(Boolean).join(' · ')
}

function loginPrompt(channel: Channel, login: Login): string {
  if (login.status === 'code') {
    return T('请输入浏览器里显示的授权码。', 'Enter the authorization code shown in the browser.')
  }
  if (channel.id === 'workbuddy-cn') {
    return T('在浏览器中登录 WorkBuddy，完成后这里会自动更新。', 'Sign in to WorkBuddy in the browser; this page updates automatically.')
  }
  if (channel.id === 'trae-cn') {
    return T('在浏览器中登录 Trae CN 并允许授权，完成后这里会自动更新。', 'Sign in to Trae CN and allow access; this page updates automatically.')
  }
  if (channel.id === 'qoder-cn') {
    return T('在浏览器中完成 Qoder 登录，完成后这里会自动更新。', 'Complete the Qoder sign-in in the browser; this page updates automatically.')
  }
  return T('正在等待浏览器完成登录…', 'Waiting for the browser sign-in…')
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || body.ok === false) {
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
  }
  return body as T
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <span className="hf-toggle" role="switch" aria-checked={on} tabIndex={0}
      onClick={onChange}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onChange()
      }}>
      <span className={`hf-switch${on ? ' on' : ''}`} />
      <span>{label}</span>
    </span>
  )
}

export function HitchfinSettings() {
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [login, setLogin] = useState<Login | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [patFor, setPatFor] = useState<{
    channelId: string
    methodIndex: number
    kind: 'pat' | 'api-key'
  } | null>(null)
  const [pat, setPat] = useState('')

  const refresh = async (withQuota = true) => {
    try {
      const body = await json<{ channels: Channel[] }>(
        `/dsh-hitchfin/state${withQuota ? '' : '?quota=0'}`,
      )
      setChannels((previous) =>
        body.channels.map((channel) => {
          if (withQuota) return channel
          const old = previous?.find((entry) => entry.id === channel.id)
          return old?.quota ? { ...channel, quota: old.quota } : channel
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    // Render channels and models immediately; quota needs a network round trip.
    void refresh(false)
    const timer = setTimeout(() => {
      void refresh(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!login || (login.status !== 'pending' && login.status !== 'code')) return
    let stopped = false
    const timer = setInterval(async () => {
      try {
        const body = await json<{ login: Login }>(`/dsh-hitchfin/login/status?id=${encodeURIComponent(login.id)}`)
        if (stopped) return
        setLogin(body.login)
        if (body.login.status === 'ok') {
          setCode('')
          void refresh(false)
          setTimeout(() => {
            void refresh(true)
          }, 300)
        }
        if (body.login.status === 'error') {
          setError(body.login.error ?? T('登录失败', 'Sign-in failed'))
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : String(err))
      }
    }, 1500)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [login?.id, login?.status])

  const start = async (
    channel: Channel,
    methodIndex: number,
    inputs?: Record<string, string>,
  ) => {
    setError('')
    setBusy(`start:${channel.id}`)
    try {
      const body = await json<{ login: Login }>('/dsh-hitchfin/login/start', {
        method: 'POST',
        body: JSON.stringify({ channelId: channel.id, method: methodIndex, inputs }),
      })
      setLogin(body.login)
      // Do not open the URL here: the DSH web window may navigate away from the
      // settings page when a popup is blocked. The login panel offers an
      // explicit "Open sign-in page" link instead.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const submitSecret = async (
    channel: Channel,
    selected: { methodIndex: number; kind: 'pat' | 'api-key' },
    value: string,
  ) => {
    if (selected.kind === 'pat') {
      await start(channel, selected.methodIndex, { pat: value })
      return
    }
    setError('')
    setBusy(`secret:${channel.id}`)
    try {
      await json('/dsh-hitchfin/login/apikey', {
        method: 'POST',
        body: JSON.stringify({
          channelId: channel.id,
          method: selected.methodIndex,
          key: value,
        }),
      })
      await refresh(false)
      setTimeout(() => {
        void refresh(true)
      }, 300)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const submitCode = async () => {
    if (!login || !code.trim()) return
    setError('')
    setBusy('code')
    try {
      const body = await json<{ login: Login }>('/dsh-hitchfin/login/code', {
        method: 'POST',
        body: JSON.stringify({ id: login.id, code: code.trim() }),
      })
      setLogin(body.login)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const cancel = async () => {
    if (!login) return
    setBusy('cancel')
    try {
      const body = await json<{ login: Login }>('/dsh-hitchfin/login/cancel', {
        method: 'POST',
        body: JSON.stringify({ id: login.id }),
      })
      setLogin(body.login)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const toggleFreeOnly = async (channel: Channel, account: Account) => {
    setError('')
    setBusy(`free:${channel.id}`)
    try {
      await json('/dsh-hitchfin/free-only', {
        method: 'POST',
        body: JSON.stringify({
          channelId: channel.id,
          accountId: account.accountId,
          freeOnly: !account.freeOnly,
        }),
      })
      await refresh(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const toggleModel = async (channel: Channel, account: Account, model: Model) => {
    const hidden = new Set(account.hiddenModels ?? [])
    if (hidden.has(model.id)) hidden.delete(model.id)
    else hidden.add(model.id)
    setError('')
    setBusy(`model:${channel.id}`)
    try {
      await json('/dsh-hitchfin/models/hidden', {
        method: 'POST',
        body: JSON.stringify({
          channelId: channel.id,
          accountId: account.accountId,
          hiddenModels: [...hidden],
        }),
      })
      await refresh(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const remove = async (channel: Channel, account: Account) => {
    if (!window.confirm(T(`删除 ${channel.displayName} 的账号？`, `Remove the ${channel.displayName} account?`))) {
      return
    }
    setBusy(`delete:${channel.id}`)
    try {
      await json('/dsh-hitchfin/delete', {
        method: 'POST',
        body: JSON.stringify({ channelId: channel.id, accountId: account.accountId }),
      })
      await refresh(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const iconClass = (id: string) =>
    id.startsWith('workbuddy') ? 'wb' : id.startsWith('qoder') ? 'qd' : 'tr'
  const letter = (id: string) =>
    id.startsWith('workbuddy') ? 'W' : id.startsWith('qoder') ? 'Q' : 'T'

  if (!channels) {
    return (
      <div className="hf-wrap">
        <style>{CSS}</style>
        {error ? <p className="hf-error">{error}</p> : null}
        <p className="hf-sub"><span className="hf-spin" />{T('正在读取订阅状态…', 'Loading subscriptions…')}</p>
      </div>
    )
  }

  return (
    <div className="hf-wrap">
      <style>{CSS}</style>
      <div className="hf-head">
        <div>
          <h2 className="hf-title">{T('订阅接入', 'Subscription bridge')}</h2>
          <p className="hf-sub">
            {T(
              '把已经在用的免费订阅模型接进 DSH。默认只显示免费模型，不自动消耗积分。',
              'Bring your free subscription models into DSH. Free models only by default; no automatic credit spend.',
            )}
          </p>
        </div>
      </div>

      {error ? <p className="hf-error">{error}</p> : null}

      <div className="hf-list">
        {channels.map((channel) => {
          const account = channel.accounts[0]
          const pending = login && login.channelId === channel.id &&
            (login.status === 'pending' || login.status === 'code')
          return (
            <section className="hf-card" key={channel.id}>
              <div className="hf-row">
                <div className={`hf-icon ${iconClass(channel.id)}`}>{letter(channel.id)}</div>
                <div>
                  <div className="hf-name">{channel.displayName}</div>
                  <div className="hf-meta">
                    {!channel.packageAvailable
                      ? T('渠道包未安装', 'Channel package not installed')
                      : account
                        ? T(`${account.label} · 已连接`, `${account.label} · Connected`)
                        : T('未登录 · 免费层可用', 'Not signed in · free tier available')}
                    {channel.status === 'experimental'
                      ? ` · ${T('实验性渠道', 'Experimental')}`
                      : ''}
                  </div>
                </div>
                <div className={`hf-chip ${channel.status}`}>{channel.status === 'stable' ? T('稳定', 'Stable') : T('实验', 'Experimental')}</div>
                <div className="hf-count">{T(`${channel.modelCount} 个模型`, `${channel.modelCount} models`)}</div>
              </div>

              {account ? (
                <div className="hf-actions">
                  {channel.freeStatusKnown ? (
                    <Toggle
                      on={channel.freeOnly}
                      label={T('仅免费模型', 'Free models only')}
                      onChange={() => void toggleFreeOnly(channel, account)}
                    />
                  ) : (
                    <span className="hf-meta">
                      {T(
                        '该渠道不提供免费/付费标记，显示全部模型',
                        'No free/paid metadata; showing all models',
                      )}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {channel.packageAvailable
                    ? channel.methods.map((method) => (
                        <button
                          key={method.id}
                          className="hf-btn"
                          disabled={busy !== ''}
                          onClick={() => {
                            if (method.kind === 'pat' || method.kind === 'api-key') {
                              setPatFor({
                                channelId: channel.id,
                                methodIndex: method.index,
                                kind: method.kind,
                              })
                              setPat('')
                              return
                            }
                            void start(channel, method.index)
                          }}
                        >
                          {method.label}
                        </button>
                      ))
                    : null}
                  <button className="hf-btn danger" disabled={busy !== ''} onClick={() => void remove(channel, account)}>
                    {T('删除', 'Remove')}
                  </button>
                </div>
              ) : (
                <div className="hf-actions">
                  {channel.packageAvailable ? channel.methods.map((method, index) => (
                    <button
                      key={method.id}
                      className={`hf-btn${index === 0 ? ' primary' : ''}`}
                      disabled={busy !== ''}
                      onClick={() => {
                        if (method.kind === 'pat' || method.kind === 'api-key') {
                          setPatFor({
                            channelId: channel.id,
                            methodIndex: method.index,
                            kind: method.kind,
                          })
                          setPat('')
                          return
                        }
                        void start(channel, method.index)
                      }}
                    >
                      {busy === `start:${channel.id}` ? <span className="hf-spin" /> : null}
                      {method.label}
                    </button>
                  )) : (
                    <span className="hf-meta">
                      {T('安装对应的渠道包后即可登录。', 'Install the channel package to sign in.')}
                    </span>
                  )}
                </div>
              )}

              {patFor?.channelId === channel.id ? (
                <div className="hf-login">
                  <div className="hf-login-line">
                    {patFor.kind === 'api-key'
                      ? T('输入 WorkBuddy API Key。', 'Enter your WorkBuddy API key.')
                      : T('输入 Qoder PAT（以 pt- 开头）。', 'Enter your Qoder PAT (starts with pt-).')}
                  </div>
                  <div className="hf-login-url">
                    <input
                      className="hf-input"
                      type="password"
                      value={pat}
                      placeholder={
                        patFor.kind === 'api-key'
                          ? 'sk-...'
                          : channel.methods.find((method) => method.kind === 'pat')?.placeholder ?? 'pt-...'
                      }
                      onChange={(event) => setPat(event.target.value)}
                    />
                    <button
                      className="hf-btn primary"
                      disabled={busy !== '' || !pat.trim()}
                      onClick={() => {
                        const selected = patFor
                        setPatFor(null)
                        setCode('')
                        if (selected) {
                          void submitSecret(
                            channel,
                            { methodIndex: selected.methodIndex, kind: selected.kind },
                            pat.trim(),
                          )
                        }
                      }}
                    >
                      {T('登录', 'Sign in')}
                    </button>
                    <button
                      className="hf-btn"
                      onClick={() => {
                        setPatFor(null)
                        setPat('')
                      }}
                    >
                      {T('取消', 'Cancel')}
                    </button>
                  </div>
                  <p className="hf-note" style={{ marginTop: 8 }}>
                    {patFor.kind === 'api-key'
                      ? T(
                          '在 WorkBuddy 的 API Key 页面创建。',
                          "Create one on WorkBuddy's API key page.",
                        )
                      : T(
                          '在 qoder.cn/account/integrations 创建 PAT。',
                          'Create a PAT at qoder.cn/account/integrations.',
                        )}
                  </p>
                </div>
              ) : null}

              {pending && login ? (
                <div className="hf-login">
                  <div className="hf-login-line">
                    <span className="hf-spin" />
                    {loginPrompt(channel, login)}
                  </div>
                  {login.url ? (
                    <div className="hf-login-url">
                      <a className="hf-btn" href={login.url} target="_blank" rel="noreferrer">
                        {T('打开登录页面', 'Open sign-in page')}
                      </a>
                      <button className="hf-btn" disabled={busy !== ''} onClick={() => void cancel()}>
                        {T('取消', 'Cancel')}
                      </button>
                    </div>
                  ) : null}
                  {login.status === 'code' ? (
                    <div className="hf-login-url">
                      <input
                        className="hf-input"
                        value={code}
                        placeholder={T('粘贴授权码', 'Paste the code')}
                        onChange={(event) => setCode(event.target.value)}
                      />
                      <button className="hf-btn primary" disabled={busy !== '' || !code.trim()} onClick={() => void submitCode()}>
                        {T('提交', 'Submit')}
                      </button>
                    </div>
                  ) : null}
                  {!login.url && login.status !== 'code' ? (
                    <div className="hf-login-url">
                      <button className="hf-btn" disabled={busy !== ''} onClick={() => void cancel()}>
                        {T('取消', 'Cancel')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {login && login.channelId === channel.id && login.status === 'error' ? (
                <p className="hf-error" style={{ marginTop: 12, marginBottom: 0 }}>{login.error}</p>
              ) : null}

              {account && channel.quota ? (
                <div className="hf-quota">{quotaLine(channel.quota)}</div>
              ) : null}

              {channel.allModels.length > 0 ? (
                <details className="hf-models">
                  <summary>{T(`模型（${channel.allModels.length}）`, `Models (${channel.allModels.length})`)}</summary>
                  <div className="hf-model-scroll">
                    {channel.allModels.map((model) => {
                      const hidden = (account?.hiddenModels ?? []).includes(model.id)
                      return (
                        <label className={`hf-model-row${hidden ? ' hf-model-hidden' : ''}`} key={model.id}>
                          <input
                            type="checkbox"
                            checked={!hidden}
                            disabled={!account || busy !== ''}
                            onChange={() => {
                              if (account) void toggleModel(channel, account, model)
                            }}
                          />
                          <span className="hf-model-name">{model.name}</span>
                          {model.free ? <span className="hf-chip free">{T('免费', 'Free')}</span> : null}
                          {model.freeKnown && !model.free ? (
                            <span className="hf-chip muted">{T('付费', 'Paid')}</span>
                          ) : null}
                        </label>
                      )
                    })}
                  </div>
                  <p className="hf-note" style={{ marginTop: 8 }}>
                    {T(
                      '取消勾选后，该模型不会出现在 DSH 模型选择器里；仅免费模型开启时只显示免费模型。',
                      'Unchecked models are hidden from the DSH model picker; free-only shows only free models.',
                    )}
                  </p>
                </details>
              ) : null}
            </section>
          )
        })}
      </div>

      {channels.every((channel) => channel.accounts.length === 0) ? (
        <div className="hf-empty" style={{ marginTop: 10 }}>
          {T('先在一个渠道登录，模型就会出现在 DSH 的模型选择器里。', 'Sign in to a channel and its models appear in the DSH model picker.')}
        </div>
      ) : null}

      <p className="hf-note">
        {T(
          '免费层由各厂商提供，额度和可用性可能随时变化。仅限个人账号使用；不共享账号、不自动签到。',
          'Free tiers are provided by each vendor and may change at any time. Personal accounts only; no account sharing or automatic check-in.',
        )}
      </p>
    </div>
  )
}

interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): void
  slots: {
    inject(name: string, fn: () => () => void): void
    register(options: Record<string, unknown>, component: React.ComponentType): () => void
  }
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'hitchfin',
        order: 80,
        label: () => T('订阅接入', 'Subscription bridge'),
      },
      HitchfinSettings,
    ),
  )
}
