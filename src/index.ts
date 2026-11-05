import type { Context } from '@deepseek-ai/cordis';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type {
  AdapterRegistrationHandle,
  LlmRuntime,
} from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
import {
  HitchfinAdapter,
  type HitchfinCatalogEntry,
  type UpstreamStreamTransport,
} from './adapter/hitchfin-adapter.js';
import { createOpenAiSseTransport } from './adapter/openai-sse-transport.js';
import {
  buildCatalogEntriesFromMagpie,
  DEFAULT_MAGPIE_ENDPOINT,
  probeMagpieGateway,
  registerBridgeSlotsOnPool,
} from './channels/magpie-bridge.js';
import { MagpiePluginWorkerHost } from './channels/plugin-worker-host.js';
import { AccountPool } from './channels/pool.js';
import { createMaskingWaterfallListener } from './masking/interceptor.js';
import { SecretVault } from './masking/placeholder.js';
import { PolicyGuard } from './masking/policy-guard.js';
import { CooldownTracker } from './router/cooldown.js';
import { GroupRouter } from './router/group-router.js';
import { StickySessionCache } from './router/sticky-cache.js';
import {
  type HitchfinRouteController,
  type HostConnectionService,
  mountHitchfinHttpRoutes,
  type WebServerService,
} from './rpc/http-routes.js';
import {
  type ChannelPreset,
  CHANNEL_PRESETS,
  type ChannelSummary,
  type HitchfinRuntimeMode,
  type HitchfinStatusSnapshot,
  type RoutingGroupConfig,
  type RoutingStrategy,
} from './rpc/types.js';

export * from './adapter/hitchfin-adapter.js';
export * from './adapter/openai-sse-transport.js';
export * from './adapter/pi-ai-transport.js';
export * from './channels/flows.js';
export * from './channels/magpie-bridge.js';
export * from './channels/plugin-worker-host.js';
export * from './channels/plugin-worker.js';
export * from './channels/pool.js';
export * from './masking/interceptor.js';
export * from './masking/placeholder.js';
export * from './masking/policy-guard.js';
export * from './masking/stream-unmasker.js';
export * from './migration/backup-restore.js';
export * from './router/cooldown.js';
export * from './router/group-router.js';
export * from './router/sticky-cache.js';
export * from './rpc/http-routes.js';
export * from './rpc/types.js';

export const name = 'dsh-hitchfin';

export const Config = z.object({
  mode: z
    .union(['auto', 'bridge', 'standalone'])
    .default('auto')
    .volatile(),
  magpieEndpoint: z
    .string()
    .default(DEFAULT_MAGPIE_ENDPOINT)
    .volatile(),
  maskingEnabled: z.boolean().default(true).volatile(),
  blockHighRiskTools: z.boolean().default(true).volatile(),
});

export interface HitchfinPluginConfig {
  mode?: HitchfinRuntimeMode;
  magpieEndpoint?: string;
  maskingEnabled?: boolean;
  blockHighRiskTools?: boolean;
  customFetch?: typeof fetch;
}

function unwrapValue<T>(val: unknown, fallback: T): T {
  if (val === undefined || val === null) return fallback;
  if (
    typeof val === 'object' &&
    val !== null &&
    'get' in val &&
    typeof (val as { get?: unknown }).get === 'function'
  ) {
    return unwrapValue((val as { get: () => unknown }).get(), fallback);
  }
  return val as T;
}

export function unwrapConfig(raw: unknown): HitchfinPluginConfig {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  return {
    mode: unwrapValue(obj.mode, 'auto') as HitchfinRuntimeMode,
    magpieEndpoint: unwrapValue(obj.magpieEndpoint, DEFAULT_MAGPIE_ENDPOINT),
    maskingEnabled: unwrapValue(obj.maskingEnabled, true),
    blockHighRiskTools: unwrapValue(obj.blockHighRiskTools, true),
    customFetch:
      typeof obj.customFetch === 'function'
        ? (obj.customFetch as typeof fetch)
        : undefined,
  };
}

export class HitchfinHostController implements HitchfinRouteController {
  readonly pool: AccountPool;
  readonly cooldown = new CooldownTracker();
  readonly sticky: StickySessionCache;
  readonly router: GroupRouter;
  readonly vault = new SecretVault();
  readonly policyGuard: PolicyGuard;
  readonly workerHost = new MagpiePluginWorkerHost();

