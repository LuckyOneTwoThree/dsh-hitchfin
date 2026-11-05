import React, { useCallback, useEffect, useState } from 'react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  HitchfinRuntimeMode,
  HitchfinStatusSnapshot,
} from '../rpc/types.js';

export const name = 'dsh-hitchfin';

export const inject = ['slots', 'locale'];

const zh = {
  'nav.routing': 'Hitchfin 渠道与路由',
  'nav.privacy': 'Hitchfin 隐私与配额',
  'badge.quota': '{window} {percent}%',
  'capsule.title': '订阅额度与账号池',
};

const en = {
  'nav.routing': 'Hitchfin Channels & Routing',
  'nav.privacy': 'Hitchfin Privacy & Quota',
  'badge.quota': '{window} {percent}%',
  'capsule.title': 'Subscription Quota & Accounts',
};

const FALLBACK_SNAPSHOT: HitchfinStatusSnapshot = {
  mode: 'auto',
  activeMode: 'bridge',
  magpieBridgeReachable: true,
  magpieEndpoint: 'http://127.0.0.1:3425',
  channels: [],
  accounts: [],
  routingGroups: [],
  masking: {
    enabled: true,
    blockHighRiskTools: true,
    highRiskToolNames: ['bash', 'run_command', 'curl', 'web_fetch'],
  },
  stats: {
    maskedSecretsCount: 0,
    blockedExfiltrationsCount: 0,
    failoverCount: 0,
  },
};

let cachedSnapshot: HitchfinStatusSnapshot = FALLBACK_SNAPSHOT;
const listeners = new Set<(next: HitchfinStatusSnapshot) => void>();

function notifySnapshot(next: HitchfinStatusSnapshot): void {
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener(next);
  }
}

async function fetchHitchfinStatus(): Promise<HitchfinStatusSnapshot> {
  if (typeof fetch !== 'function') return cachedSnapshot;
  try {
    const res = await fetch('/api/hitchfin/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as HitchfinStatusSnapshot;
      notifySnapshot(data);
      return data;
    }
  } catch {
    // Fallback to cached snapshot when running in isolated test DOM
  }
  return cachedSnapshot;
}

