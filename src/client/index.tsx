import React, { useEffect, useRef, useState } from 'react'
import { QODER_LOGO, TRAE_LOGO, WORKBUDDY_LOGO } from './logos.js'
import {
  bulkHiddenTokens,
  isModelHidden,
  normalizedModelName,
  unhideModelTokens,
} from '../models.js'
import { quotaPercent, quotaValue, type QuotaWindowLike } from '../format.js'
import { CSS } from './styles.js'

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
  modelCount?: number
  quota?: Quota | null
  proxy?: string
  proxyConfigured?: boolean
  error?: string
  enabled?: boolean
  priority?: number | null
  isPrimary?: boolean
  lastUsedAt?: number
  cooldownUntil?: number
  cooldownCode?: string
}

interface Model {
  id: string
  name: string
  free: boolean
  freeKnown?: boolean
  aliases?: readonly string[]
}

interface QuotaWindow extends QuotaWindowLike {
  name: string
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
  /** Version the installed channel package declares, when readable. */
  packageVersion?: string | null
  /** Version this plugin's sign-in indexes were written against. */
  packageExpectedVersion?: string
  packageVersionMismatch?: boolean
  packageSource?: 'installed' | 'override' | 'magpie-fallback'
  methods: Method[]
  accounts: Account[]
  models: Model[]
  allModels: Model[]
  hiddenModels: string[]
  quota?: Quota | null
  modelCount: number
  /** Set when the live catalog read failed; the list shown may be stale. */
  modelsError?: string
  freeStatusKnown: boolean
  /** The channel normally publishes free/paid metadata; unknown means hidden under free-only. */
  freeMetadataExpected?: boolean
  freeOnly: boolean
}

interface Login {
  id: string
  channelId: string
  accountId: string
  status: 'pending' | 'code' | 'ok' | 'error' | 'cancelled'
  method: 'auto' | 'code'
  url?: string
  instructions?: string
  autoOpened?: boolean
  error?: string
  account?: Account
}

type Compose =
  | { kind: 'methods'; channelId: string; accountId: string }
  | {
      kind: 'secret'
      channelId: string
      accountId: string
      methodIndex: number
      secretKind: 'pat' | 'api-key'
      placeholder?: string
    }

interface Toast {
  tone: 'success' | 'error'
  message: string
}

interface QuotaRow {
  key: string
  label: string
  value: string
  percent?: number
  reset?: string
  free?: boolean
}



function isZh(): boolean {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : ''
  return (lang || navigator.language || '').toLowerCase().startsWith('zh')
}

function T(zh: string, en: string): string {
  return isZh() ? zh : en
}