  private mode: HitchfinRuntimeMode;
  private magpieEndpoint: string;
  private maskingEnabled: boolean;
  private magpieReachable = false;
  private currentStrategy: RoutingStrategy = 'smart';
  private channels: ChannelSummary[] = [];
  private routingGroups: RoutingGroupConfig[] = [];
  private llmRuntime: LlmRuntime | null = null;
  private adapter: HitchfinAdapter | null = null;
  private adapterHandle: AdapterRegistrationHandle | null = null;
  private defaultTransport: UpstreamStreamTransport;
  private customFetch?: typeof fetch;

  constructor(
    private readonly ctx: Context,
    rawConfig: HitchfinPluginConfig = {},
  ) {
    const config = unwrapConfig(rawConfig);
    this.mode = config.mode ?? 'auto';
    this.magpieEndpoint =
      typeof config.magpieEndpoint === 'string' && config.magpieEndpoint.trim() !== ''
        ? config.magpieEndpoint.trim()
        : DEFAULT_MAGPIE_ENDPOINT;
    this.maskingEnabled = config.maskingEnabled ?? true;
    this.customFetch = config.customFetch;

    this.pool = new AccountPool(
      () =>
        (this.ctx as unknown as { get?: (k: string) => unknown }).get?.(
          'credentials',
        ) as CredentialProvider | undefined,
    );
    this.sticky = new StickySessionCache(this.cooldown);
    this.router = new GroupRouter(this.pool, this.cooldown, this.sticky);
    this.policyGuard = new PolicyGuard({
      blockHighRiskTools: config.blockHighRiskTools ?? true,
    });

    this.defaultTransport = createOpenAiSseTransport({
      resolveBaseUrl: async ({ channelId, slotId }) => {
        const record = await this.pool.readAccountCredential(channelId, slotId);
        if (record?.baseUrl && record.baseUrl.trim().length > 0) {
          return record.baseUrl.trim();
        }
        return this.resolveDefaultBaseUrlForChannel(channelId);
      },
      resolveAuthToken: async ({ channelId, slotId }) => {
        const record = await this.pool.readAccountCredential(channelId, slotId);
        return record?.accessToken ?? record?.apiKey;
      },
      resolveExtraHeaders: async ({ channelId, slotId }) => {
        const record = await this.pool.readAccountCredential(channelId, slotId);
        const headers: Record<string, string> = {};
        if (channelId.includes('claude') || channelId.includes('anthropic')) {
          if (record?.apiKey) {
            headers['x-api-key'] = record.apiKey;
            headers['anthropic-version'] = '2023-06-01';
          }
        }
        return headers;
      },
      ...(this.customFetch ? { customFetch: this.customFetch } : {}),
    });
  }

  private resolveDefaultBaseUrlForChannel(channelId: string): string {
    const norm = channelId.toLowerCase();
    if (norm.includes('deepseek')) return 'https://api.deepseek.com';
    if (norm.includes('openai') || norm.includes('codex'))
      return 'https://api.openai.com/v1';
    if (norm.includes('gemini'))
      return 'https://generativelanguage.googleapis.com/v1beta/openai';
    if (norm.includes('claude') || norm.includes('anthropic'))
      return 'https://api.anthropic.com/v1';
    if (norm.includes('trae')) return 'https://api.trae.ai/v1';
    if (norm.includes('copilot')) return 'https://api.githubcopilot.com';
    if (this.magpieReachable && this.magpieEndpoint) return this.magpieEndpoint;
    return 'https://api.openai.com/v1';
  }

  getStatusSnapshot(): HitchfinStatusSnapshot {
    return {
      mode: this.mode,
      activeMode:
        this.magpieReachable && this.mode !== 'standalone'
          ? 'bridge'
          : 'standalone',
      magpieBridgeReachable: this.magpieReachable,
      magpieEndpoint: this.magpieEndpoint,
      defaultStrategy: this.currentStrategy,
      presets: CHANNEL_PRESETS,
      channels: [...this.channels],
      accounts: this.pool.listSlots(),
      routingGroups:
        this.routingGroups.length > 0
          ? [...this.routingGroups]
          : this.router.listRoutingGroups(),
      masking: {
        enabled: this.maskingEnabled,
        blockHighRiskTools: this.policyGuard.isBlockingHighRiskTools(),
        highRiskToolNames: this.policyGuard.listHighRiskToolNames(),
      },
      stats: {
        maskedSecretsCount: this.vault.getMaskedCount(),
        blockedExfiltrationsCount: this.policyGuard.getBlockedCount(),
        failoverCount: this.router.getFailoverCount(),
      },
    };
  }

