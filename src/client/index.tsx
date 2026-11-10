import React, { useEffect, useRef, useState } from 'react'
import { QODER_LOGO, TRAE_LOGO, WORKBUDDY_LOGO } from './logos.js'
import { isModelHidden, normalizedModelName } from '../models.js'
import { quotaPercent, quotaValue, type QuotaWindowLike } from '../format.js'

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

const CSS = `
.hf-wrap {
  --hf-bg: #ffffff;
  --hf-bg-soft: #f6f6f8;
  --hf-bg-sunken: #ececef;
  --hf-text: #1d1d1f;
  --hf-text-2: #48484d;
  --hf-muted: #73737a;
  --hf-faint: #96969d;
  --hf-border: rgba(29, 29, 31, .10);
  --hf-border-strong: rgba(29, 29, 31, .17);
  --hf-hover: rgba(29, 29, 31, .045);
  --hf-success: #25775d;
  --hf-danger: #b3261e;
  --hf-danger-soft: rgba(179, 38, 30, .07);
  --hf-danger-border: rgba(179, 38, 30, .22);
  --hf-warning: #946200;
  --hf-shadow: 0 1px 2px rgba(0, 0, 0, .035), 0 14px 36px rgba(0, 0, 0, .055);
  --hf-shadow-menu: 0 8px 24px rgba(0, 0, 0, .12);
  --hf-radius: 16px;
  --hf-radius-sm: 10px;
  max-width: 820px;
  padding: 4px 0 34px;
  color: var(--hf-text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.hf-dark {
  --hf-bg: #1c1c1e;
  --hf-bg-soft: #242426;
  --hf-bg-sunken: #2c2c2e;
  --hf-text: #f5f5f7;
  --hf-text-2: #d1d1d6;
  --hf-muted: #a1a1a6;
  --hf-faint: #8e8e93;
  --hf-border: rgba(255, 255, 255, .09);
  --hf-border-strong: rgba(255, 255, 255, .16);
  --hf-hover: rgba(255, 255, 255, .055);
  --hf-success: #6fbfa9;
  --hf-danger: #ff8a80;
  --hf-danger-soft: rgba(255, 138, 128, .09);
  --hf-danger-border: rgba(255, 138, 128, .28);
  --hf-warning: #ffbf69;
  --hf-shadow: 0 1px 2px rgba(0, 0, 0, .2), 0 16px 40px rgba(0, 0, 0, .22);
  --hf-shadow-menu: 0 10px 28px rgba(0, 0, 0, .38);
}
.hf-wrap * { box-sizing: border-box; }
.hf-wrap button { font: inherit; }
.hf-wrap :is(button, a):focus-visible {
  outline: 2px solid var(--hf-brand, #2d6cdf);
  outline-offset: 2px;
}
.hf-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin: 4px 0 16px;
}
.hf-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 650;
  letter-spacing: -.022em;
}
.hf-subtitle {
  max-width: 560px;
  margin: 5px 0 0;
  color: var(--hf-muted);
  font-size: 12.5px;
  line-height: 1.55;
}
.hf-privacy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  margin-top: 3px;
  color: var(--hf-muted);
  font-size: 11px;
  white-space: nowrap;
}
.hf-privacy svg { opacity: .85; }
.hf-alert {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0 0 14px;
  padding: 10px 11px;
  border: 1px solid var(--hf-danger-border);
  border-radius: var(--hf-radius-sm);
  background: var(--hf-danger-soft);
  color: var(--hf-danger);
  font-size: 12px;
  line-height: 1.5;
}
.hf-alert > svg { flex: 0 0 auto; margin-top: 1px; }
.hf-alert > span { flex: 1; min-width: 0; }
.hf-alert .hf-btn { flex: 0 0 auto; }
.hf-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin-bottom: 12px;
  padding: 5px;
  border: 1px solid var(--hf-border);
  border-radius: 14px;
  background: var(--hf-bg-soft);
}
.hf-tab {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 50px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--hf-text);
  text-align: left;
  cursor: pointer;
  transition: background .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.hf-tab:hover { background: var(--hf-hover); }
.hf-tab.active {
  border-color: var(--hf-border);
  background: var(--hf-bg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05);
}
.hf-logo {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 9px;
  background: #101114;
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1);
}
.hf-logo.wb { background: transparent; box-shadow: none; }
.hf-logo.tab { width: 28px; height: 28px; border-radius: 8px; }
.hf-logo.header { width: 40px; height: 40px; border-radius: 11px; }
.hf-logo.empty { width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 14px; }
.hf-logo.qd, .hf-logo.tr { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .09); }
.hf-logo-art { display: grid; place-items: center; width: 100%; height: 100%; }
.hf-logo.qd .hf-logo-art, .hf-logo.tr .hf-logo-art { width: 60%; height: 60%; }
.hf-logo-art svg { display: block; width: 100% !important; height: 100% !important; }
.hf-tab:not(.active) .hf-logo { opacity: .72; transition: opacity .18s ease; }
.hf-tab:hover .hf-logo { opacity: 1; }
.hf-tab-copy { min-width: 0; flex: 1; }
.hf-tab-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
}
.hf-tab-meta {
  display: block;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hf-muted);
  font-size: 11px;
  line-height: 1.35;
}
.hf-tab-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--hf-faint);
}
.hf-tab-dot.on { background: var(--hf-success); }
.hf-tab-dot.pending { background: var(--hf-warning); animation: hf-pulse 1.4s ease-in-out infinite; }
.hf-tab-dot.error { background: var(--hf-danger); }
.hf-panel {
  position: relative;
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  box-shadow: var(--hf-shadow);
  animation: hf-panel-in .2s cubic-bezier(.2, .8, .2, 1);
}
.hf-panel.wb { --hf-brand: #2d6cdf; --hf-brand-soft: rgba(45, 108, 223, .07); }
.hf-panel.qd { --hf-brand: #6650cf; --hf-brand-soft: rgba(102, 80, 207, .07); }
.hf-panel.tr { --hf-brand: #177e6c; --hf-brand-soft: rgba(23, 126, 108, .07); }
.hf-channel-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--hf-border);
  border-radius: var(--hf-radius) var(--hf-radius) 0 0;
  background: linear-gradient(180deg, var(--hf-brand-soft), transparent 82%);
}
.hf-channel-copy { min-width: 0; flex: 1; }
.hf-channel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -.01em;
}
.hf-channel-title > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-mini-tag {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  height: 18px;
  padding: 0 6px;
  border-radius: 5px;
  background: var(--hf-bg-sunken);
  color: var(--hf-muted);
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
}
.hf-mini-tag.primary { background: var(--hf-brand-soft); color: var(--hf-brand); }
.hf-mini-tag.plan { background: transparent; box-shadow: inset 0 0 0 1px var(--hf-border); color: var(--hf-muted); }
.hf-mini-tag.warn { background: rgba(148, 98, 0, .1); color: var(--hf-warning); }
.hf-channel-meta {
  margin-top: 2px;
  color: var(--hf-muted);
  font-size: 11.5px;
  line-height: 1.45;
}
.hf-channel-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.hf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--hf-border-strong);
  border-radius: 8px;
  background: var(--hf-bg);
  color: var(--hf-text);
  font-size: 12.5px;
  font-weight: 550;
  line-height: 1.2;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, opacity .16s ease, transform .16s ease;
}
.hf-btn:hover:not(:disabled) { background: var(--hf-bg-soft); }
.hf-btn:active:not(:disabled) { transform: translateY(.5px); }
.hf-btn.primary {
  border-color: var(--hf-text);
  background: var(--hf-text);
  color: var(--hf-bg);
}
.hf-btn.primary:hover:not(:disabled) { opacity: .88; background: var(--hf-text); }
.hf-btn.ghost { border-color: transparent; background: transparent; color: var(--hf-muted); }
.hf-btn.ghost:hover:not(:disabled) { background: var(--hf-hover); color: var(--hf-text); }
.hf-btn.danger { border-color: var(--hf-danger-border); background: transparent; color: var(--hf-danger); }
.hf-btn.danger:hover:not(:disabled) { background: var(--hf-danger-soft); }
.hf-btn.small { min-height: 27px; padding: 0 9px; font-size: 11.5px; }
.hf-btn:disabled { opacity: .45; cursor: default; }
.hf-spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: hf-spin .7s linear infinite;
  opacity: .75;
}
.hf-empty {
  padding: 34px 24px 32px;
  text-align: center;
}
.hf-empty-mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  border-radius: 14px;
  background: var(--hf-brand-soft);
  color: var(--hf-brand);
}
.hf-empty h3 {
  margin: 0;
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -.01em;
}
.hf-empty p {
  max-width: 440px;
  margin: 6px auto 0;
  color: var(--hf-muted);
  font-size: 12px;
  line-height: 1.6;
}
.hf-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  max-width: 620px;
  margin: 18px auto 0;
}
.hf-method {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 52px;
  padding: 9px 11px;
  border: 1px solid var(--hf-border-strong);
  border-radius: 9px;
  background: var(--hf-bg);
  color: var(--hf-text);
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, transform .16s ease;
}
.hf-method:hover:not(:disabled) { border-color: var(--hf-brand); background: var(--hf-brand-soft); }
.hf-method:active:not(:disabled) { transform: translateY(.5px); }
.hf-method.primary { border-color: var(--hf-text); background: var(--hf-text); color: var(--hf-bg); }
.hf-method.primary:hover:not(:disabled) { opacity: .88; background: var(--hf-text); border-color: var(--hf-text); }
.hf-method:disabled { opacity: .45; cursor: default; }
.hf-method > span { font-size: 12px; font-weight: 600; line-height: 1.35; }
.hf-method > small { font-size: 11px; line-height: 1.4; opacity: .66; }
.hf-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 14px 18px 0;
  padding: 11px 12px;
  border: 1px solid var(--hf-border);
  border-left: 3px solid var(--hf-warning);
  border-radius: 10px;
  background: var(--hf-bg-soft);
}
.hf-banner.error {
  border-left-color: var(--hf-danger);
  background: var(--hf-danger-soft);
}
.hf-banner > svg { flex: 0 0 auto; margin-top: 2px; color: var(--hf-warning); }
.hf-banner.error > svg { color: var(--hf-danger); }
.hf-banner-body { min-width: 0; flex: 1; }
.hf-banner-title { font-size: 12.5px; font-weight: 650; line-height: 1.35; }
.hf-banner-text {
  margin-top: 2px;
  color: var(--hf-muted);
  font-size: 11.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.hf-banner.error .hf-banner-text { color: var(--hf-danger); }
.hf-banner-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 9px; }
.hf-code-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
.hf-code-row .hf-input { flex: 1 1 180px; }
.hf-pulse {
  display: block;
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--hf-warning);
  animation: hf-pulse 1.4s ease-in-out infinite;
}
.hf-form-panel {
  margin: 14px 18px 0;
  padding: 12px;
  border: 1px solid var(--hf-border);
  border-radius: 11px;
  background: var(--hf-bg-soft);
  animation: hf-drop-in .2s cubic-bezier(.2, .8, .2, 1);
}
.hf-form-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hf-form-title { font-size: 12.5px; font-weight: 650; line-height: 1.35; }
.hf-form-desc { margin-top: 2px; color: var(--hf-muted); font-size: 11.5px; line-height: 1.5; }
.hf-methods.compact { max-width: none; margin-top: 10px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.hf-field { margin-top: 10px; }
.hf-label {
  display: block;
  margin-bottom: 5px;
  color: var(--hf-text-2);
  font-size: 11.5px;
  font-weight: 550;
}
.hf-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--hf-border-strong);
  border-radius: 8px;
  background: var(--hf-bg);
  color: var(--hf-text);
  font: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color .16s ease, box-shadow .16s ease;
}
.hf-input::placeholder { color: var(--hf-faint); }
.hf-input:focus {
  border-color: var(--hf-brand, #2d6cdf);
  box-shadow: 0 0 0 3px var(--hf-brand-soft, rgba(45, 108, 223, .1));
}
.hf-input:disabled { opacity: .55; }
.hf-inline-input { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.hf-inline-input .hf-input { flex: 1 1 200px; }
.hf-help { margin: 7px 0 0; color: var(--hf-muted); font-size: 11px; line-height: 1.5; }
.hf-help a { color: var(--hf-muted); text-decoration: underline; text-underline-offset: 2px; }
.hf-field-error { margin: 5px 0 0; color: var(--hf-danger); font-size: 11.5px; line-height: 1.45; }
.hf-accounts { padding: 0 18px; }
.hf-account {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 14px;
  padding: 15px 0;
  border-bottom: 1px solid var(--hf-border);
}
.hf-account:last-child { border-bottom: 0; }
.hf-account.off .hf-account-main { opacity: .62; }
.hf-account-main { min-width: 0; }
.hf-account-top { display: flex; align-items: center; gap: 7px; min-width: 0; flex-wrap: wrap; }
.hf-channel-note { margin-top: 6px; color: var(--hf-muted); font-size: 11px; line-height: 1.5; }
.hf-channel-note.warn { color: var(--hf-warning); }
.hf-account-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.hf-account-meta-info { flex: 1 1 auto; min-width: 0; color: var(--hf-muted); font-size: 11px; line-height: 1.5; }
.hf-account-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
.hf-account-actions .hf-mini-btn { min-height: 24px; padding: 0 6px; }
.hf-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--hf-success);
}
.hf-dot.off { background: var(--hf-faint); }
.hf-dot.warn { background: var(--hf-warning); }
.hf-account-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}
.hf-account-id {
  flex: 0 0 auto;
  color: var(--hf-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  letter-spacing: -.02em;
}
.hf-quotas { margin-top: 8px; display: flex; flex-direction: column; gap: 9px; }
.hf-quota-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  line-height: 1.4;
}
.hf-quota-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 550;
  color: var(--hf-text-2);
}
.hf-quota-free {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(37, 119, 93, .09);
  color: var(--hf-success);
  font-size: 11px;
  font-weight: 600;
}
.hf-quota-value {
  flex: 0 0 auto;
  text-align: right;
  white-space: nowrap;
  color: var(--hf-text);
  font-variant-numeric: tabular-nums;
}
.hf-quota-amount { font-weight: 600; letter-spacing: -.01em; }
.hf-quota-reset { color: var(--hf-muted); font-weight: 400; }
.hf-progress {
  height: 5px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--hf-bg-sunken);
}
.hf-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--hf-brand);
  transition: width .35s cubic-bezier(.2, .8, .2, 1);
}
.hf-progress.free > span { background: var(--hf-success); }
.hf-progress.warn > span { background: var(--hf-warning); }
.hf-progress.full > span { background: var(--hf-danger); }
.hf-account-sub { margin-top: 3px; color: var(--hf-muted); font-size: 11px; line-height: 1.45; }
.hf-account-error {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: 5px;
  color: var(--hf-danger);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.hf-account-error svg { flex: 0 0 auto; margin-top: 1px; }
.hf-error-action {
  min-height: 20px;
  padding: 0;
  color: var(--hf-danger);
  font-size: 11px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.hf-account-side { display: flex; align-items: flex-start; gap: 6px; }
.hf-switch {
  position: relative;
  flex: 0 0 auto;
  width: 34px;
  height: 20px;
  margin-top: 1px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--hf-bg-sunken);
  box-shadow: inset 0 0 0 1px var(--hf-border);
  cursor: pointer;
  transition: background .18s ease, box-shadow .18s ease;
}
.hf-switch:hover:not(:disabled) { box-shadow: inset 0 0 0 1px var(--hf-border-strong); }
.hf-switch.on { background: var(--hf-brand); box-shadow: inset 0 0 0 1px transparent; }
.hf-switch-knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .22);
  transition: transform .18s cubic-bezier(.2, .8, .2, 1);
}
.hf-switch.on .hf-switch-knob { transform: translateX(14px); }
.hf-switch:disabled { opacity: .4; cursor: default; }
.hf-reorder {
  display: inline-flex;
  align-items: center;
  height: 24px;
  border: 1px solid var(--hf-border);
  border-radius: 8px;
  overflow: hidden;
}
.hf-reorder button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hf-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.hf-reorder button + button { border-left: 1px solid var(--hf-border); }
.hf-reorder button:hover:not(:disabled) { background: var(--hf-hover); color: var(--hf-text); }
.hf-reorder button:disabled { opacity: .3; cursor: default; }
.hf-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--hf-muted);
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
  transition: background .16s ease, color .16s ease, border-color .16s ease;
}
.hf-mini-btn:hover:not(:disabled) { border-color: var(--hf-border); background: var(--hf-bg-soft); color: var(--hf-text); }
.hf-mini-btn svg { opacity: .8; }
.hf-mini-btn .hf-dot { width: 5px; height: 5px; }
.hf-icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--hf-muted);
  cursor: pointer;
  transition: background .16s ease, color .16s ease, border-color .16s ease;
}
.hf-icon-btn:hover:not(:disabled), .hf-icon-btn[aria-expanded="true"] {
  border-color: var(--hf-border);
  background: var(--hf-bg-soft);
  color: var(--hf-text);
}
.hf-icon-btn:disabled { opacity: .4; cursor: default; }
.hf-menu {
  position: absolute;
  z-index: 20;
  top: 42px;
  right: 0;
  min-width: 158px;
  padding: 5px;
  border: 1px solid var(--hf-border);
  border-radius: 10px;
  background: var(--hf-bg);
  box-shadow: var(--hf-shadow-menu);
  animation: hf-drop-in .16s cubic-bezier(.2, .8, .2, 1);
}
.hf-menu > button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hf-text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.hf-menu > button:hover:not(:disabled) { background: var(--hf-hover); }
.hf-menu > button:focus-visible {
  outline: 2px solid var(--hf-brand, #2d6cdf);
  outline-offset: -2px;
}
.hf-menu > button.danger { color: var(--hf-danger); }
.hf-menu > button:disabled { opacity: .4; cursor: default; }
.hf-menu-confirm { padding: 8px 9px 6px; }
.hf-menu-confirm p { margin: 0 0 9px; color: var(--hf-muted); font-size: 11px; line-height: 1.5; }
.hf-menu-actions { display: flex; gap: 6px; justify-content: flex-end; }
.hf-inline-panel {
  grid-column: 1 / -1;
  margin-top: 2px;
  padding: 11px;
  border: 1px solid var(--hf-border);
  border-radius: 10px;
  background: var(--hf-bg-soft);
  animation: hf-drop-in .18s cubic-bezier(.2, .8, .2, 1);
}
.hf-inline-panel .hf-help { margin-top: 6px; }
.hf-prefs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  margin-top: 2px;
  border-top: 1px solid var(--hf-border);
}
.hf-pref {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 64px;
  padding: 11px 18px;
}
.hf-pref + .hf-pref { border-left: 1px solid var(--hf-border); }
.hf-pref-copy { min-width: 0; }
.hf-pref-title { font-size: 12px; font-weight: 600; line-height: 1.35; }
.hf-pref-desc { margin-top: 2px; color: var(--hf-muted); font-size: 11px; line-height: 1.45; }
.hf-switch {
  position: relative;
  flex: 0 0 auto;
  width: 40px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--hf-bg-sunken);
  cursor: pointer;
  transition: background .18s ease;
}
.hf-switch.on { background: var(--hf-success); }
.hf-switch:disabled { opacity: .45; cursor: default; }
.hf-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .2);
  transition: transform .18s cubic-bezier(.2, .8, .2, 1);
}
.hf-switch.on .hf-switch-knob { transform: translateX(16px); }
.hf-models-panel {
  padding: 14px 18px 16px;
  border-top: 1px solid var(--hf-border);
  animation: hf-drop-in .2s cubic-bezier(.2, .8, .2, 1);
}
.hf-models-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hf-models-title { font-size: 12px; font-weight: 600; line-height: 1.35; }
.hf-models-sub { margin-top: 2px; color: var(--hf-muted); font-size: 11px; line-height: 1.45; }
.hf-model-tools { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.hf-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 210px;
  min-width: 150px;
}
.hf-search > svg { position: absolute; left: 9px; color: var(--hf-faint); pointer-events: none; }
.hf-search .hf-input { height: 32px; padding-left: 29px; padding-right: 28px; }
.hf-search-clear {
  position: absolute;
  right: 4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hf-faint);
  cursor: pointer;
}
.hf-search-clear:hover { background: var(--hf-hover); color: var(--hf-text); }
.hf-link-btn {
  min-height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hf-muted);
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}
.hf-link-btn:hover:not(:disabled) { background: var(--hf-hover); color: var(--hf-text); }
.hf-link-btn:disabled { opacity: .4; cursor: default; }
.hf-model-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px 14px;
  max-height: 264px;
  margin-top: 7px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.hf-model-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 3px;
  border-bottom: 1px solid var(--hf-border);
  color: var(--hf-text);
  cursor: pointer;
  user-select: none;
}
.hf-model-item:hover { background: var(--hf-hover); }
.hf-model-item input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.hf-check {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  border: 1px solid var(--hf-border-strong);
  border-radius: 4px;
  background: var(--hf-bg);
  color: transparent;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.hf-model-item input:checked + .hf-check { border-color: var(--hf-brand); background: var(--hf-brand); color: #fff; }
.hf-model-item input:focus-visible + .hf-check { outline: 2px solid var(--hf-brand); outline-offset: 2px; }
.hf-model-item.off .hf-model-name { color: var(--hf-faint); }
.hf-model-item.filtered { opacity: .62; }
.hf-filter-note {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(148, 98, 0, .07);
  color: var(--hf-muted);
  font-size: 11px;
  line-height: 1.45;
}
.hf-model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
}
.hf-model-tag {
  flex: 0 0 auto;
  color: var(--hf-muted);
  font-size: 11px;
  font-weight: 550;
}
.hf-model-tag.free { color: var(--hf-success); }
.hf-empty-line { margin: 14px 0 2px; color: var(--hf-faint); font-size: 11.5px; text-align: center; }
.hf-foot {
  margin: 14px 2px 0;
  color: var(--hf-faint);
  font-size: 11px;
  line-height: 1.55;
}
.hf-toast {
  position: fixed;
  z-index: 80;
  left: 50%;
  bottom: 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100vw - 40px));
  padding: 9px 13px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 10px;
  background: var(--hf-text);
  color: var(--hf-bg);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .22);
  font-size: 12px;
  line-height: 1.35;
  transform: translateX(-50%);
  animation: hf-toast-in .2s cubic-bezier(.2, .8, .2, 1);
}
.hf-toast.error { background: var(--hf-danger); color: #fff; }
.hf-toast svg { flex: 0 0 auto; }
.hf-skeleton-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; padding: 5px; border: 1px solid var(--hf-border); border-radius: 14px; background: var(--hf-bg-soft); }
.hf-skel {
  overflow: hidden;
  border-radius: 8px;
  background: var(--hf-bg-sunken);
  position: relative;
}
.hf-skel::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .28), transparent);
  transform: translateX(-100%);
  animation: hf-shimmer 1.3s ease-in-out infinite;
}
.hf-dark .hf-skel::after { background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .07), transparent); }
.hf-skel-tab { height: 50px; }
.hf-panel-skeleton { margin-top: 12px; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.hf-skel-head { width: 42%; height: 38px; }
.hf-skel-row { width: 100%; height: 54px; }
.hf-skel-row.short { width: 72%; }
@keyframes hf-panel-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@keyframes hf-drop-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
@keyframes hf-toast-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes hf-spin { to { transform: rotate(360deg); } }
@keyframes hf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes hf-shimmer { 100% { transform: translateX(100%); } }
@media (max-width: 640px) {
  .hf-head { gap: 12px; }
  .hf-methods { grid-template-columns: 1fr; max-width: 360px; }
  .hf-privacy { display: none; }
  .hf-tab { flex-direction: column; align-items: flex-start; gap: 5px; padding: 9px 7px; min-height: 66px; }
  .hf-tab-copy { width: 100%; }
  .hf-tab-meta { display: none; }
  .hf-tab-dot { position: absolute; top: 12px; right: 10px; }
  .hf-tab { position: relative; }
  .hf-channel-head { flex-wrap: wrap; align-items: flex-start; }
  .hf-channel-actions { width: 100%; margin-top: 2px; }
  .hf-channel-actions .hf-btn { width: 100%; }
  .hf-account { grid-template-columns: minmax(0, 1fr); }
  .hf-account-main { padding-right: 42px; }
  .hf-account-side { position: absolute; top: 14px; right: 0; margin-top: 0; }
  .hf-prefs { grid-template-columns: 1fr; }
  .hf-pref + .hf-pref { border-top: 1px solid var(--hf-border); border-left: 0; }
  .hf-model-grid { grid-template-columns: 1fr; }
  .hf-menu { top: 38px; }
  .hf-quota-line { flex-wrap: wrap; gap: 2px 12px; }
  .hf-quota-value { width: 100%; text-align: left; white-space: normal; }
  .hf-quota-amount { white-space: nowrap; }
  .hf-account-actions { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) {
  .hf-wrap *, .hf-wrap *::before, .hf-wrap *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
`

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

  const showToast = (tone: Toast['tone'], message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setToast({ tone, message })
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }

  const reveal = (selector: string) => {
    window.setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
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
    try {
      const body = await json<{ channels: Channel[] }>(
        `/dsh-hitchfin/state${withQuota ? '' : '?quota=0'}`,
      )
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
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (withQuota) setQuotaReady(true)
    }
  }

  useEffect(() => {
    void refresh(false)
    const timer = window.setTimeout(() => {
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
          setCode('')
          setCompose(null)
          setSecretValue('')
          setSecretError('')
          showToast('success', T('账号已连接', 'Account connected'))
          void refresh(false)
          window.setTimeout(() => {
            void refresh(true)
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
  const channelLogin = login && channel && login.channelId === channel.id ? login : null
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
        window.setTimeout(() => {
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
    // Drop both the canonical name and any legacy id so a toggle always flips.
    const cleaned = previous.filter((token) => token !== key && token !== model.id)
    void persistHidden(target, wasHidden ? cleaned : [...cleaned, key], previous)
  }

  const persistEnabled = async (target: Channel, accountId: string, enabled: boolean) => {
    if (busy !== '') return
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
    } catch (err) {
      setChannels(apply(!enabled))
      showToast('error', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const persistOrder = async (target: Channel, ordered: Account[], previous: Account[]) => {
    if (busy !== '') return
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

  const showAllModels = (target: Channel) => {
    void persistHidden(target, [], [...(target.hiddenModels ?? [])], T('已显示全部模型', 'All models shown'))
  }

  const hidePaidModels = (target: Channel) => {
    const previous = [...(target.hiddenModels ?? [])]
    const next = [
      ...new Set([
        ...previous,
        ...target.allModels
          .filter((model) => model.freeKnown === true && !model.free)
          .map((model) => normalizedModelName(model.name)),
      ]),
    ]
    if (next.length === previous.length) {
      showToast('success', T('没有需要隐藏的付费模型', 'No paid models to hide'))
      return
    }
    void persistHidden(
      target,
      next,
      previous,
      T(`已隐藏 ${next.length - previous.length} 个付费模型`, `Hid ${next.length - previous.length} paid models`),
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
      window.setTimeout(() => {
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
                  {channelLogin.url ? (
                    <a
                      className={`hf-btn ${channelLogin.autoOpened ? 'ghost small' : 'primary small'}`}
                      href={channelLogin.url}
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
                      {T(' 创建 PAT。', '')}
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
                      className={`hf-switch${account.enabled === false ? '' : ' on'}`}
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
                        }`,
                        `${visibleTotal} available · ${channel.allModels.length - hiddenCount} enabled${
                          hiddenCount ? ` · ${hiddenCount} hidden` : ''
                        }`,
                      )}
                    </div>
                  </div>
                  {modelBusy ? <span className="hf-spinner" aria-label={T('保存中', 'Saving')} /> : null}
                </div>
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
                  <button
                    type="button"
                    className="hf-link-btn"
                    disabled={modelBusy || hiddenCount === 0}
                    onClick={() => showAllModels(channel)}
                  >
                    {T('取消隐藏', 'Clear hidden')}
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
