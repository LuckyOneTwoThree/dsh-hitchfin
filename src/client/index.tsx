import React, { useCallback, useEffect, useState } from 'react';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  type ChannelPreset,
  CHANNEL_PRESETS,
  type DiscoveredSubscriptionSummary,
  type HitchfinRuntimeMode,
  type HitchfinStatusSnapshot,
  type RoutingStrategy,
} from '../rpc/types.js';

export const name = 'dsh-hitchfin';

export const inject = ['slots', 'locale'];

const zh = {
  'nav.unified': 'Hitchfin 订阅与路由',
  'badge.quota': '{window} {percent}%',
  'capsule.title': '订阅额度与账号池',
};

const en = {
  'nav.unified': 'Hitchfin Subscriptions & Routing',
  'badge.quota': '{window} {percent}%',
  'capsule.title': 'Subscription Quota & Accounts',
};

const FALLBACK_SNAPSHOT: HitchfinStatusSnapshot = {
  mode: 'auto',
  activeMode: 'standalone',
  magpieBridgeReachable: false,
  magpieEndpoint: 'http://127.0.0.1:3425',
  defaultStrategy: 'smart',
  presets: CHANNEL_PRESETS,
  discoveredSubscriptions: [],
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
    // Fallback to cached snapshot
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

  const addAccount = useCallback(
    async (params: {
      channelId: string;
      slotId?: string;
      label: string;
      authType?: 'api-key' | 'oauth' | 'bearer';
      apiKey?: string;
      accessToken?: string;
      baseUrl?: string;
      models?: string[];
    }) => {
      if (typeof fetch !== 'function') return;
      setBusy(true);
      try {
        const res = await fetch('/api/hitchfin/account/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (res.ok) {
          notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
          return true;
        }
        const err = await res.json().catch(() => ({ error: '添加账号失败' }));
        throw new Error(err.error || '添加账号失败');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const removeAccount = useCallback(
    async (channelId: string, slotId: string) => {
      if (typeof fetch !== 'function') return;
      setBusy(true);
      try {
        const res = await fetch('/api/hitchfin/account/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, slotId }),
        });
        if (res.ok) {
          notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
          return true;
        }
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const updateStrategy = useCallback(async (strategy: RoutingStrategy) => {
    if (typeof fetch !== 'function') return;
    setBusy(true);
    try {
      const res = await fetch('/api/hitchfin/routing/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      });
      if (res.ok) {
        notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const importSubscriptions = useCallback(
    async (accountIds: string[] | 'all') => {
      if (typeof fetch !== 'function') throw new Error('fetch unavailable');
      setBusy(true);
      try {
        const res = await fetch('/api/hitchfin/import-subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            accountIds === 'all' ? { all: true } : { accountIds },
          ),
        });
        if (res.ok) {
          notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
          return true;
        }
        const err = await res.json().catch(() => ({ error: `同步失败 (${res.status})` }));
        throw new Error(err.error || `同步失败 (${res.status})`);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const updateModels = useCallback(
    async (channelId: string, slotId: string, models: string[]) => {
      if (typeof fetch !== 'function') throw new Error('fetch unavailable');
      setBusy(true);
      try {
        const res = await fetch('/api/hitchfin/account/update-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, slotId, models }),
        });
        if (res.ok) {
          notifySnapshot((await res.json()) as HitchfinStatusSnapshot);
          return true;
        }
        const err = await res.json().catch(() => ({ error: `更新模型失败 (${res.status})` }));
        throw new Error(err.error || `更新模型失败 (${res.status})`);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const startCopilotAuth = useCallback(async () => {
    if (typeof fetch !== 'function') throw new Error('fetch unavailable');
    const res = await fetch('/api/hitchfin/auth/copilot/device-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) {
      return (await res.json()) as {
        deviceCode: string;
        userCode: string;
        verificationUri: string;
        expiresIn: number;
        interval: number;
      };
    }
    const err = await res.json().catch(() => ({ error: '启动 GitHub Copilot 认证失败' }));
    throw new Error(err.error || '启动 GitHub Copilot 认证失败');
  }, []);

  const pollCopilotAuth = useCallback(async (deviceCode: string) => {
    if (typeof fetch !== 'function') throw new Error('fetch unavailable');
    const res = await fetch('/api/hitchfin/auth/copilot/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        status: 'pending' | 'authorized' | 'expired' | 'error';
        accessToken?: string;
        error?: string;
      };
      if (data.status === 'authorized') {
        void fetchHitchfinStatus();
      }
      return data;
    }
    const err = await res.json().catch(() => ({ error: '轮询 Copilot 状态异常' }));
    throw new Error(err.error || '轮询 Copilot 状态异常');
  }, []);

  return {
    status,
    busy,
    refresh,
    setMode,
    updateMasking,
    addAccount,
    removeAccount,
    updateStrategy,
    importSubscriptions,
    updateModels,
    startCopilotAuth,
    pollCopilotAuth,
  };
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
    (a) =>
      (a.channelId === provider.id ||
        `hitchfin-${a.channelId}` === provider.id) &&
      a.state === 'Healthy',
  );
  const topQuota = slot?.quotas?.[0];
  const badgeText = topQuota
    ? topQuota.remainingPercent < 100
      ? `${topQuota.windowLabel}`
      : (topQuota.windowLabel || '套餐可用')
    : '套餐可用';
  const tone =
    topQuota && topQuota.remainingPercent <= 20 ? 'warning' : 'success';

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
  const summaryPercent = primaryQuota ? primaryQuota.remainingPercent : 100;

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
        title="Hitchfin 官方套餐额度与订阅池"
      >
        HF 套餐 · {summaryPercent}%
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '120%',
            right: 0,
            minWidth: '270px',
            padding: '12px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(128,128,128,0.25)',
            background: 'var(--dsw-alias-bg-layer-2, #1e1e1e)',
            color: 'var(--dsw-alias-text-primary, #f0f0f0)',
            fontSize: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <strong>官方套餐订阅池</strong>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(128,128,128,0.3)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              {busy ? '...' : '刷新'}
            </button>
          </div>
          <div style={{ marginBottom: '4px' }}>
            已接入套餐账号: {status.accounts.length} · 正常可用: {healthyCount}
          </div>
          <div style={{ marginBottom: '4px' }}>
            调度策略: {status.defaultStrategy ?? 'smart'}
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

interface AccountModelEditorProps {
  channelId: string;
  slotId: string;
  label: string;
  currentModels: string[];
  candidateModels: string[];
  defaultModels: string[];
  onSave: (models: string[]) => Promise<void>;
  onClose: () => void;
}

function AccountModelEditor({
  currentModels,
  candidateModels,
  defaultModels,
  onSave,
  onClose,
}: AccountModelEditorProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentModels && currentModels.length > 0 ? currentModels : defaultModels),
  );
  const [search, setSearch] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const allAvailable = Array.from(
    new Set([...candidateModels, ...currentModels, ...defaultModels]),
  );

  const filtered = allAvailable.filter((m) =>
    m.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const toggleModel = (m: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allAvailable));
  const clearAll = () => setSelected(new Set());
  const resetDefaults = () => setSelected(new Set(defaultModels));

  const handleAddCustom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customModel.trim();
    if (!trimmed) return;
    setSelected((prev) => new Set([...prev, trimmed]));
    setCustomModel('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await onSave(Array.from(selected));
      setSaveMsg('✓ 已成功保存并在 DSH 模型列表生效！');
      setTimeout(() => {
        setSaveMsg('');
        onClose();
      }, 1200);
    } catch (err) {
      setSaveMsg(`⚠️ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '14px',
        borderRadius: '8px',
        border: '1.5px solid #10b981',
        background: 'var(--dsw-alias-bg-layer-1, #1e1e1e)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: '0 4px 12px rgba(16,185,129,0.12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>⚙️ 自定义要在 DSH 模型列表展示的模型</span>
          <span style={{ fontSize: '11px', opacity: 0.75 }}>
            (已选 {selected.size} / 共 {allAvailable.length} 个候选)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={selectAll}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: 'transparent',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            全选
          </button>
          <button
            type="button"
            onClick={clearAll}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: 'transparent',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            清空
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: 'transparent',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            恢复推荐默认
          </button>
        </div>
      </div>

      {/* Filter search */}
      <input
        type="text"
        placeholder="🔍 搜索模型名称（如 flash、pro、seed、gpt-4o、claude...）"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '6px 10px',
          borderRadius: '4px',
          border: '1px solid rgba(128,128,128,0.3)',
          background: 'var(--dsw-alias-bg-layer-2, transparent)',
          color: 'inherit',
          fontSize: '12px',
        }}
      />

      {/* Candidate Checkboxes Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '4px',
          border: '1px solid rgba(128,128,128,0.15)',
          borderRadius: '6px',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '12px', fontSize: '12px', opacity: 0.6, gridColumn: '1 / -1', textAlign: 'center' }}>
            未找到匹配的模型，可在下方手动输入添加
          </div>
        ) : (
          filtered.map((m) => {
            const isChecked = selected.has(m);
            return (
              <label
                key={m}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  border: isChecked
                    ? '1px solid rgba(16,185,129,0.5)'
                    : '1px solid rgba(128,128,128,0.15)',
                  background: isChecked
                    ? 'rgba(16,185,129,0.1)'
                    : 'transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleModel(m)}
                  style={{ accentColor: '#10b981', cursor: 'pointer' }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: isChecked ? 600 : 400,
                    color: isChecked ? '#10b981' : 'inherit',
                  }}
                  title={m}
                >
                  {m}
                </span>
              </label>
            );
          })
        )}
      </div>

      {/* Add Custom Model */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="输入未在列表中的自定义模型标识 (如 qwen3-coder, gpt-4.5) 并添加"
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddCustom();
            }
          }}
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: '4px',
            border: '1px solid rgba(128,128,128,0.3)',
            background: 'var(--dsw-alias-bg-layer-2, transparent)',
            color: 'inherit',
            fontSize: '12px',
          }}
        />
        <button
          type="button"
          onClick={() => handleAddCustom()}
          style={{
            padding: '6px 14px',
            borderRadius: '4px',
            border: 'none',
            background: 'rgba(128,128,128,0.2)',
            color: 'inherit',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + 添加模型
        </button>
      </div>

      {saveMsg && (
        <div style={{ fontSize: '12px', color: saveMsg.startsWith('✓') ? '#10b981' : '#ef4444' }}>
          {saveMsg}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '5px 14px',
            borderRadius: '4px',
            border: '1px solid rgba(128,128,128,0.3)',
            background: 'transparent',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          取消
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          style={{
            padding: '5px 18px',
            borderRadius: '4px',
            border: 'none',
            background: '#10b981',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {saving ? '正在保存并在 DSH 生效...' : '💾 保存并在 DSH 模型选择列表生效'}
        </button>
      </div>
    </div>
  );
}

/**
 * Single Unified Settings Dashboard for AI Subscription Plans.
 * Connects directly to ChatGPT Plus/Team, Copilot, Trae, WorkBuddy, ZCode official subscriptions.
 */
export function HitchfinUnifiedSettingsDashboard() {
  const {
    status,
    busy,
    refresh,
    setMode,
    updateMasking,
    addAccount,
    removeAccount,
    updateStrategy,
    importSubscriptions,
    updateModels,
    startCopilotAuth,
    pollCopilotAuth,
  } = useHitchfinStatus();

  // Add Subscription Mode (defaults to open if no accounts configured yet)
  const [showAddForm, setShowAddForm] = useState(
    () => status.accounts.length === 0,
  );
  const [activeLoginTab, setActiveLoginTab] = useState<'oauth' | 'token'>('oauth');

  // Manual Token Form State
  const [selectedChannel, setSelectedChannel] = useState('codex');
  const [accountLabel, setAccountLabel] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState('https://api.openai.com/v1');
  const [modelsInput, setModelsInput] = useState('gpt-4o, gpt-4o-mini, o1, o3-mini');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Active Model Editor Slot
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);

  // Sync Progress State
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);

  // Copilot Device Code State
  const [copilotFlow, setCopilotFlow] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    status: 'idle' | 'waiting' | 'success' | 'expired' | 'error';
    errorMsg?: string;
  } | null>(null);

  // Advanced section collapse state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Handle Channel Preset Select
  const handleChannelChange = (channelId: string) => {
    setSelectedChannel(channelId);
    const preset = CHANNEL_PRESETS.find((p) => p.channelId === channelId);
    if (preset) {
      setBaseUrlInput(preset.defaultBaseUrl);
      setModelsInput(preset.defaultModels.join(', '));
      setAccountLabel(preset.name);
    }
  };

  // Import individual discovered account
  const handleImportSingleDiscovered = async (id: string, name: string) => {
    setImportingId(id);
    setFormError('');
    setFormSuccess('');
    try {
      await importSubscriptions([id]);
      setFormSuccess(`✓ 已成功同步官方套餐账号：${name}！已挂载至 DSH 模型列表。`);
      setTimeout(() => setFormSuccess(''), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingId(null);
    }
  };

  // One-click import discovered accounts
  const handleImportAllDiscovered = async () => {
    setImportingAll(true);
    setFormSuccess('');
    setFormError('');
    try {
      await importSubscriptions('all');
      setFormSuccess('✓ 已成功同步本机全部官方套餐订阅！所有模型已挂载至 DSH 聊天输入框。');
      setTimeout(() => setFormSuccess(''), 4500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingAll(false);
    }
  };

  // Launch GitHub Copilot Device Code Flow
  const handleStartCopilot = async () => {
    setFormError('');
    setFormSuccess('');
    try {
      const res = await startCopilotAuth();
      setCopilotFlow({
        userCode: res.userCode,
        verificationUri: res.verificationUri,
        deviceCode: res.deviceCode,
        status: 'waiting',
      });

      // Try opening browser
      if (typeof window !== 'undefined' && window.open) {
        window.open(res.verificationUri, '_blank');
      }

      // Start background polling
      const pollTimer = setInterval(async () => {
        try {
          const poll = await pollCopilotAuth(res.deviceCode);
          if (poll.status === 'authorized') {
            clearInterval(pollTimer);
            setCopilotFlow((prev) =>
              prev ? { ...prev, status: 'success' } : null,
            );
            setFormSuccess('GitHub Copilot 订阅授权成功！已挂载至 DSH 模型列表。');
            setTimeout(() => {
              setCopilotFlow(null);
              setFormSuccess('');
            }, 3000);
          } else if (poll.status === 'expired' || poll.status === 'error') {
            clearInterval(pollTimer);
            const finalStatus: 'expired' | 'error' = poll.status === 'expired' ? 'expired' : 'error';
            setCopilotFlow((prev) =>
              prev
                ? {
                    ...prev,
                    status: finalStatus,
                    errorMsg: poll.error || '授权已超时，请重试',
                  }
                : null,
            );
          }
        } catch {
          // ignore transient poll error
        }
      }, (res.interval || 5) * 1000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle Manual Save
  const handleSaveManualAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!accountLabel.trim()) {
      setFormError('请输入账号标签或别名');
      return;
    }
    if (!sessionToken.trim()) {
      setFormError('请输入官方 Session Token / Refresh Token');
      return;
    }

    const preset = CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel);
    const models = modelsInput
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    try {
      await addAccount({
        channelId: selectedChannel,
        label: accountLabel.trim(),
        authType: 'oauth',
        accessToken: sessionToken.trim(),
        baseUrl: baseUrlInput.trim() || undefined,
        models: models.length > 0 ? models : undefined,
      });

      setFormSuccess('官方套餐账号绑定成功！已同步至 DSH 模型选择列表。');
      setSessionToken('');
      setTimeout(() => {
        setFormSuccess('');
        setShowAddForm(false);
      }, 1800);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const activeStrategy = status.defaultStrategy ?? 'smart';
  const discovered = status.discoveredSubscriptions ?? [];

  return (
    <div
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '960px',
        margin: '0 auto',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
      {/* 1. Header Bar: Title, Subtitle, Quick Metrics, Main Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid rgba(128,128,128,0.2)',
        }}
      >
        <div>
          <h2
            style={{
              margin: '0 0 6px 0',
              fontSize: '20px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>Hitchfin · 官方套餐订阅与智能路由</span>
            <Tag tone="success">套餐聚合</Tag>
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            原生聚合接入 ChatGPT Plus/Team、GitHub Copilot、字节 Trae、腾讯 WorkBuddy、智谱 GLM Coding Plan 等官方订阅套餐，直接以官方账号登录，无需购买按量 API Key。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(16,185,129,0.3)',
            }}
          >
            <span>{showAddForm ? '✕ 收起登录面板' : '➕ 接入官方订阅账号'}</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: 'transparent',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {busy ? '刷新中...' : '🔄 刷新状态'}
          </button>
        </div>
      </div>

      {/* Global Form Alerts - Positioned right at the top for immediate feedback */}
      {formError && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {formError}</span>
          <button
            type="button"
            onClick={() => setFormError('')}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}
      {formSuccess && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#10b981',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {formSuccess}</span>
          <button
            type="button"
            onClick={() => setFormSuccess('')}
            style={{
              background: 'none',
              border: 'none',
              color: '#10b981',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Discovered Local Official Subscriptions Notification Banner */}
      {discovered.length > 0 && (
        <div
          style={{
            padding: '16px',
            borderRadius: '10px',
            border: '1.5px solid #10b981',
            background: 'var(--dsw-alias-bg-layer-2, rgba(16,185,129,0.06))',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>✨ 发现本机已有 {discovered.length} 个官方套餐登录</span>
                <Tag tone="success">即插即用</Tag>
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>
                检测到本机已登录的 ChatGPT、Trae、WorkBuddy、ZCode 等官方账号凭证，可一键直接同步至 DSH 使用。
              </div>
            </div>

            <button
              type="button"
              disabled={busy || importingAll}
              onClick={() => void handleImportAllDiscovered()}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
              }}
            >
              {importingAll ? '⏳ 正在全量同步中...' : '一键同步全部已登录官方套餐'}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '10px',
            }}
          >
            {discovered.map((d) => {
              const isThisImporting = importingId === d.id;
              const quotaText = d.quotas?.[0]?.windowLabel || '套餐正常';
              const totalModels = d.candidateModels?.length ?? d.models.length;
              return (
                <div
                  key={d.id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(128,128,128,0.2)',
                    background: 'var(--dsw-alias-bg-layer-1, transparent)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>
                        {d.providerName}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'rgba(16,185,129,0.15)',
                          color: '#10b981',
                          fontWeight: 500,
                        }}
                      >
                        {quotaText}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                      账号: {d.user} · 套餐: {d.plan}
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.65, marginTop: '2px' }}>
                      推荐 {d.models.length} 个模型 (共 {totalModels} 个可选)
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || isThisImporting}
                    onClick={() => void handleImportSingleDiscovered(d.id, d.providerName)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '5px',
                      border: '1px solid #10b981',
                      background: isThisImporting ? 'rgba(16,185,129,0.2)' : 'transparent',
                      color: '#10b981',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isThisImporting ? '导入中...' : '单独导入'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Add Official Subscription Account Form */}
      {showAddForm && (
        <div
          style={{
            padding: '18px',
            borderRadius: '10px',
            border: '1px solid #10b981',
            background: 'var(--dsw-alias-bg-layer-2, rgba(16,185,129,0.03))',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: '0 4px 12px rgba(16,185,129,0.1)',
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
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                ➕ 接入官方套餐订阅账号 (Official Subscription)
              </h3>
              <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
                支持官方授权登录或绑定已登录的 Session Token，直连官方套餐通道
              </div>
            </div>

            {/* Mode Toggle Tabs */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(128,128,128,0.15)',
                borderRadius: '6px',
                padding: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveLoginTab('oauth')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: activeLoginTab === 'oauth' ? 600 : 400,
                  background:
                    activeLoginTab === 'oauth' ? '#10b981' : 'transparent',
                  color: activeLoginTab === 'oauth' ? '#ffffff' : 'inherit',
                  cursor: 'pointer',
                }}
              >
                官方授权登录
              </button>
              <button
                type="button"
                onClick={() => setActiveLoginTab('token')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: activeLoginTab === 'token' ? 600 : 400,
                  background:
                    activeLoginTab === 'token' ? '#10b981' : 'transparent',
                  color: activeLoginTab === 'token' ? '#ffffff' : 'inherit',
                  cursor: 'pointer',
                }}
              >
                绑定 Session Token
              </button>
            </div>
          </div>

          {activeLoginTab === 'oauth' ? (
            /* Mode A: Interactive Official Login Buttons */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '13px', opacity: 0.85 }}>
                选择要登录的官方平台，点击后将启动官方授权登录流程：
              </div>

              {/* Copilot Device Code Widget */}
              {copilotFlow ? (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1.5px solid #10b981',
                    background: 'var(--dsw-alias-bg-layer-1, #1e1e1e)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>
                    GitHub Copilot 设备授权
                  </div>
                  <div style={{ fontSize: '13px', opacity: 0.85 }}>
                    请在打开的 GitHub 页面中输入以下 8 位设备码完成授权：
                  </div>
                  <div
                    style={{
                      fontSize: '28px',
                      fontWeight: 700,
                      letterSpacing: '4px',
                      color: '#10b981',
                      padding: '8px 20px',
                      borderRadius: '8px',
                      background: 'rgba(16,185,129,0.1)',
                      userSelect: 'all',
                    }}
                  >
                    {copilotFlow.userCode}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.7 }}>
                    授权页面:{' '}
                    <a
                      href={copilotFlow.verificationUri}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#10b981' }}
                    >
                      {copilotFlow.verificationUri}
                    </a>
                  </div>
                  <div style={{ fontSize: '12px', color: '#10b981' }}>
                    {copilotFlow.status === 'waiting' &&
                      '⏳ 正在等待您在网页端确认授权（确认后将自动完成接入）...'}
                    {copilotFlow.status === 'success' && '✓ 授权成功！'}
                    {copilotFlow.status === 'expired' && '⚠️ 设备码已过期，请重新点击'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCopilotFlow(null)}
                    style={{
                      marginTop: '6px',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: '1px solid rgba(128,128,128,0.3)',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '10px',
                  }}
                >
                  <div
                    onClick={() => void handleStartCopilot()}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(128,128,128,0.25)',
                      background: 'var(--dsw-alias-bg-layer-1, transparent)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                      🐙 GitHub Copilot 官方授权
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.75 }}>
                      通过 GitHub 官方设备码授权，连接您的 Copilot 个人/企业订阅
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        color: '#10b981',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      点击开启设备码授权 →
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.open) {
                        window.open('https://www.trae.cn/authorization?login_version=1&auth_from=solo&login_channel=native_ide&client_id=ono9krqynydwx5&auth_type=local', '_blank');
                      }
                      setActiveLoginTab('token');
                      setSelectedChannel('trae-cn');
                      handleChannelChange('trae-cn');
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(128,128,128,0.25)',
                      background: 'var(--dsw-alias-bg-layer-1, transparent)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                      ⚡ 字节跳动 Trae 官方授权
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.75 }}>
                      跳转 Trae 官方授权页登录，获取 Trae 每日签到积分与模型套餐
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        color: '#10b981',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      打开 Trae 授权页 →
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      setActiveLoginTab('token');
                      setSelectedChannel('codex');
                      handleChannelChange('codex');
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(128,128,128,0.25)',
                      background: 'var(--dsw-alias-bg-layer-1, transparent)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                      💬 ChatGPT Plus / Team 订阅绑定
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.75 }}>
                      直接绑定已登录 ChatGPT 的 Session Token 或 Refresh Token
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        color: '#10b981',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      前往输入 Token →
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Mode B: Manual Session/Refresh Token Input */
            <form
              onSubmit={handleSaveManualAccount}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '14px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    官方套餐渠道
                  </label>
                  <select
                    value={selectedChannel}
                    onChange={(e) => handleChannelChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(128,128,128,0.3)',
                      background: 'var(--dsw-alias-bg-layer-1, transparent)',
                      color: 'inherit',
                      fontSize: '13px',
                    }}
                  >
                    {CHANNEL_PRESETS.map((p) => (
                      <option key={p.channelId} value={p.channelId}>
                        {p.name} ({p.planName})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '3px' }}>
                    {
                      CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel)
                        ?.description
                    }
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    账号标签 / 别名
                  </label>
                  <input
                    type="text"
                    placeholder="例如：ChatGPT Plus 个人主号、WorkBuddy 商业版"
                    value={accountLabel}
                    onChange={(e) => setAccountLabel(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(128,128,128,0.3)',
                      background: 'var(--dsw-alias-bg-layer-1, transparent)',
                      color: 'inherit',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                  }}
                >
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>
                    官方 Session Token / 刷新令牌 (Refresh Token)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '11px',
                      color: '#10b981',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showSecret ? '隐藏明文' : '显示明文'}
                  </button>
                </div>
                <input
                  type={showSecret ? 'text' : 'password'}
                  placeholder={
                    CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel)
                      ?.placeholder ?? '粘贴官方 Session Token 或 Refresh Token'
                  }
                  value={sessionToken}
                  onChange={(e) => setSessionToken(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(128,128,128,0.3)',
                    background: 'var(--dsw-alias-bg-layer-1, transparent)',
                    color: 'inherit',
                    fontSize: '13px',
                    fontFamily: showSecret ? 'monospace' : 'inherit',
                  }}
                />
                <div style={{ fontSize: '11px', opacity: 0.65, marginTop: '3px' }}>
                  提示：填入对应官方平台登录后颁发的 Session Token、Refresh Token 或 OAuth 令牌即可，凭证保存在本地加密凭据库。
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '14px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    官方接口服务地址
                  </label>
                  <input
                    type="text"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(128,128,128,0.3)',
                      background: 'var(--dsw-alias-bg-layer-1, transparent)',
                      color: 'inherit',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    挂载可用模型 (逗号分隔)
                  </label>
                  <input
                    type="text"
                    value={modelsInput}
                    onChange={(e) => setModelsInput(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(128,128,128,0.3)',
                      background: 'var(--dsw-alias-bg-layer-1, transparent)',
                      color: 'inherit',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end',
                  marginTop: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid rgba(128,128,128,0.3)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    padding: '6px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {busy ? '正在保存...' : '保存并连接官方套餐'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 4. Connected Subscription Accounts Pool Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            已连接官方套餐订阅池 ({status.accounts.length})
          </h3>
          <span style={{ fontSize: '12px', opacity: 0.7 }}>
            每个官方账号映射至 DSH 模型选择列表
          </span>
        </div>

        {status.accounts.length === 0 ? (
          <div
            style={{
              padding: '28px',
              textAlign: 'center',
              borderRadius: '8px',
              border: '1px dashed rgba(128,128,128,0.3)',
              background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
              💡 暂未连接任何官方套餐订阅
            </div>
            <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '14px' }}>
              点击上方【一键同步全部已登录官方套餐】或【➕ 接入官方订阅账号】，连接您的 ChatGPT、Copilot、Trae、WorkBuddy 等官方订阅！
            </div>
            {discovered.length > 0 && (
              <button
                type="button"
                onClick={() => void handleImportAllDiscovered()}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#10b981',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                立即同步本机发现的 {discovered.length} 个账号
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {status.accounts.map((acc) => {
              const preset = CHANNEL_PRESETS.find(
                (p) =>
                  p.channelId === acc.channelId ||
                  acc.channelId.includes(p.channelId),
              );
              const slotKey = `${acc.channelId}::${acc.slotId}`;
              const isEditingModels = editingSlotKey === slotKey;
              const quotaSnapshot = acc.quotas && acc.quotas.length > 0 ? acc.quotas[0] : undefined;
              const quotaLabel = quotaSnapshot?.windowLabel || '套餐可用 (无硬顶限制)';
              const enabledModels = acc.models && acc.models.length > 0 ? acc.models : ['默认模型'];
              const allCandidates = Array.from(
                new Set([
                  ...(acc.candidateModels ?? []),
                  ...(preset?.candidateModels ?? []),
                  ...(preset?.defaultModels ?? []),
                  ...enabledModels,
                ]),
              );

              return (
                <div
                  key={slotKey}
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(128,128,128,0.25)',
                    background:
                      'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.04))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '15px' }}>{acc.label}</strong>
                        <Tag tone={acc.state === 'Healthy' ? 'success' : 'warning'}>
                          {acc.state === 'Healthy' ? '🟢 套餐正常' : acc.state}
                        </Tag>
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>
                        服务商: {preset?.name ?? acc.channelId} · 套餐: {preset?.planName ?? '官方订阅'}
                      </div>
                      {acc.baseUrl && (
                        <div
                          style={{
                            fontSize: '11px',
                            opacity: 0.65,
                            fontFamily: 'monospace',
                            marginTop: '2px',
                          }}
                        >
                          接口: {acc.baseUrl}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSlotKey((prev) =>
                            prev === slotKey ? null : slotKey,
                          )
                        }
                        style={{
                          padding: '5px 12px',
                          borderRadius: '5px',
                          border: isEditingModels
                            ? '1.5px solid #10b981'
                            : '1px solid rgba(16,185,129,0.5)',
                          background: isEditingModels
                            ? 'rgba(16,185,129,0.15)'
                            : 'transparent',
                          color: '#10b981',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {isEditingModels
                          ? '✕ 收起模型配置'
                          : `⚙️ 自定义展示模型 (共 ${allCandidates.length} 个候选)`}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `确定要移除已连接的官方账号 "${acc.label}" 吗？`,
                            )
                          ) {
                            void removeAccount(acc.channelId, acc.slotId);
                          }
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '5px',
                          border: '1px solid rgba(239,68,68,0.3)',
                          background: 'transparent',
                          color: '#ef4444',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {/* Real Quota Display Banner */}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.08))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#10b981' }}>
                        📊 配额状态: {quotaLabel}
                      </span>
                      {quotaSnapshot && quotaSnapshot.remainingPercent < 100 && (
                        <Tag tone={quotaSnapshot.remainingPercent < 20 ? 'danger' : 'warning'}>
                          剩余 {quotaSnapshot.remainingPercent}%
                        </Tag>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', opacity: 0.65 }}>
                      最近使用: {acc.lastUsedAt ? new Date(acc.lastUsedAt).toLocaleTimeString() : '刚刚就绪'}
                    </span>
                  </div>

                  {/* Enabled Models List */}
                  <div>
                    <div style={{ fontSize: '12px', opacity: 0.75, marginBottom: '6px' }}>
                      当前在 DSH 启用的模型 ({enabledModels.length} 个):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {enabledModels.map((m) => (
                        <span
                          key={m}
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(16,185,129,0.12)',
                            color: '#10b981',
                            border: '1px solid rgba(16,185,129,0.3)',
                            fontWeight: 500,
                          }}
                        >
                          ✓ {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Model Visibility Editor (Expanded) */}
                  {isEditingModels && (
                    <AccountModelEditor
                      channelId={acc.channelId}
                      slotId={acc.slotId}
                      label={acc.label}
                      currentModels={acc.models ?? []}
                      candidateModels={allCandidates}
                      defaultModels={preset?.defaultModels ?? []}
                      onSave={async (newModels) => {
                        await updateModels(acc.channelId, acc.slotId, newModels);
                      }}
                      onClose={() => setEditingSlotKey(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Smart Routing Strategy Section */}
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid rgba(128,128,128,0.25)',
          background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600 }}>
            多账号智能调度与轮询策略
          </h3>
          <p style={{ margin: 0, fontSize: '12px', opacity: 0.75 }}>
            当同一个服务商下连接了多个官方账号（如多个 ChatGPT 或多个 Trae 账号）时，控制请求如何在各账号之间分发。
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
          }}
        >
          {[
            {
              id: 'smart',
              name: 'Smart 智能最优',
              desc: '优先额度最充沛、当前无延迟的账号',
            },
            {
              id: 'pace',
              name: 'Pace 平滑限速',
              desc: '自动平摊请求间隔，防止短时间突发 429',
            },
            {
              id: 'rotate',
              name: 'Rotate 均匀轮询',
              desc: '多个账号严格轮转，负载均衡分流',
            },
            {
              id: 'order',
              name: 'Order 故障转移',
              desc: '主账号优先，遇到异常自动切换备用账号',
            },
          ].map((item) => (
            <div
              key={item.id}
              onClick={() => void updateStrategy(item.id as RoutingStrategy)}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                border:
                  activeStrategy === item.id
                    ? '1.5px solid #10b981'
                    : '1px solid rgba(128,128,128,0.2)',
                background:
                  activeStrategy === item.id
                    ? 'rgba(16,185,129,0.08)'
                    : 'transparent',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  fontWeight: activeStrategy === item.id ? 600 : 500,
                  fontSize: '13px',
                  color: activeStrategy === item.id ? '#10b981' : 'inherit',
                  marginBottom: '2px',
                }}
              >
                {item.name}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.75 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Privacy & Policy Guard Section */}
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid rgba(128,128,128,0.25)',
          background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600 }}>
            出站隐私脱敏与安全外泄防护
          </h3>
          <p style={{ margin: 0, fontSize: '12px', opacity: 0.75 }}>
            在请求离开 DSH 发往外部官方服务商时，自动将代码或会话中的敏感凭证替换为 HMAC 占位符，并在流返回时安全还原。
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid rgba(128,128,128,0.15)',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>
              出站敏感凭据自动脱敏 (`llm/stream`)
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75 }}>
              发往模型提供商的请求中，自动脱敏密码、Key 和私钥，零内存泄漏
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void updateMasking({ enabled: !status.masking.enabled })
            }
            style={{
              padding: '4px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: status.masking.enabled
                ? 'rgba(16,185,129,0.15)'
                : 'transparent',
              color: status.masking.enabled ? '#10b981' : 'inherit',
              fontWeight: 600,
              fontSize: '12px',
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
            padding: '8px 0',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>
              高危工具自动阻断 (`PolicyGuard`)
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75 }}>
              拦截模型向 {status.masking.highRiskToolNames.slice(0, 4).join(', ')}{' '}
              等工具注入敏感真值，防止命令执行外泄
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
              padding: '4px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(128,128,128,0.3)',
              background: status.masking.blockHighRiskTools
                ? 'rgba(16,185,129,0.15)'
                : 'transparent',
              color: status.masking.blockHighRiskTools ? '#10b981' : 'inherit',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {status.masking.blockHighRiskTools ? '已开启' : '已关闭'}
          </button>
        </div>
      </div>

      {/* 7. Collapsible Advanced & Legacy Migration Section */}
      <div
        style={{
          borderRadius: '8px',
          border: '1px solid rgba(128,128,128,0.2)',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))',
            border: 'none',
            textAlign: 'left',
            fontSize: '12px',
            fontWeight: 500,
            opacity: 0.8,
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚙️ 高级选项与兼容迁移 (可选)</span>
          <span>{showAdvanced ? '▲' : '▼'}</span>
        </button>

        {showAdvanced && (
          <div
            style={{
              padding: '14px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              borderTop: '1px solid rgba(128,128,128,0.15)',
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
                <div style={{ fontWeight: 600 }}>运行模式</div>
                <div style={{ opacity: 0.75 }}>
                  推荐使用 Standalone 纯本地独立运行，完全不依赖任何外部网关。
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['standalone', 'auto', 'bridge'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={busy}
                    onClick={() => void setMode(m)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(128,128,128,0.3)',
                      fontWeight: status.mode === m ? 600 : 400,
                      background:
                        status.mode === m
                          ? 'rgba(16,185,129,0.15)'
                          : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '8px',
                borderTop: '1px solid rgba(128,128,128,0.1)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>重新检测本机官方登录</div>
                <div style={{ opacity: 0.75 }}>
                  重新扫描本机 Codex、Claude、Magpie 登录目录
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(128,128,128,0.3)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                重新扫描
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface ClientPluginContext {
  effect: (fn: () => (() => void) | void, description?: string) => void;
  inject?: (
    deps: string[],
    callback: (scoped: ClientPluginContext) => void,
  ) => void;
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

  // 3. Single Unified Settings Page (`settings.section`)
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'hitchfin',
        order: 80,
        label: () => 'Hitchfin 订阅与路由',
        locale: namespace,
      },
      HitchfinUnifiedSettingsDashboard,
    ),
  );

  // 4. Plugins page -> Installed -> dsh-hitchfin detail page (`plugins.bundle.config`)
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: namespace,
        locale: namespace,
      },
      HitchfinUnifiedSettingsDashboard,
    ),
  );

  // 5. Plugins page -> dsh-hitchfin component row "配置" button (`plugins.row.config`)
  ctx.slots.inject('plugins.row.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.row.config',
        key: `${namespace}#${namespace}`,
        locale: namespace,
      },
      HitchfinUnifiedSettingsDashboard,
    ),
  );

  // 6. Plugins page -> Top tab bar (`plugins.tab`)
  ctx.slots.inject('plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'plugins.tab',
        id: namespace,
        order: 20,
        label: () => 'Hitchfin 订阅与路由',
        locale: namespace,
      },
      HitchfinUnifiedSettingsDashboard,
    ),
  );

  // 7. Settings -> Built-in Plugins tab (`settings.plugins.tab`)
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: namespace,
        order: 70,
        label: () => 'Hitchfin 订阅与路由',
        locale: namespace,
      },
      HitchfinUnifiedSettingsDashboard,
    ),
  );

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settingsScope'], (scoped) => {
      scoped.slots.inject('settings.plugin.item', () =>
        scoped.slots.register(
          {
            name: 'settings.plugin.item',
            key: namespace,
            locale: namespace,
          },
          HitchfinUnifiedSettingsDashboard,
        ),
      );
    });
  }
}