  async refreshMagpieBridgeStatus(): Promise<boolean> {
    const res = await probeMagpieGateway(
      this.magpieEndpoint,
      1500,
      this.customFetch,
    );
    this.magpieReachable = res.reachable;
    this.channels = res.channels;
    return res.reachable;
  }

  attachLlmRuntime(llm: LlmRuntime): void {
    this.llmRuntime = llm;
  }

  private buildAutonomousCatalogEntries(): HitchfinCatalogEntry[] {
    const entries: HitchfinCatalogEntry[] = [];
    const accounts = this.pool.listAutonomousAccounts();
    const byChannel = new Map<string, typeof accounts>();
    for (const acc of accounts) {
      const list = byChannel.get(acc.channelId) ?? [];
      list.push(acc);
      byChannel.set(acc.channelId, list);
    }

    for (const [channelId, channelAccounts] of byChannel.entries()) {
      const primary = channelAccounts[0];
      const modelsSet = new Set<string>();
      for (const acc of channelAccounts) {
        if (acc.models && acc.models.length > 0) {
          for (const m of acc.models) modelsSet.add(m.trim());
        }
      }
      if (modelsSet.size === 0) {
        const preset = CHANNEL_PRESETS.find(
          (p) => p.channelId.replace(/^hitchfin[-/]/, '') === channelId,
        );
        const defaults = preset?.defaultModels ?? ['default-model'];
        for (const m of defaults) modelsSet.add(m);
      }

      const providerId = channelId.startsWith('hitchfin')
        ? channelId
        : `hitchfin-${channelId}`;
      const preset = CHANNEL_PRESETS.find(
        (p) => p.channelId.replace(/^hitchfin[-/]/, '') === channelId,
      );
      const displayName = preset?.name ?? primary.label ?? channelId;

      entries.push({
        provider: {
          id: providerId,
          name: `Hitchfin · ${displayName}`,
        },
        strategy: this.currentStrategy,
        models: [...modelsSet].map((modelId) => ({
          info: {
            provider: providerId,
            id: modelId,
            name: modelId,
            description: `Hitchfin 订阅 (${displayName} · ${channelAccounts.length} 账号)`,
            inputModalities: ['text'],
          },
          resolved: {
            context: { contextWindow: 128_000 },
            defaultMaxTokens: 16_384,
          },
        })),
      });
    }

    return entries;
  }

  private buildAutonomousChannels(): ChannelSummary[] {
    const channels: ChannelSummary[] = [];
    const accounts = this.pool.listAutonomousAccounts();
    const byChannel = new Map<string, typeof accounts>();
    for (const acc of accounts) {
      const list = byChannel.get(acc.channelId) ?? [];
      list.push(acc);
      byChannel.set(acc.channelId, list);
    }

    for (const [channelId, channelAccounts] of byChannel.entries()) {
      const primary = channelAccounts[0];
      const preset = CHANNEL_PRESETS.find(
        (p) => p.channelId.replace(/^hitchfin[-/]/, '') === channelId,
      );
      const displayName = preset?.name ?? primary.label ?? channelId;
      const modelsSet = new Set<string>();
      for (const acc of channelAccounts) {
        if (acc.models) {
          for (const m of acc.models) modelsSet.add(m.trim());
        }
      }
      if (modelsSet.size === 0) {
        const defaults = preset?.defaultModels ?? ['default-model'];
        for (const m of defaults) modelsSet.add(m);
      }

      channels.push({
        channelId: channelId.startsWith('hitchfin')
          ? channelId
          : `hitchfin-${channelId}`,
        displayName,
        source: primary.authType === 'oauth' ? 'native-oauth' : 'api-key',
        complianceTier: 'high',
        activeAccounts: channelAccounts.length,
        totalAccounts: channelAccounts.length,
        models: [...modelsSet],
      });
    }
    return channels;
  }