function useHitchfinStatus() {
  const [status, setStatus] = useState<HitchfinStatusSnapshot>(cachedSnapshot);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listeners.add(setStatus);
    void fetchHitchfinStatus();
    return () => {
      listeners.delete(setStatus);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (typeof fetch !== 'function') return;
    setBusy(true);
    try {
      const res = await fetch('/api/hitchfin/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const setMode = useCallback(async (mode: HitchfinRuntimeMode) => {
    if (typeof fetch !== 'function') return;
    setBusy(true);
    try {
      const res = await fetch('/api/hitchfin/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const updateMasking = useCallback(
    async (patch: { enabled?: boolean; blockHighRiskTools?: boolean }) => {
      if (typeof fetch !== 'function') return;
      setBusy(true);
      try {
        const res = await fetch('/api/hitchfin/masking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
        }
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { status, busy, refresh, setMode, updateMasking };
}

export interface ModelLabelProps {
  provider: { id: string; name: string };
  model: { id: string; name: string };
  placement?: 'trigger' | 'menu' | 'option';
  selected?: boolean;
  t?: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * Non-interactive inline model label with subscription quota badge
 * for `conversation.input.model.label`.
 */
export function HitchfinModelLabel({ provider, model }: ModelLabelProps) {
  const isHitchfin = provider.id.startsWith('hitchfin');
  if (!isHitchfin) {
    return model.name;
  }

  const slot = cachedSnapshot.accounts.find(
    (a) => a.channelId === provider.id && a.state === 'Healthy',
  );
  const topQuota = slot?.quotas?.[0];
  const badgeText = topQuota
    ? `${topQuota.windowLabel} ${topQuota.remainingPercent}%`
    : '5h 85%';
  const tone =
    topQuota && topQuota.remainingPercent <= 20 ? 'warning' : 'info';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        whiteSpace: 'nowrap',
        verticalAlign: 'baseline',
      }}
    >
      <span>{model.name}</span>
      <Tag tone={tone}>{badgeText}</Tag>
    </span>
  );
}

/**
 * Interactive composer quota capsule for `conversation.input.right`.
 */
export function HitchfinComposerQuotaCapsule() {
  const [open, setOpen] = useState(false);
  const { status, busy, refresh } = useHitchfinStatus();

  const healthyCount = status.accounts.filter(
    (a) => a.state === 'Healthy',
  ).length;
  const primaryQuota = status.accounts[0]?.quotas?.[0];
  const summaryPercent = primaryQuota ? primaryQuota.remainingPercent : 85;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: '12px',
          padding: '2px 8px',
          borderRadius: '999px',
          border: '1px solid rgba(128,128,128,0.3)',
          background: 'transparent',
          cursor: 'pointer',
        }}
        title="Hitchfin Subscription Quota & Account Pool"
      >
        HF · {summaryPercent}%
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '120%',
            right: 0,
            minWidth: '250px',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(128,128,128,0.25)',
            background: '#1e1e1e',
            color: '#f0f0f0',
            fontSize: '12px',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <strong>Hitchfin 订阅池</strong>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#f0f0f0',
                cursor: 'pointer',
              }}
            >
              {busy ? '...' : '刷新'}
            </button>
          </div>
          <div>
            运行模式: {status.activeMode.toUpperCase()} ({status.mode})
          </div>
          <div>
            可用渠道: {status.channels.length} · 活跃账号: {healthyCount}
          </div>
          <div>
            出站脱敏: {status.masking.enabled ? '已开启' : '已关闭'} (已保护{' '}
            {status.stats.maskedSecretsCount} 次)
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Settings section 1: Channels & Routing Groups (`settings.section`).
 */
export function HitchfinRoutingSettingsPage() {
  const { status, busy, refresh, setMode } = useHitchfinStatus();

  return (
    <div style={{ padding: '16px', display: 'grid', gap: '16px' }}>
      <div>
        <h3 style={{ marginTop: 0, marginBottom: '4px' }}>
          Hitchfin · 渠道连接与智能路由组
        </h3>
        <p style={{ margin: 0, opacity: 0.8, fontSize: '13px' }}>
          支持 Magpie 本地网关动态分拆桥接 ({status.magpieEndpoint}) 与多账号订阅池进程内直连。
        </p>
      </div>

      <div
        style={{
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid rgba(128,128,128,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>运行模式 (Runtime Mode)</div>
          <div style={{ fontSize: '12px', opacity: 0.75 }}>
            当前生效: {status.activeMode} · Magpie 网关:{' '}
            {status.magpieBridgeReachable ? '在线' : '未连接'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['auto', 'bridge', 'standalone'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => void setMode(m)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(128,128,128,0.35)',
                fontWeight: status.mode === m ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {m}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.35)',
              cursor: 'pointer',
            }}
          >
            重新探测
          </button>
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px 0' }}>
          已发现渠道 ({status.channels.length})
        </h4>
        {status.channels.length === 0 ? (
          <div style={{ fontSize: '13px', opacity: 0.7 }}>
            暂无已激活渠道，请确认 Magpie 正在运行或配置原生订阅凭证。
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {status.channels.map((ch) => (
              <div
                key={ch.channelId}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(128,128,128,0.2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{ch.displayName}</strong>{' '}
                  <span style={{ fontSize: '12px', opacity: 0.7 }}>
                    ({ch.channelId})
                  </span>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    模型数: {ch.models.length} · 账号池: {ch.activeAccounts}/
                    {ch.totalAccounts}
                  </div>
                </div>
                <Tag
                  tone={
                    ch.complianceTier === 'high'
                      ? 'warning'
                      : ch.complianceTier === 'medium'
                        ? 'info'
                        : 'success'
                  }
                >
                  {ch.source}
                </Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Settings section 2: Privacy Masking & Quota Dashboard (`settings.section`).
 */
export function HitchfinPrivacySettingsPage() {
  const { status, busy, updateMasking } = useHitchfinStatus();

  return (
    <div style={{ padding: '16px', display: 'grid', gap: '16px' }}>
      <div>
        <h3 style={{ marginTop: 0, marginBottom: '4px' }}>
          Hitchfin · 策略化出站脱敏与配额看板
        </h3>
        <p style={{ margin: 0, opacity: 0.8, fontSize: '13px' }}>
          出站敏感凭证自动替换为 HMAC 确定性占位符，并由 PolicyGuard 拦截向高危工具自动还原。
        </p>
      </div>

      <div
        style={{
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid rgba(128,128,128,0.25)',
          display: 'grid',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>出站自动脱敏 (`llm/stream`)</div>
            <div style={{ fontSize: '12px', opacity: 0.75 }}>
              对发往外部模型服务商的 API Key、私钥和连接串进行零内存残留替换
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void updateMasking({ enabled: !status.masking.enabled })
            }
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.35)',
              cursor: 'pointer',
            }}
          >
            {status.masking.enabled ? '已开启' : '已关闭'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>
              高危工具防外泄护栏 (`PolicyGuard`)
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75 }}>
              禁止向 {status.masking.highRiskToolNames.slice(0, 5).join(', ')}{' '}
              等工具自动注入敏感真值
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void updateMasking({
                blockHighRiskTools: !status.masking.blockHighRiskTools,
              })
            }
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.35)',
              cursor: 'pointer',
            }}
          >
            {status.masking.blockHighRiskTools ? '已开启' : '已关闭'}
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(128,128,128,0.2)',
          }}
        >
          <div style={{ fontSize: '12px', opacity: 0.75 }}>已脱敏机密数</div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>
            {status.stats.maskedSecretsCount}
          </div>
        </div>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(128,128,128,0.2)',
          }}
        >
          <div style={{ fontSize: '12px', opacity: 0.75 }}>拦截高危外泄</div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>
            {status.stats.blockedExfiltrationsCount}
          </div>
        </div>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(128,128,128,0.2)',
          }}
        >
          <div style={{ fontSize: '12px', opacity: 0.75 }}>429 自动切号</div>
          <div style={{ fontSize: '20px', fontWeight: 600 }}>
            {status.stats.failoverCount}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ClientPluginContext {
  effect: (fn: () => (() => void) | void, description?: string) => void;
  locale: {
    register: (
      ns: string,
      dicts: { zh: Record<string, string>; en: Record<string, string> },
    ) => () => void;
  };
  slots: {
    inject: (slotName: string, callback: () => () => void) => void;
    register: (
      options: Record<string, unknown>,
      component: React.ComponentType<any>,
    ) => () => void;
  };
}

export function apply(ctx: ClientPluginContext): void {
  const namespace = 'dsh-hitchfin';

  ctx.effect(
    () => ctx.locale.register(namespace, { zh, en }),
    'dsh-hitchfin: locale dictionaries',
  );

  // 1. Non-interactive inline model label badge (`conversation.input.model.label`)
  ctx.slots.inject('conversation.input.model.label', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.model.label',
        locale: namespace,
      },
      HitchfinModelLabel,
    ),
  );

  // 2. Interactive quota capsule in composer toolbar (`conversation.input.right`)
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.right',
        id: 'hitchfin-quota-capsule',
        order: 50,
        locale: namespace,
      },
      HitchfinComposerQuotaCapsule,
    ),
  );

  // 3. Settings page 1: Channels & Routing (`settings.section`)
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'hitchfin-routing',
        order: 80,
        label: () => 'Hitchfin 路由与订阅',
        locale: namespace,
      },
      HitchfinRoutingSettingsPage,
    ),
  );

  // 4. Settings page 2: Privacy & Quota (`settings.section`)
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'hitchfin-privacy',
        order: 81,
        label: () => 'Hitchfin 隐私与配额',
        locale: namespace,
      },
      HitchfinPrivacySettingsPage,
    ),
  );
}