function detectDark(): boolean {
  if (typeof document === 'undefined') return false
  const root = document.documentElement
  const theme = root.getAttribute('data-theme')
  if (theme === 'dark') return true
  if (theme === 'light') return false
  if (root.classList.contains('dark')) return true
  if (root.classList.contains('light')) return false
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function formatReset(value?: string, now?: number): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (now !== undefined) {
    const dayStart = (input: Date) =>
      new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
    const days = Math.round((dayStart(date) - dayStart(new Date(now))) / 86_400_000)
    if (days === 0) return T('今天', 'today')
    if (days === 1) return T('明天', 'tomorrow')
    if (days === 2) return T('后天', 'in two days')
  }
  return date.toLocaleDateString(isZh() ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function channelTone(id: string): 'wb' | 'qd' | 'tr' {
  return id.startsWith('workbuddy') ? 'wb' : id.startsWith('qoder') ? 'qd' : 'tr'
}

function shortName(name: string): string {
  return name.replace(/\s+CN$/i, '')
}

function methodHint(method: Method): string {
  if (method.kind === 'pat') return T('使用个人访问令牌', 'Use a personal access token')
  if (method.kind === 'api-key') return T('粘贴官方 API Key', 'Paste an official API key')
  return T('在浏览器中完成授权', 'Authorize in your browser')
}

function methodLabel(method: Method): string {
  if (method.kind === 'api-key') return 'API Key'
  if (method.kind === 'pat') return 'PAT'
  return T('浏览器登录', 'Browser')
}

/** Only real http(s) links may reach an anchor; a channel package's output is not a URL policy. */
function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

function loginPrompt(channel: Channel, login: Login): string {
  if (login.status === 'code') {
    return T('在浏览器完成授权后，粘贴页面显示的授权码。', 'After authorizing in the browser, paste the code shown on that page.')
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

function quotaRows(quota: Quota | null | undefined, now: number): QuotaRow[] {
  if (!quota) return []
  const windows = quota.windows ?? []
  const rows: QuotaRow[] = []
  windows.slice(0, 2).forEach((window, index) => {
    const value = quotaValue(window)
    if (!value) return
    const percent = quotaPercent(window)
    rows.push({
      key: `${window.name || 'quota'}-${index}`,
      label: window.name || T('额度', 'Usage'),
      value,
      ...(percent !== undefined ? { percent: Math.round(percent) } : {}),
      ...(window.resetsAt ? { reset: formatReset(window.resetsAt, now) } : {}),
      ...(window.free ? { free: true } : {}),
    })
  })
  return rows
}

function visibleModels(channel: Channel): Model[] {
  const hidden = new Set(channel.hiddenModels ?? [])
  // A channel that normally reports prices keeps free-only honest even when a
  // listing just failed; a channel with no such metadata (Trae) shows all.
  const freeFilter =
    channel.freeOnly && (channel.freeStatusKnown || channel.freeMetadataExpected === true)
  return (channel.allModels ?? []).filter(
    (model) => !isModelHidden(model, hidden) && (!freeFilter || model.free),
  )
}

function withPrimary(accounts: Account[]): Account[] {
  const primaryIndex = accounts.findIndex((account) => account.enabled !== false)
  return accounts.map((account, index) => ({ ...account, isPrimary: index === primaryIndex }))
}

function timeAgo(ts: number | undefined, now: number): string {
  if (!ts) return ''
  const seconds = Math.max(0, Math.floor((now - ts) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function cooldownLeft(until: number | undefined, now: number): string {
  if (!until || until <= now) return ''
  const seconds = Math.ceil((until - now) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET'
  const needsJsonType = init?.body !== undefined || (method !== 'GET' && method !== 'HEAD')
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(needsJsonType ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || body.ok === false) {
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
  }
  return body as T
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconMore() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function IconAlert() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16.2v.1" />
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2-2a4 4 0 0 0-5.7-5.7l-1.1 1.1" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2 2a4 4 0 0 0 5.7 5.7l1.1-1.1" />
    </svg>
  )
}

/** Small line icons for the at-a-glance status strip. */
function OverviewIcon({ kind }: { kind: 'channels' | 'accounts' | 'models' }) {
  const shared = {
    width: 17,
    height: 17,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (kind === 'channels') {
    return (
      <svg {...shared}>
        <rect x="3" y="4" width="7" height="7" rx="1.6" />
        <rect x="14" y="4" width="7" height="7" rx="1.6" />
        <rect x="3" y="14" width="7" height="6" rx="1.6" />
        <rect x="14" y="14" width="7" height="6" rx="1.6" />
      </svg>
    )
  }
  if (kind === 'accounts') {
    return (
      <svg {...shared}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c.4-3.2 2.5-5 5.5-5s5.1 1.8 5.5 5" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 14.4c2 .6 3.1 2.2 3.3 4.6" />
      </svg>
    )
  }
  return (
    <svg {...shared}>
      <path d="M12 3.5 4.5 7.6v8.8L12 20.5l7.5-4.1V7.6L12 3.5Z" />
      <path d="m4.5 7.6 7.5 4.2 7.5-4.2M12 11.8v8.7" />
    </svg>
  )
}

function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`hf-switch${on ? ' on' : ''}`}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="hf-switch-knob" />
    </button>
  )
}

function ChannelLogo({ id, size }: { id: string; size: 'tab' | 'header' | 'empty' }) {
  const tone = channelTone(id)
  const svg = tone === 'wb' ? WORKBUDDY_LOGO : tone === 'qd' ? QODER_LOGO : TRAE_LOGO
  return (
    <span className={`hf-logo ${tone} ${size}`} aria-hidden="true">
      <span className="hf-logo-art" dangerouslySetInnerHTML={{ __html: svg }} />
    </span>
  )
}

function PageHeader() {
  return (
    <div className="hf-head">
      <div>
        <h2 className="hf-title">{T('订阅接入', 'Subscription bridge')}</h2>
        <p className="hf-subtitle">
          {T(
            '把 WorkBuddy、Qoder、Trae 的订阅模型接入 DSH。多账号自动故障转移，代理与模型可见性均可配置。',
            'Bring WorkBuddy, Qoder and Trae subscription models into DSH. Multi-account failover with proxies and model visibility.',
          )}
        </p>
      </div>
      <span className="hf-privacy">
        <IconLock />
        {T('仅保存在本机', 'Local only')}
      </span>
    </div>
  )
}

function Alert({
  message,
  onClose,
  onRetry,
}: {
  message: string
  onClose: () => void
  onRetry?: () => void
}) {
  return (
    <div className="hf-alert" role="alert">
      <IconAlert />
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="hf-btn small" onClick={onRetry}>
          {T('重试', 'Retry')}
        </button>
      ) : null}
      <button type="button" className="hf-icon-btn" aria-label={T('关闭', 'Dismiss')} onClick={onClose}>
        <IconX />
      </button>
    </div>
  )
}

export function HitchfinSettings() {
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [login, setLogin] = useState<Login | null>(null)
  const [compose, setCompose] = useState<Compose | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [secretError, setSecretError] = useState('')
  const [proxyFor, setProxyFor] = useState('')
  const [proxyDraft, setProxyDraft] = useState('')
  const [proxyError, setProxyError] = useState('')
  const [menuFor, setMenuFor] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [modelBusy, setModelBusy] = useState(false)
  const [quotaReady, setQuotaReady] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [toast, setToast] = useState<Toast | null>(null)
  const [dark, setDark] = useState(detectDark)
  const toastTimer = useRef<number | null>(null)
  // The newest /state response wins, and every deferred refresh is cancelled
  // on unmount. A slow quota=0 response used to overwrite a newer snapshot
  // (or an optimistic toggle), while stray timers kept setting state.
  const requestSeq = useRef(0)
  const timers = useRef<Set<number>>(new Set())

  const schedule = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
    return id
  }

  const showToast = (tone: Toast['tone'], message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setToast({ tone, message })
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }

  const reveal = (selector: string) => {
    schedule(() => {
      document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      for (const id of timers.current) window.clearTimeout(id)
      timers.current.clear()
    }
  }, [])

  // Only tick while an account is cooling down, and stop on its own.
  useEffect(() => {
    const hasCooldown = channels?.some((channel) =>
      channel.accounts.some((account) => (account.cooldownUntil ?? 0) > Date.now()),
    )
    if (!hasCooldown) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      const stillActive = channels?.some((channel) =>
        channel.accounts.some((account) => (account.cooldownUntil ?? 0) > current),
      )
      if (!stillActive) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [channels])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(detectDark())
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    media.addEventListener('change', update)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', update)
    }
  }, [])

  const refresh = async (withQuota = true) => {
    const seq = (requestSeq.current += 1)
    try {
      const body = await json<{ channels: Channel[] }>(
        `/dsh-hitchfin/state${withQuota ? '' : '?quota=0'}`,
      )
      if (seq !== requestSeq.current) return
      setError('')
      setChannels((previous) =>
        body.channels.map((channel) => {
          if (withQuota) return channel
          const old = previous?.find((entry) => entry.id === channel.id)
          if (!old) return channel
          return {
            ...channel,
            accounts: channel.accounts.map((account) => {
              const previousAccount = old.accounts.find(
                (entry) => entry.accountId === account.accountId,
              )
              return previousAccount?.quota
                ? { ...account, quota: previousAccount.quota }
                : account
            }),
          }
        }),
      )
    } catch (err) {
      if (seq !== requestSeq.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (seq === requestSeq.current && withQuota) setQuotaReady(true)
    }
  }

  useEffect(() => {
    void refresh(false)
    const timer = schedule(() => {
      void refresh(true)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!channels?.length) return
    if (!selectedId || !channels.some((channel) => channel.id === selectedId)) {
      const preferred = channels.find((channel) => channel.accounts.length > 0) ?? channels[0]
      setSelectedId(preferred.id)
    }
  }, [channels, selectedId])

  useEffect(() => {
    if (!login || (login.status !== 'pending' && login.status !== 'code')) return
    let stopped = false
    const timer = window.setInterval(async () => {
      try {
        const body = await json<{ login: Login }>(
          `/dsh-hitchfin/login/status?id=${encodeURIComponent(login.id)}`,
        )
        if (stopped) return
        setLogin(body.login)
        if (body.login.status === 'ok') {
          setError('')
          setCode('')
          setCompose(null)
          setSecretValue('')
          setSecretError('')
          showToast('success', T('账号已连接', 'Account connected'))
          void refresh(false)
          schedule(() => {
            if (!stopped) void refresh(true)
          }, 350)
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : String(err))
      }
    }, 1500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [login?.id, login?.status])

  useEffect(() => {
    if (!menuFor) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-hf-menu]')) return
      setMenuFor('')
      setConfirmDelete(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuFor('')
      setConfirmDelete(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuFor])

  const channel =
    channels?.find((entry) => entry.id === selectedId) ??
    channels?.find((entry) => entry.accounts.length > 0) ??
    channels?.[0]
  const tone = channel ? channelTone(channel.id) : 'wb'
  const accounts = channel?.accounts ?? []
  const visibleList = channel ? visibleModels(channel) : []
  const visibleTotal = visibleList.length
  const hiddenSet = new Set(channel?.hiddenModels ?? [])
  const hiddenCount = channel
    ? channel.allModels.filter((model) => isModelHidden(model, hiddenSet)).length
    : 0
  // At-a-glance state across every channel, not just the selected tab.
  const overview = channels
    ? {
        connected: channels.filter((entry) => entry.accounts.length > 0).length,
        total: channels.length,
        accounts: channels.reduce((sum, entry) => sum + entry.accounts.length, 0),
        models: channels.reduce(
          (sum, entry) =>
            sum +
            (entry.allModels.length > 0
              ? visibleModels(entry).length
              : Math.max(0, entry.modelCount)),
          0,
        ),
      }
    : null
  const channelLogin = login && channel && login.channelId === channel.id ? login : null
  const loginUrl = safeExternalUrl(channelLogin?.url)
  const loginPending = Boolean(
    channelLogin && (channelLogin.status === 'pending' || channelLogin.status === 'code'),
  )
  const loginError = channelLogin?.status === 'error'
  const composeHere = compose && channel && compose.channelId === channel.id ? compose : null
  const composeAccount =
    composeHere && channel
      ? channel.accounts.find((account) => account.accountId === composeHere.accountId)
      : undefined
  const query = modelQuery.trim().toLowerCase()
  const shownModels = channel
    ? channel.allModels.filter(
        (model) =>
          !query ||
          model.name.toLowerCase().includes(query) ||
          model.id.toLowerCase().includes(query),
      )
    : []
  const paidModels = channel
    ? channel.allModels.filter((model) => model.freeKnown === true && !model.free)
    : []

  const selectChannel = (id: string) => {
    if (id === selectedId) return
    setSelectedId(id)
    setCompose(null)
    setSecretValue('')
    setSecretError('')
    setProxyFor('')
    setProxyDraft('')
    setProxyError('')
    setMenuFor('')
    setConfirmDelete(false)
    setModelsOpen(false)
    setModelQuery('')
    setError('')
    reveal('.hf-tabs')
  }

  const openMethods = (target: Channel, accountId: string) => {
    if (busy !== '' || loginPending) return
    setError('')
    if (login && login.channelId === target.id && login.status === 'error') setLogin(null)
    setSecretValue('')
    setSecretError('')
    setMenuFor('')
    setConfirmDelete(false)
    setProxyFor('')
    setProxyDraft('')
    setProxyError('')
    setModelsOpen(false)
    setModelQuery('')
    if (target.methods.length === 1) {
      void startMethod(target, target.methods[0], accountId)
      return
    }
    setCompose({ kind: 'methods', channelId: target.id, accountId })
  }

  const startMethod = (target: Channel, method: Method, accountId: string) => {
    setCompose(null)
    setSecretValue('')
    setSecretError('')
    if (method.kind === 'pat' || method.kind === 'api-key') {
      setCompose({
        kind: 'secret',
        channelId: target.id,
        accountId,
        methodIndex: method.index,
        secretKind: method.kind,
        placeholder: method.placeholder,
      })
      return
    }
    void startLogin(target, method.index, accountId)
  }

  const startLogin = async (
    target: Channel,
    methodIndex: number,
    accountId: string,
    inputs?: Record<string, string>,
  ) => {
    setError('')
    setBusy(`start:${target.id}`)
    try {
      const body = await json<{ login: Login }>('/dsh-hitchfin/login/start', {
        method: 'POST',
        body: JSON.stringify({
          channelId: target.id,
          method: methodIndex,
          accountId,
          ...(inputs ? { inputs } : {}),
        }),
      })
      setLogin(body.login)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const submitSecret = async (target: Channel) => {
    if (!composeHere || composeHere.kind !== 'secret') return
    const value = secretValue.trim()
    if (!value) {
      setSecretError(T('请输入密钥后再连接。', 'Enter a key before connecting.'))
      return
    }
    setSecretError('')
    setError('')
    setBusy(`secret:${target.id}`)
    try {
      if (composeHere.secretKind === 'pat') {
        const body = await json<{ login: Login }>('/dsh-hitchfin/login/start', {
          method: 'POST',
          body: JSON.stringify({
            channelId: target.id,
            method: composeHere.methodIndex,
            accountId: composeHere.accountId,
            inputs: { pat: value },
          }),
        })
        setCompose(null)
        setSecretValue('')
        setLogin(body.login)
      } else {
        await json('/dsh-hitchfin/login/apikey', {
          method: 'POST',
          body: JSON.stringify({
            channelId: target.id,
            accountId: composeHere.accountId,
            method: composeHere.methodIndex,
            key: value,
          }),
        })
        setCompose(null)
        setSecretValue('')
        showToast('success', T('账号已连接', 'Account connected'))
        await refresh(false)
        schedule(() => {
          void refresh(true)
        }, 350)
      }
    } catch (err) {
      setSecretError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const submitCode = async () => {
    if (!channelLogin || !code.trim()) return
    setError('')
    setBusy('code')
    try {
      const body = await json<{ login: Login }>('/dsh-hitchfin/login/code', {
        method: 'POST',
        body: JSON.stringify({ id: channelLogin.id, code: code.trim() }),
      })
      setLogin(body.login)
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const cancelLogin = async () => {
    if (!channelLogin) return
    setBusy('cancel')
    try {
      const body = await json<{ login: Login }>('/dsh-hitchfin/login/cancel', {
        method: 'POST',
        body: JSON.stringify({ id: channelLogin.id }),
      })
      setLogin(body.login)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const retryLogin = () => {
    if (!channelLogin || !channel) return
    const accountId = channelLogin.accountId
    setLogin(null)
    openMethods(channel, accountId)
  }

  const toggleFreeOnly = async (target: Channel) => {
    const next = !target.freeOnly
    requestSeq.current += 1
    setChannels((list) =>
      list
        ? list.map((entry) => (entry.id === target.id ? { ...entry, freeOnly: next } : entry))
        : list,
    )
    setBusy(`free:${target.id}`)
    try {
      await json('/dsh-hitchfin/free-only', {
        method: 'POST',
        body: JSON.stringify({ channelId: target.id, freeOnly: next }),
      })
    } catch (err) {
      setChannels((list) =>
        list
          ? list.map((entry) =>
              entry.id === target.id ? { ...entry, freeOnly: target.freeOnly } : entry,
            )
          : list,
      )
      showToast('error', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const persistHidden = async (
    target: Channel,
    hidden: string[],
    previous: string[],
    message?: string,
  ) => {
    if (modelBusy) return
    requestSeq.current += 1
    setChannels((list) =>
      list
        ? list.map((entry) =>
            entry.id === target.id ? { ...entry, hiddenModels: hidden } : entry,
          )
        : list,
    )
    setModelBusy(true)
    try {
      await json('/dsh-hitchfin/models/hidden', {
        method: 'POST',
        body: JSON.stringify({ channelId: target.id, hiddenModels: hidden }),
      })
      if (message) showToast('success', message)
    } catch (err) {
      setChannels((list) =>
        list
          ? list.map((entry) =>
              entry.id === target.id ? { ...entry, hiddenModels: previous } : entry,
            )
          : list,
      )
      showToast('error', err instanceof Error ? err.message : String(err))
    } finally {
      setModelBusy(false)
    }
  }

  const toggleModel = (target: Channel, model: Model) => {
    const previous = [...(target.hiddenModels ?? [])]
    const key = normalizedModelName(model.name)
    const wasHidden = isModelHidden(model, new Set(previous))
    // Drop the canonical name, its loose spellings and any legacy id so a
    // toggle always flips. Store both name and id: a vendor rename must not
    // bring a hidden model back when the live catalog replaces the fallback.
    const cleaned = unhideModelTokens(previous, model, target.allModels)
    void persistHidden(
      target,
      wasHidden ? cleaned : [...new Set([...cleaned, key, model.id])],
      previous,
    )
  }

  const persistEnabled = async (target: Channel, accountId: string, enabled: boolean) => {
    if (busy !== '') return
    requestSeq.current += 1
    const apply = (value: boolean) => (list: Channel[] | null) =>
      list
        ? list.map((entry) =>
            entry.id === target.id
              ? {
                  ...entry,
                  accounts: withPrimary(
                    entry.accounts.map((account) =>
                      account.accountId === accountId
                        ? { ...account, enabled: value }
                        : account,
                    ),
                  ),
                }
              : entry,
          )
        : list
    setChannels(apply(enabled))
    setBusy(`enabled:${accountId}`)
    try {
      await json('/dsh-hitchfin/account/enabled', {
        method: 'POST',
        body: JSON.stringify({ channelId: target.id, accountId, enabled }),
      })
      showToast(
        'success',
        enabled
          ? T('账号已启用', 'Account enabled')
          : T('账号已停用，凭据与设置已保留', 'Account disabled; credentials kept'),
      )
      void refresh(false)
      schedule(() => {
        void refresh(true)
      }, 350)
    } catch (err) {
      setChannels(apply(!enabled))
      showToast('error', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const persistOrder = async (target: Channel, ordered: Account[], previous: Account[]) => {
    if (busy !== '') return
    requestSeq.current += 1
    const replace = (accounts: Account[]) => (list: Channel[] | null) =>
      list
        ? list.map((entry) => (entry.id === target.id ? { ...entry, accounts } : entry))
        : list
    setChannels(replace(withPrimary(ordered)))
    setBusy('order')
    try {
      await json('/dsh-hitchfin/account/order', {
        method: 'POST',
        body: JSON.stringify({
          channelId: target.id,
          accountIds: ordered.map((account) => account.accountId),
        }),
      })
    } catch (err) {
      setChannels(replace(previous))
      showToast('error', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const moveAccount = (target: Channel, index: number, delta: number) => {
    const next = index + delta
    if (next < 0 || next >= target.accounts.length) return
    const ordered = [...target.accounts]
    ;[ordered[index], ordered[next]] = [ordered[next], ordered[index]]
    void persistOrder(target, ordered, target.accounts)
  }

  const refreshModels = async (target: Channel) => {
    if (modelBusy) return
    setModelBusy(true)
    try {
      await json('/dsh-hitchfin/models/refresh', {
        method: 'POST',
        body: JSON.stringify({ channelId: target.id }),
      })
      await refresh(true)
      showToast('success', T('模型目录已刷新', 'Model catalog refreshed'))
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : String(err))
    } finally {
      setModelBusy(false)
    }
  }

  const setModelsVisible = (
    target: Channel,
    models: Model[],
    action: 'show' | 'hide',
  ) => {
    if (modelBusy || models.length === 0) return
    const previous = [...(target.hiddenModels ?? [])]
    const previousSet = new Set(previous)
    const changed = models.filter((model) =>
      action === 'show' ? isModelHidden(model, previousSet) : !isModelHidden(model, previousSet),
    ).length
    if (changed === 0) {
      showToast(
        'success',
        action === 'show'
          ? T('所选模型已全部显示', 'Selected models are already visible')
          : T('所选模型已全部隐藏', 'Selected models are already hidden'),
      )
      return
    }
    const next = bulkHiddenTokens(models, previous, action, target.allModels)
    void persistHidden(
      target,
      next,
      previous,
      action === 'show'
        ? T(`已显示 ${changed} 个模型`, `Showed ${changed} model(s)`)
        : T(`已隐藏 ${changed} 个模型`, `Hid ${changed} model(s)`),
    )
  }

  const hidePaidModels = (target: Channel) => {
    if (modelBusy) return
    const previous = [...(target.hiddenModels ?? [])]
    const previousSet = new Set(previous)
    const toHide = paidModels.filter((model) => !isModelHidden(model, previousSet))
    if (toHide.length === 0) {
      showToast('success', T('没有需要隐藏的付费模型', 'No paid models to hide'))
      return
    }
    const next = bulkHiddenTokens(toHide, previous, 'hide', target.allModels)
    void persistHidden(
      target,
      next,
      previous,
      T(`已隐藏 ${toHide.length} 个付费模型`, `Hid ${toHide.length} paid models`),
    )
  }

  const openProxy = (target: Channel, account: Account) => {
    setCompose(null)
    setSecretValue('')
    setSecretError('')
    setProxyFor(`${target.id}:${account.accountId}`)
    setProxyDraft('')
    setProxyError('')
    setMenuFor('')
    setConfirmDelete(false)
    setModelsOpen(false)
    setModelQuery('')
  }

  const saveProxy = async (target: Channel, account: Account, value: string) => {
    const key = `${target.id}:${account.accountId}`
    setBusy(`proxy:${key}`)
    setProxyError('')
    try {
      const body = await json<{ account?: Partial<Account> }>('/dsh-hitchfin/account/proxy', {
        method: 'POST',
        body: JSON.stringify({
          channelId: target.id,
          accountId: account.accountId,
          proxy: value,
        }),
      })
      const updated = body.account
      if (updated) {
        requestSeq.current += 1
        setChannels((list) =>
          list
            ? list.map((entry) =>
                entry.id === target.id
                  ? {
                      ...entry,
                      accounts: entry.accounts.map((item) =>
                        item.accountId === account.accountId
                          ? {
                              ...item,
                              proxy: updated.proxy,
                              proxyConfigured: updated.proxyConfigured,
                            }
                          : item,
                      ),
                    }
                  : entry,
              )
            : list,
        )
      }
      setProxyFor('')
      setProxyDraft('')
      showToast('success', value ? T('代理已保存', 'Proxy saved') : T('已改为直连', 'Proxy cleared'))
      void refresh(false)
      schedule(() => {
        void refresh(true)
      }, 350)
    } catch (err) {
      setProxyError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const removeAccount = async (target: Channel, account: Account) => {
    setBusy(`delete:${target.id}:${account.accountId}`)
    try {
      await json('/dsh-hitchfin/delete', {
        method: 'POST',
        body: JSON.stringify({ channelId: target.id, accountId: account.accountId }),
      })
      setMenuFor('')
      setConfirmDelete(false)
      setModelsOpen(false)
      setModelQuery('')
      showToast('success', T('账号已删除', 'Account removed'))
      await refresh(false)
      schedule(() => {
        void refresh(true)
      }, 350)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  if (!channels) {
    return (
      <div className={`hf-wrap${dark ? ' hf-dark' : ''}`} aria-busy="true">
        <style>{CSS}</style>
        <PageHeader />
        {error ? (
          <Alert
            message={error}
            onClose={() => setError('')}
            onRetry={() => void refresh(false)}
          />
        ) : null}
        <div className="hf-skeleton-tabs" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div className="hf-skel hf-skel-tab" key={index} />
          ))}
        </div>
        <div className="hf-panel hf-panel-skeleton" aria-hidden="true">
          <div className="hf-skel hf-skel-head" />
          <div className="hf-skel hf-skel-row" />
          <div className="hf-skel hf-skel-row short" />
        </div>
        <p className="hf-foot">
          {T(
            '免费额度由各厂商提供，可能随时变化。仅限个人账号；不共享账号、不自动签到。',
            'Free tiers are provided by each vendor and may change. Personal accounts only; no sharing or automatic check-in.',
          )}
        </p>
      </div>
    )
  }

  if (!channel) {
    return (
      <div className={`hf-wrap${dark ? ' hf-dark' : ''}`}>
        <style>{CSS}</style>
        <PageHeader />
        {error ? <Alert message={error} onClose={() => setError('')} /> : null}
        <div className="hf-panel">
          <div className="hf-empty">
            <h3>{T('没有可用的渠道', 'No channels available')}</h3>
            <p>{T('请检查插件安装后重试。', 'Check the plugin installation and try again.')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`hf-wrap${dark ? ' hf-dark' : ''}`}>
      <style>{CSS}</style>
      <PageHeader />
      {error ? <Alert message={error} onClose={() => setError('')} /> : null}

      {overview ? (
        <div className="hf-overview" aria-label={T('接入概览', 'Bridge overview')}>
          <div className="hf-overview-item">
            <span className="hf-overview-mark"><OverviewIcon kind="channels" /></span>
            <span className="hf-overview-copy">
              <span className="hf-overview-value">
                {overview.connected}<small>/{overview.total}</small>
              </span>
              <span className="hf-overview-label">{T('已连接渠道', 'Channels connected')}</span>
            </span>
          </div>
          <div className="hf-overview-item">
            <span className="hf-overview-mark"><OverviewIcon kind="accounts" /></span>
            <span className="hf-overview-copy">
              <span className="hf-overview-value">{overview.accounts}</span>
              <span className="hf-overview-label">{T('已登录账号', 'Signed-in accounts')}</span>
            </span>
          </div>
          <div className="hf-overview-item">
            <span className="hf-overview-mark"><OverviewIcon kind="models" /></span>
            <span className="hf-overview-copy">
              <span className="hf-overview-value">{overview.models}</span>
              <span className="hf-overview-label">{T('可用模型', 'Available models')}</span>
            </span>
          </div>
        </div>
      ) : null}

      <div className="hf-tabs" role="tablist" aria-label={T('渠道', 'Channels')}>
        {channels.map((entry) => {
          const entryLogin = login && login.channelId === entry.id ? login : null
          const pending = entryLogin?.status === 'pending' || entryLogin?.status === 'code'
          const failed = entryLogin?.status === 'error'
          const dotClass = failed
            ? 'hf-tab-dot error'
            : pending
              ? 'hf-tab-dot pending'
              : entry.accounts.length > 0
                ? 'hf-tab-dot on'
                : 'hf-tab-dot'
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`hf-tab-${entry.id}`}
              aria-controls={`hf-panel-${entry.id}`}
              aria-selected={entry.id === channel.id}
              tabIndex={entry.id === channel.id ? 0 : -1}
              className={`hf-tab${entry.id === channel.id ? ' active' : ''}`}
              onClick={() => selectChannel(entry.id)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                const ids = channels.map((item) => item.id)
                const current = ids.indexOf(entry.id)
                const offset = event.key === 'ArrowRight' ? 1 : -1
                const next = ids[(current + offset + ids.length) % ids.length]
                selectChannel(next)
                window.requestAnimationFrame(() => {
                  document.getElementById(`hf-tab-${next}`)?.focus()
                })
              }}
            >
              <ChannelLogo id={entry.id} size="tab" />
              <span className="hf-tab-copy">
                <span className="hf-tab-name">{shortName(entry.displayName)}</span>
                <span className="hf-tab-meta">
                  {entry.accounts.length > 0
                    ? T(`${entry.accounts.length} 个账号`, `${entry.accounts.length} account(s)`)
                    : T('未登录', 'Not signed in')}
                </span>
              </span>
              <span className={dotClass} aria-hidden="true" />
            </button>
          )
        })}
      </div>

      <section
        key={channel.id}
        id={`hf-panel-${channel.id}`}
        role="tabpanel"
        aria-labelledby={`hf-tab-${channel.id}`}
        className={`hf-panel ${tone}`}
      >
        <div className="hf-channel-head">
          <ChannelLogo id={channel.id} size="header" />
          <div className="hf-channel-copy">
            <div className="hf-channel-title">
              <span>{shortName(channel.displayName)}</span>
              {channel.status === 'experimental' ? (
                <span className="hf-mini-tag warn">{T('实验性', 'Experimental')}</span>
              ) : null}
            </div>
            <div className="hf-channel-meta">
              {!channel.packageAvailable
                ? T('渠道包未安装', 'Channel package not installed')
                : accounts.length > 0
                  ? [
                      T(`${accounts.length} 个账号`, `${accounts.length} account(s)`),
                      T(`${visibleTotal} 个可用模型`, `${visibleTotal} available model(s)`),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : T('尚未登录', 'Not signed in')}
            </div>
            {channel.packageVersionMismatch ? (
              <div className="hf-channel-note warn" role="status">
                {T(
                  `渠道包版本 ${channel.packageVersion ?? '未知'}，插件按 ${channel.packageExpectedVersion} 适配；登录方式可能不匹配。`,
                  `Channel package is ${channel.packageVersion ?? 'unknown'}, written against ${channel.packageExpectedVersion}; sign-in methods may not match.`,
                )}
              </div>
            ) : null}
            {channel.packageAvailable && accounts.length > 1 ? (
              <div className="hf-channel-note">
                {T(
                  '主账号优先；同会话沿用上次成功的账号以复用缓存，失败时按顺序切换。',
                  'Primary first; a session sticks to its last account for cache reuse, then fails over in list order.',
                )}
              </div>
            ) : null}
          </div>
          {channel.packageAvailable && accounts.length > 0 ? (
            <div className="hf-channel-actions">
              <button
                type="button"
                className="hf-btn primary"
                disabled={busy !== '' || loginPending || Boolean(composeHere)}
                onClick={() => openMethods(channel, 'new')}
              >
                <IconPlus />
                {T('添加账号', 'Add account')}
              </button>
            </div>
          ) : null}
        </div>

        {channelLogin &&
        (channelLogin.status === 'pending' ||
          channelLogin.status === 'code' ||
          channelLogin.status === 'error') ? (
          <div className={`hf-banner${loginError ? ' error' : ''}`} role={loginError ? 'alert' : 'status'}>
            {loginError ? <IconAlert /> : <span className="hf-pulse" aria-hidden="true" />}
            <div className="hf-banner-body">
              <div className="hf-banner-title">
                {loginError
                  ? T('登录未完成', 'Sign-in failed')
                  : channelLogin.status === 'code'
                    ? T('输入授权码', 'Enter authorization code')
                    : T('等待完成登录', 'Waiting for sign-in')}
              </div>
              <div className="hf-banner-text">
                {loginError ? (
                  channelLogin.error
                ) : channelLogin.autoOpened && channelLogin.status !== 'code' ? (
                  T(
                    '已在浏览器打开登录页，完成后这里会自动更新。',
                    'Opened the sign-in page in your browser; this page updates automatically.',
                  )
                ) : (
                  channelLogin.instructions || loginPrompt(channel, channelLogin)
                )}
              </div>
              {loginError ? (
                <div className="hf-banner-actions">
                  <button
                    type="button"
                    className="hf-btn primary small"
                    disabled={busy !== ''}
                    onClick={retryLogin}
                  >
                    {T('重试', 'Retry')}
                  </button>
                  <button
                    type="button"
                    className="hf-btn ghost small"
                    onClick={() => setLogin(null)}
                  >
                    {T('关闭', 'Dismiss')}
                  </button>
                </div>
              ) : channelLogin.status === 'code' ? (
                <div className="hf-code-row">
                  <input
                    className="hf-input"
                    autoFocus
                    value={code}
                    placeholder={T('粘贴授权码', 'Paste the code')}
                    aria-label={T('授权码', 'Authorization code')}
                    onChange={(event) => setCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && code.trim() && busy === '') {
                        event.preventDefault()
                        void submitCode()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="hf-btn primary"
                    disabled={busy !== '' || !code.trim()}
                    onClick={() => void submitCode()}
                  >
                    {busy === 'code' ? <span className="hf-spinner" /> : null}
                    {T('提交', 'Submit')}
                  </button>
                  <button
                    type="button"
                    className="hf-btn ghost"
                    disabled={busy !== ''}
                    onClick={() => void cancelLogin()}
                  >
                    {T('取消', 'Cancel')}
                  </button>
                </div>
              ) : (
                <div className="hf-banner-actions">
                  {loginUrl ? (
                    <a
                      className={`hf-btn ${channelLogin.autoOpened ? 'ghost small' : 'primary small'}`}
                      href={loginUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <IconLink />
                      {channelLogin.autoOpened
                        ? T('重新打开登录页', 'Reopen sign-in page')
                        : T('打开登录页面', 'Open sign-in page')}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="hf-btn ghost small"
                    disabled={busy !== ''}
                    onClick={() => void cancelLogin()}
                  >
                    {T('取消', 'Cancel')}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {composeHere && composeHere.kind === 'methods' ? (
          <div className="hf-form-panel">
            <div className="hf-form-head">
              <div>
                <div className="hf-form-title">
                  {composeHere.accountId === 'new'
                    ? T('添加账号', 'Add account')
                    : T('重新登录', 'Sign in again')}
                </div>
                <div className="hf-form-desc">
                  {composeAccount
                    ? T(
                        `${composeAccount.label} · 代理与额度设置会保留`,
                        `${composeAccount.label} · proxy and quota settings are kept`,
                      )
                    : T(
                        '新账号会独立保存；请求失败时可自动切换到其他账号。',
                        'A new account is saved separately and can be used for failover.',
                      )}
                </div>
              </div>
              <button
                type="button"
                className="hf-btn ghost small"
                onClick={() => setCompose(null)}
              >
                {T('取消', 'Cancel')}
              </button>
            </div>
            <div className="hf-methods compact">
              {channel.methods.map((method, index) => (
                <button
                  key={method.id}
                  type="button"
                  autoFocus={index === 0}
                  className={`hf-method${index === 0 ? ' primary' : ''}`}
                  disabled={busy !== ''}
                  onClick={() => startMethod(channel, method, composeHere.accountId)}
                >
                  <span>{methodLabel(method)}</span>
                  <small>{methodHint(method)}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {composeHere && composeHere.kind === 'secret' ? (
          <form
            className="hf-form-panel"
            onSubmit={(event) => {
              event.preventDefault()
              void submitSecret(channel)
            }}
          >
            <div className="hf-form-head">
              <div>
                <div className="hf-form-title">
                  {composeHere.secretKind === 'api-key'
                    ? T('使用 API Key 连接', 'Connect with an API key')
                    : T('使用 PAT 连接', 'Connect with a PAT')}
                </div>
                <div className="hf-form-desc">
                  {composeHere.secretKind === 'api-key'
                    ? T('Key 只保存在本机，完成后模型会出现在 DSH 中。', 'The key stays on this device. Models appear in DSH after connecting.')
                    : T('令牌只保存在本机，完成后模型会出现在 DSH 中。', 'The token stays on this device. Models appear in DSH after connecting.')}
                </div>
              </div>
              <button
                type="button"
                className="hf-btn ghost small"
                onClick={() => {
                  setCompose(null)
                  setSecretValue('')
                  setSecretError('')
                }}
              >
                {T('取消', 'Cancel')}
              </button>
            </div>
            <div className="hf-field">
              <label className="hf-label" htmlFor="hf-secret">
                {composeHere.secretKind === 'api-key' ? 'API Key' : T('个人访问令牌', 'Personal access token')}
              </label>
              <div className="hf-inline-input">
                <input
                  id="hf-secret"
                  className="hf-input"
                  type="password"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={secretValue}
                  placeholder={
                    composeHere.placeholder ??
                    (composeHere.secretKind === 'api-key' ? 'sk-...' : 'pt-...')
                  }
                  onChange={(event) => {
                    setSecretValue(event.target.value)
                    if (secretError) setSecretError('')
                  }}
                />
                <button
                  type="submit"
                  className="hf-btn primary"
                  disabled={busy !== '' || !secretValue.trim()}
                >
                  {busy === `secret:${channel.id}` ? <span className="hf-spinner" /> : null}
                  {T('连接', 'Connect')}
                </button>
              </div>
              {secretError ? (
                <p className="hf-field-error" role="alert">
                  {secretError}
                </p>
              ) : null}
            </div>
            <p className="hf-help">
              {composeHere.secretKind === 'api-key'
                ? T('在 WorkBuddy 的 API Key 页面创建。', "Create one on WorkBuddy's API key page.")
                : (
                    <>
                      {T('在 ', 'Create one at ')}
                      <a href="https://qoder.cn/account/integrations" target="_blank" rel="noreferrer">
                        qoder.cn/account/integrations
                      </a>
                      {T(' 创建 PAT。', '.')}
                    </>
                  )}
            </p>
          </form>
        ) : null}

        {accounts.length > 0 ? (
          <div className="hf-accounts">
            {accounts.map((account, accountIndex) => {
              const key = `${channel.id}:${account.accountId}`
              const rows = quotaRows(account.quota, now)
              // A plan named after the very window below it says nothing twice.
              const plan = account.quota?.plan?.trim()
              const planLabel =
                plan && !rows.some((row) => row.label.trim().toLowerCase() === plan.toLowerCase())
                  ? plan
                  : ''
              const cooldown = cooldownLeft(account.cooldownUntil, now)
              const menuOpen = menuFor === key
              const proxyOpen = proxyFor === key
              const deleteBusy = busy === `delete:${key}`
              const proxyBusy = busy === `proxy:${key}`
              return (
                <div
                  className={`hf-account${account.enabled === false ? ' off' : ''}`}
                  key={account.accountId}
                >
                  <div className="hf-account-main">
                    <div className="hf-account-top">
                      <span className={`hf-dot${account.error ? ' warn' : ''}`} />
                      <span className="hf-account-name" title={account.label}>
                        {account.label}
                      </span>
                      <span className="hf-account-id">{account.accountId}</span>
                      {account.enabled === false ? (
                        <span className="hf-mini-tag warn">{T('已停用', 'Disabled')}</span>
                      ) : accounts.length > 1 ? (
                        account.isPrimary ? (
                          <span className="hf-mini-tag primary">{T('主账号', 'Primary')}</span>
                        ) : (
                          <span className="hf-mini-tag">{T('备用', 'Backup')}</span>
                        )
                      ) : null}
                      {planLabel ? <span className="hf-mini-tag plan">{planLabel}</span> : null}
                    </div>
                    {account.enabled === false ? (
                      <div className="hf-account-sub">
                        {T(
                          '账号已停用；启用后恢复模型与额度',
                          'Account disabled; enable it to restore models and usage',
                        )}
                      </div>
                    ) : account.error ? (
                      <div className="hf-account-error" role="alert">
                        <IconAlert />
                        <span>{account.error}</span>
                        <button
                          type="button"
                          className="hf-link-btn hf-error-action"
                          disabled={busy !== '' || loginPending}
                          onClick={() => openMethods(channel, account.accountId)}
                        >
                          {T('重新登录', 'Sign in again')}
                        </button>
                      </div>
                    ) : rows.length > 0 ? (
                      <div className="hf-quotas">
                        {rows.map((row) => (
                          <div className="hf-quota" key={row.key}>
                            <div className="hf-quota-line">
                              <span className="hf-quota-label">
                                {row.label}
                                {row.free ? <span className="hf-quota-free">{T('免费', 'Free')}</span> : null}
                              </span>
                              <span
                                className="hf-quota-value"
                                title={
                                  row.percent !== undefined
                                    ? T(`已用 ${row.percent}%`, `${row.percent}% used`)
                                    : undefined
                                }
                              >
                                <span className="hf-quota-amount">{row.value}</span>
                                {row.reset ? (
                                  <span className="hf-quota-reset">
                                    {' · '}
                                    {T('重置', 'resets')} {row.reset}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            {row.percent !== undefined ? (
                              <div
                                className={`hf-progress${row.free ? ' free' : ''}${
                                  row.percent >= 100 ? ' full' : row.percent >= 85 ? ' warn' : ''
                                }`}
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={row.percent}
                                aria-label={T(
                                  `${row.label} 已用 ${row.percent}%`,
                                  `${row.label}: ${row.percent}% used`,
                                )}
                              >
                                <span style={{ width: `${row.percent}%` }} />
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="hf-account-sub">
                        {quotaReady ? T('额度暂不可用', 'Usage unavailable') : T('正在读取额度…', 'Loading usage…')}
                      </div>
                    )}
                    <div className="hf-account-meta">
                      <span className="hf-account-meta-info">
                        {account.lastUsedAt
                          ? `${T('最近使用', 'Last used')} ${timeAgo(account.lastUsedAt, now)}`
                          : T('尚未使用', 'Not used yet')}
                      </span>
                      {cooldown ? (
                        <span className="hf-mini-tag warn">
                          {T('冷却', 'Cooldown')} {cooldown}
                          {account.cooldownCode ? ` · ${account.cooldownCode}` : ''}
                        </span>
                      ) : null}
                      <span className="hf-account-actions">
                        <span className="hf-reorder">
                          <button
                            type="button"
                            aria-label={T('上移，提高优先级', 'Move up')}
                            title={T('上移，提高优先级', 'Move up')}
                            disabled={busy !== '' || accountIndex === 0}
                            onClick={() => moveAccount(channel, accountIndex, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={T('下移，降低优先级', 'Move down')}
                            title={T('下移，降低优先级', 'Move down')}
                            disabled={busy !== '' || accountIndex === accounts.length - 1}
                            onClick={() => moveAccount(channel, accountIndex, 1)}
                          >
                            ↓
                          </button>
                        </span>
                        <button
                          type="button"
                          className="hf-mini-btn"
                          aria-label={
                            account.proxyConfigured
                              ? T('代理已配置，点击修改', 'Proxy configured; click to edit')
                              : T('未配置代理，点击设置', 'No proxy; click to set')
                          }
                          title={
                            account.proxyConfigured
                              ? T('代理已配置，点击修改', 'Proxy configured; click to edit')
                              : T('未配置代理，点击设置', 'No proxy; click to set')
                          }
                          disabled={busy !== ''}
                          onClick={() => openProxy(channel, account)}
                        >
                          <span className={`hf-dot${account.proxyConfigured ? '' : ' off'}`} />
                          {T('代理', 'Proxy')}
                        </button>
                      </span>
                    </div>
                  </div>

                  <div className="hf-account-side">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={account.enabled !== false}
                      aria-label={
                        account.enabled === false
                          ? T('启用该账号', 'Enable this account')
                          : T('停用该账号，凭据与设置会保留', 'Disable; credentials are kept')
                      }
                      className={`hf-switch compact${account.enabled === false ? '' : ' on'}`}
                      disabled={busy !== ''}
                      title={
                        account.enabled === false
                          ? T('启用该账号', 'Enable this account')
                          : T('停用该账号，凭据与设置会保留', 'Disable; credentials are kept')
                      }
                      onClick={() =>
                        persistEnabled(channel, account.accountId, account.enabled === false)
                      }
                    >
                      <span className="hf-switch-knob" />
                    </button>
                    <button
                      type="button"
                      className="hf-icon-btn"
                      data-hf-menu
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label={T('账号操作', 'Account actions')}
                      disabled={busy !== ''}
                      onClick={() => {
                        setCompose(null)
                        setSecretValue('')
                        setSecretError('')
                        setProxyFor('')
                        setProxyDraft('')
                        setProxyError('')
                        setModelsOpen(false)
                        setModelQuery('')
                        setMenuFor(menuOpen ? '' : key)
                        setConfirmDelete(false)
                      }}
                    >
                      <IconMore />
                    </button>
                  </div>

                  {proxyOpen ? (
                    <div className="hf-inline-panel">
                      <div className="hf-form-head">
                        <div>
                          <div className="hf-form-title">{T('账号代理', 'Account proxy')}</div>
                          <div className="hf-form-desc">
                            {T(
                              'HTTP(S) 代理，仅作用于该账号的登录、模型、额度与聊天请求。',
                              'HTTP(S) proxy for this account’s sign-in, models, usage and chat requests.',
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="hf-btn ghost small"
                          onClick={() => {
                            setProxyFor('')
                            setProxyError('')
                          }}
                        >
                          {T('取消', 'Cancel')}
                        </button>
                      </div>
                      <div className="hf-field">
                        <label className="hf-label" htmlFor={`hf-proxy-${key}`}>
                          {T('代理地址', 'Proxy URL')}
                        </label>
                        <div className="hf-inline-input">
                          <input
                            id={`hf-proxy-${key}`}
                            className="hf-input"
                            autoFocus
                            value={proxyDraft}
                            placeholder="http://127.0.0.1:7890"
                            aria-label={T('代理地址', 'Proxy URL')}
                            onChange={(event) => {
                              setProxyDraft(event.target.value)
                              if (proxyError) setProxyError('')
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && proxyDraft.trim() && !proxyBusy) {
                                event.preventDefault()
                                void saveProxy(channel, account, proxyDraft.trim())
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="hf-btn primary"
                            disabled={proxyBusy || !proxyDraft.trim()}
                            onClick={() => void saveProxy(channel, account, proxyDraft.trim())}
                          >
                            {proxyBusy ? <span className="hf-spinner" /> : null}
                            {T('保存', 'Save')}
                          </button>
                          {account.proxyConfigured ? (
                            <button
                              type="button"
                              className="hf-btn"
                              disabled={proxyBusy}
                              onClick={() => {
                                setProxyDraft('')
                                void saveProxy(channel, account, '')
                              }}
                            >
                              {T('改为直连', 'Direct')}
                            </button>
                          ) : null}
                        </div>
                        {proxyError ? (
                          <p className="hf-field-error" role="alert">
                            {proxyError}
                          </p>
                        ) : null}
                        <p className="hf-help">
                          {account.proxyConfigured
                            ? T(
                                `当前使用 ${account.proxy ?? '已配置代理'}。输入新地址会覆盖；使用「改为直连」清除。`,
                                `Currently using ${account.proxy ?? 'a configured proxy'}. Enter a new URL to replace it, or use Direct to clear it.`,
                              )
                            : T('填入地址并保存后生效；取消则保持直连。', 'Enter a URL and save to use it; cancel to stay direct.')}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {menuOpen ? (
                    <div
                      className="hf-menu"
                      role={confirmDelete ? 'alertdialog' : 'menu'}
                      data-hf-menu
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return
                        event.preventDefault()
                        event.stopPropagation()
                        setMenuFor('')
                        setConfirmDelete(false)
                      }}
                    >
                      {confirmDelete ? (
                        <div className="hf-menu-confirm">
                          <p>
                            {T(
                              '删除后，该账号的登录状态、额度和代理设置都会移除。',
                              'This removes the account’s sign-in, quota and proxy settings.',
                            )}
                          </p>
                          <div className="hf-menu-actions">
                            <button
                              type="button"
                              autoFocus
                              className="hf-btn danger small"
                              disabled={deleteBusy}
                              onClick={() => void removeAccount(channel, account)}
                            >
                              {deleteBusy ? <span className="hf-spinner" /> : null}
                              {T('删除账号', 'Remove')}
                            </button>
                            <button
                              type="button"
                              className="hf-btn ghost small"
                              onClick={() => setConfirmDelete(false)}
                            >
                              {T('取消', 'Cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            autoFocus
                            disabled={busy !== '' || loginPending}
                            onClick={() => {
                              setMenuFor('')
                              openMethods(channel, account.accountId)
                            }}
                          >
                            {T('重新登录', 'Sign in again')}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            disabled={busy !== ''}
                            onClick={() => setConfirmDelete(true)}
                          >
                            {T('删除账号', 'Remove account')}
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : !loginPending && !loginError && !composeHere ? (
          channel.packageAvailable ? (
            <div className="hf-empty">
              <ChannelLogo id={channel.id} size="empty" />
              <h3>{T(`连接 ${shortName(channel.displayName)}`, `Connect ${shortName(channel.displayName)}`)}</h3>
              <p>
                {T(
                  '使用官方账号登录，模型会出现在 DSH 模型选择器里。',
                  'Sign in with an official account and its models appear in the DSH model picker.',
                )}
              </p>
              <div className="hf-methods">
                {channel.methods.map((method, index) => (
                  <button
                    key={method.id}
                    type="button"
                    className={`hf-method${index === 0 ? ' primary' : ''}`}
                    disabled={busy !== ''}
                    onClick={() => startMethod(channel, method, 'new')}
                  >
                    <span>{methodLabel(method)}</span>
                    <small>{methodHint(method)}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="hf-empty">
              <div className="hf-empty-mark">
                <IconAlert />
              </div>
              <h3>{T('渠道包未安装', 'Channel package not installed')}</h3>
              <p>
                {T(
                  '重新安装 dsh-hitchfin 后再试；已有账号不会丢失。',
                  'Reinstall dsh-hitchfin and try again. Existing accounts are kept.',
                )}
              </p>
            </div>
          )
        ) : null}

        {accounts.length > 0 && channel.packageAvailable ? (
          <>
            <div className="hf-prefs">
              <div className="hf-pref">
                <div className="hf-pref-copy">
                  <div className="hf-pref-title">
                    {channel.freeStatusKnown
                      ? T('只显示免费模型', 'Free models only')
                      : T('显示全部模型', 'Show all models')}
                  </div>
                  <div className="hf-pref-desc">
                    {channel.freeStatusKnown
                      ? channel.freeOnly
                        ? T('模型选择器只包含免费模型', 'The model picker shows free models only')
                        : T('同时显示免费与付费模型', 'Free and paid models are shown')
                      : T('该渠道没有免费/付费标记', 'This channel has no free/paid metadata')}
                  </div>
                </div>
                {channel.freeStatusKnown ? (
                  <Toggle
                    on={channel.freeOnly}
                    label={T('只显示免费模型', 'Free models only')}
                    disabled={busy !== ''}
                    onChange={() => void toggleFreeOnly(channel)}
                  />
                ) : null}
              </div>
              <div className="hf-pref">
                <div className="hf-pref-copy">
                  <div className="hf-pref-title">{T('模型可见性', 'Model visibility')}</div>
                  <div className="hf-pref-desc">
                    {channel.modelsError ? (
                      <span className="hf-mini-tag warn">{T('目录读取失败', 'Catalog failed')}</span>
                    ) : null}
                    {channel.allModels.length > 0
                      ? T(
                          `${visibleTotal} / ${channel.allModels.length} 可见${hiddenCount ? ` · 已隐藏 ${hiddenCount}` : ''}`,
                          `${visibleTotal} / ${channel.allModels.length} visible${hiddenCount ? ` · ${hiddenCount} hidden` : ''}`,
                        )
                      : T('暂未获取到模型', 'No models loaded')}
                  </div>
                </div>
                <button
                  type="button"
                  className="hf-btn small"
                  aria-expanded={modelsOpen}
                  disabled={channel.allModels.length === 0}
                  onClick={() => {
                    setCompose(null)
                    setSecretValue('')
                    setSecretError('')
                    setProxyFor('')
                    setProxyDraft('')
                    setProxyError('')
                    setMenuFor('')
                    setConfirmDelete(false)
                    setModelsOpen((open) => !open)
                    setModelQuery('')
                  }}
                >
                  {modelsOpen ? T('收起', 'Close') : T('管理', 'Manage')}
                </button>
              </div>
            </div>

            {modelsOpen ? (
              <div className="hf-models-panel">
                <div className="hf-models-head">
                  <div>
                    <div className="hf-models-title">{T('模型可见性', 'Model visibility')}</div>
                    <div className="hf-models-sub">
                      {T(
                        `当前可用 ${visibleTotal} 个 · 已启用 ${channel.allModels.length - hiddenCount} 个${
                          hiddenCount ? ` · 已隐藏 ${hiddenCount} 个` : ''
                        }${query ? ` · 搜索匹配 ${shownModels.length} 个` : ''}`,
                        `${visibleTotal} available · ${channel.allModels.length - hiddenCount} enabled${
                          hiddenCount ? ` · ${hiddenCount} hidden` : ''
                        }${query ? ` · ${shownModels.length} matched` : ''}`,
                      )}
                    </div>
                  </div>
                  {modelBusy ? <span className="hf-spinner" aria-label={T('保存中', 'Saving')} /> : null}
                </div>
                {channel.allModels.length > 0 ? (
                  <div className="hf-model-progress" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.round((visibleTotal / channel.allModels.length) * 100)}%`,
                      }}
                    />
                  </div>
                ) : null}
                {channel.modelsError ? (
                  <div className="hf-models-warn">
                    <span className="hf-mini-tag warn">{T('目录读取失败', 'Catalog failed')}</span>
                    <span>
                      {T(
                        '实时模型目录未读取成功，当前显示的是上次成功的目录。点「刷新模型」重试。',
                        'The live catalog could not be read; the last good one is shown. Use Refresh to retry.',
                      )}
                    </span>
                  </div>
                ) : null}
                <div className="hf-model-tools">
                  <div className="hf-search">
                    <IconSearch />
                    <input
                      className="hf-input"
                      type="text"
                      value={modelQuery}
                      placeholder={T('搜索模型', 'Search models')}
                      aria-label={T('搜索模型', 'Search models')}
                      onChange={(event) => setModelQuery(event.target.value)}
                    />
                    {modelQuery ? (
                      <button
                        type="button"
                        className="hf-search-clear"
                        aria-label={T('清除搜索', 'Clear search')}
                        onClick={() => setModelQuery('')}
                      >
                        <IconX />
                      </button>
                    ) : null}
                  </div>
                  <div className="hf-tool-group">
                    <button
                      type="button"
                      className="hf-link-btn"
                      disabled={modelBusy}
                      onClick={() => void refreshModels(channel)}
                    >
                      {T('刷新模型', 'Refresh')}
                    </button>
                    <button
                      type="button"
                      className="hf-link-btn"
                      disabled={modelBusy || shownModels.length === 0}
                      title={
                        query
                          ? T('只作用于当前搜索结果', 'Applies to the current search results')
                          : T('全部显示', 'Show every model')
                      }
                      onClick={() => setModelsVisible(channel, shownModels, 'show')}
                    >
                      {query
                        ? T(`全选 (${shownModels.length})`, `Select all (${shownModels.length})`)
                        : T('全选', 'Select all')}
                    </button>
                    <button
                      type="button"
                      className="hf-link-btn"
                      disabled={modelBusy || shownModels.length === 0}
                      title={
                        query
                          ? T('只作用于当前搜索结果', 'Applies to the current search results')
                          : T('全部隐藏', 'Hide every model')
                      }
                      onClick={() => setModelsVisible(channel, shownModels, 'hide')}
                    >
                      {query
                        ? T(`全不选 (${shownModels.length})`, `Clear all (${shownModels.length})`)
                        : T('全不选', 'Clear all')}
                    </button>
                    {channel.freeStatusKnown && !channel.freeOnly && paidModels.length > 0 ? (
                      <button
                        type="button"
                        className="hf-link-btn"
                        disabled={modelBusy}
                        onClick={() => hidePaidModels(channel)}
                      >
                        {T('隐藏付费', 'Hide paid')}
                      </button>
                    ) : null}
                  </div>
                </div>
                {channel.freeOnly && channel.freeStatusKnown ? (
                  <div className="hf-filter-note">
                    <span className="hf-mini-tag warn">{T('免费过滤中', 'Free filter')}</span>
                    <span>
                      {T(
                        '付费模型即使勾选也不会显示；关闭「只显示免费模型」后生效。',
                        'Paid models stay hidden while the free filter is on.',
                      )}
                    </span>
                  </div>
                ) : null}
                {shownModels.length > 0 ? (
                  <div className="hf-model-grid">
                    {shownModels.map((model) => {
                      const hidden = isModelHidden(model, hiddenSet)
                      const filteredByFree =
                        channel.freeOnly &&
                        channel.freeStatusKnown &&
                        model.freeKnown === true &&
                        !model.free
                      return (
                        <label
                          className={`hf-model-item${hidden ? ' off' : ''}${
                            filteredByFree ? ' filtered' : ''
                          }`}
                          key={model.id}
                          title={model.name}
                        >
                          <input
                            type="checkbox"
                            checked={!hidden}
                            disabled={modelBusy}
                            onChange={() => toggleModel(channel, model)}
                          />
                          <span className="hf-check">
                            <IconCheck />
                          </span>
                          <span className="hf-model-name">{model.name}</span>
                          {filteredByFree ? (
                            <span className="hf-model-tag">{T('免费过滤', 'Filtered')}</span>
                          ) : model.free ? (
                            <span className="hf-model-tag free">{T('免费', 'Free')}</span>
                          ) : model.freeKnown ? (
                            <span className="hf-model-tag">{T('付费', 'Paid')}</span>
                          ) : null}
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="hf-empty-line">
                    {T('没有匹配的模型', 'No matching models')}
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <p className="hf-foot">
        {T(
          '免费额度由各厂商提供，可能随时变化。仅限个人账号；不共享账号、不自动签到。',
          'Free tiers are provided by each vendor and may change. Personal accounts only; no sharing or automatic check-in.',
        )}
      </p>

      {toast ? (
        <div
          className={`hf-toast${toast.tone === 'error' ? ' error' : ''}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
        >
          {toast.tone === 'success' ? <IconCheck /> : <IconX />}
          <span>{toast.message}</span>
        </div>
      ) : null}
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