  async refreshAndSyncRoutes(): Promise<HitchfinStatusSnapshot> {
    // 1. Reload persisted autonomous accounts from ctx.credentials
    await this.pool.loadPersistedAccounts();

    // 2. Build catalog entries from autonomous accounts
    const autonomousEntries = this.buildAutonomousCatalogEntries();
    const autonomousChannels = this.buildAutonomousChannels();

    // 3. If mode !== 'standalone', optionally probe Magpie
    let bridgeEntries: HitchfinCatalogEntry[] = [];
    let bridgeChannels: ChannelSummary[] = [];

    if (this.mode !== 'standalone') {
      const probe = await probeMagpieGateway(
        this.magpieEndpoint,
        1500,
        this.customFetch,
      );
      this.magpieReachable = probe.reachable;
      if (probe.reachable) {
        registerBridgeSlotsOnPool(probe, this.pool);
        bridgeEntries = buildCatalogEntriesFromMagpie(probe);
        bridgeChannels = probe.channels;
      }
    } else {
      this.magpieReachable = false;
    }

    // 4. Merge channels: autonomous accounts take precedence
    const channelMap = new Map<string, ChannelSummary>();
    for (const ch of bridgeChannels) {
      channelMap.set(ch.channelId, ch);
    }
    for (const ch of autonomousChannels) {
      channelMap.set(ch.channelId, ch);
    }
    this.channels = [...channelMap.values()];

    // 5. Merge catalog entries: autonomous take precedence
    const catalogMap = new Map<string, HitchfinCatalogEntry>();
    for (const entry of bridgeEntries) {
      catalogMap.set(entry.provider.id, entry);
    }
    for (const entry of autonomousEntries) {
      catalogMap.set(entry.provider.id, entry);
    }
    const allEntries = [...catalogMap.values()];

    this.syncCatalogEntries(allEntries);
    return this.getStatusSnapshot();
  }

  async addAccount(params: {
    channelId: string;
    slotId?: string;
    label: string;
    authType?: 'api-key' | 'oauth' | 'bearer';
    apiKey?: string;
    accessToken?: string;
    baseUrl?: string;
    models?: string[];
  }): Promise<HitchfinStatusSnapshot> {
    const rawChannel = params.channelId.trim();
    const cleanChannelId = rawChannel.replace(/^hitchfin[-/]/, '');
    const cleanSlotId =
      params.slotId?.trim().toLowerCase() ||
      params.label.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') ||
      `slot-${Date.now().toString(36)}`;

    const preset = CHANNEL_PRESETS.find(
      (p) => p.channelId.replace(/^hitchfin[-/]/, '') === cleanChannelId,
    );
    const baseUrl =
      params.baseUrl?.trim() ||
      preset?.defaultBaseUrl ||
      this.resolveDefaultBaseUrlForChannel(cleanChannelId);

    const models =
      params.models && params.models.length > 0
        ? params.models.map((m) => m.trim()).filter(Boolean)
        : preset?.defaultModels ?? ['default-model'];

    await this.pool.addAutonomousAccount({
      channelId: cleanChannelId,
      slotId: cleanSlotId,
      label: params.label.trim(),
      authType: params.authType ?? preset?.authType ?? 'api-key',
      apiKey: params.apiKey?.trim(),
      accessToken: params.accessToken?.trim(),
      baseUrl,
      models,
      updatedAt: Date.now(),
    });

    return this.refreshAndSyncRoutes();
  }

  async removeAccount(
    channelId: string,
    slotId: string,
  ): Promise<HitchfinStatusSnapshot> {
    const bareChannel = channelId.trim().replace(/^hitchfin[-/]/, '');
    await this.pool.removeAutonomousAccount(bareChannel, slotId.trim());
    return this.refreshAndSyncRoutes();
  }

  async updateRoutingStrategy(
    strategy: RoutingStrategy,
  ): Promise<HitchfinStatusSnapshot> {
    this.currentStrategy = strategy;
    return this.refreshAndSyncRoutes();
  }

  async setRuntimeMode(
    mode: HitchfinRuntimeMode,
  ): Promise<HitchfinStatusSnapshot> {
    this.mode = mode;
    return this.refreshAndSyncRoutes();
  }

  updateMaskingConfig(patch: {
    enabled?: boolean;
    blockHighRiskTools?: boolean;
  }): HitchfinStatusSnapshot {
    if (typeof patch.enabled === 'boolean') {
      this.maskingEnabled = patch.enabled;
    }
    if (typeof patch.blockHighRiskTools === 'boolean') {
      this.policyGuard.setBlockHighRiskTools(patch.blockHighRiskTools);
    }
    return this.getStatusSnapshot();
  }

  syncCatalogEntries(
    entries: HitchfinCatalogEntry[],
    transport: UpstreamStreamTransport = this.defaultTransport,
  ): void {
    if (!this.llmRuntime) return;
    if (!this.adapter) {
      this.adapter = new HitchfinAdapter(entries, this.router, transport);
    } else {
      this.adapter.replaceCatalog(entries);
    }

    const providerIds = this.adapter.providerIds();
    if (!this.adapterHandle) {
      if (providerIds.length > 0) {
        this.adapterHandle = this.llmRuntime.registerAdapter(
          providerIds,
          this.adapter,
        );
      }
    } else {
      this.adapterHandle.replace(providerIds);
    }
  }

  mountLlmAdapter(
    llm: LlmRuntime,
    entries: HitchfinCatalogEntry[],
    transport: UpstreamStreamTransport = this.defaultTransport,
  ): () => void {
    this.llmRuntime = llm;
    const adapter = new HitchfinAdapter(entries, this.router, transport);
    this.adapter = adapter;
    const providerIds = adapter.providerIds();
    if (providerIds.length === 0) {
      return () => {};
    }
    const handle = llm.registerAdapter(providerIds, adapter);
    this.adapterHandle = handle;
    return () => {
      handle();
      if (this.adapterHandle === handle) {
        this.adapterHandle = null;
      }
    };
  }

  async dispose(): Promise<void> {
    this.adapterHandle?.();
    this.adapterHandle = null;
    await this.workerHost.dispose();
  }
}

export function apply(ctx: Context, rawConfig: HitchfinPluginConfig = {}): void {
  const config = unwrapConfig(rawConfig);
  const controller = new HitchfinHostController(ctx, config);

  // 1. Register outbound secret masking on the llm/stream waterfall
  const waterfallListener = createMaskingWaterfallListener(
    controller.vault,
    controller.policyGuard,
    () => controller.getStatusSnapshot().masking.enabled,
  );
  (ctx as unknown as { on: (event: string, fn: unknown) => void }).on(
    'llm/stream',
    waterfallListener,
  );

  // 2. Inject LLM service when available to auto-discover Magpie / channels
  const maybeInject = (
    ctx as unknown as {
      inject?: (deps: string[], cb: (innerCtx: Context) => void) => void;
      get?: (name: string) => unknown;
    }
  ).inject;

  if (typeof maybeInject === 'function') {
    maybeInject.call(ctx, ['llm'], (llmCtx: Context) => {
      const llm = (llmCtx as unknown as { llm?: LlmRuntime }).llm;
      if (llm) {
        controller.attachLlmRuntime(llm);
        controller.refreshAndSyncRoutes().catch((err) => {
          (
            ctx as unknown as {
              logger?: (ns: string) => { warn: (...args: unknown[]) => void };
            }
          )
            .logger?.('dsh-hitchfin')
            ?.warn('Failed to initialize routes on startup:', err);
        });
      }
    });

    maybeInject.call(ctx, ['webServer'], (webCtx: Context) => {
      const webServer = (
        webCtx as unknown as { webServer?: WebServerService }
      ).webServer;
      if (webServer) {
        webCtx.effect(
          () =>
            mountHitchfinHttpRoutes(
              webServer,
              controller,
              () =>
                (
                  webCtx as unknown as { get?: (k: string) => unknown }
                ).get?.('connection') as HostConnectionService | undefined,
            ),
          'dsh-hitchfin: http routes',
        );
      }
    });

    maybeInject.call(ctx, ['settings'], (settingsCtx: Context) => {
      const settings = (
        settingsCtx as unknown as {
          settings?: {
            configure?: (
              opts: { auto: boolean },
              fiber: unknown,
            ) => (() => void) | void;
          };
        }
      ).settings;
      if (typeof settings?.configure === 'function') {
        settingsCtx.effect(
          () => settings.configure?.({ auto: false }, ctx.fiber) ?? (() => {}),
          'dsh-hitchfin: custom settings surface',
        );
      }
    });
  }

  ctx.effect(
    () => () => {
      void controller.dispose();
    },
    'dsh-hitchfin: host controller lifecycle',
  );
}
