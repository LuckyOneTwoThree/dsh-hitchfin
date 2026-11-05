import z from '@deepseek-ai/schemastery';
import { HitchfinAdapter, } from './adapter/hitchfin-adapter.js';
import { createOpenAiSseTransport } from './adapter/openai-sse-transport.js';
import { buildCatalogEntriesFromMagpie, DEFAULT_MAGPIE_ENDPOINT, probeMagpieGateway, registerBridgeSlotsOnPool, } from './channels/magpie-bridge.js';
import { MagpiePluginWorkerHost } from './channels/plugin-worker-host.js';
import { AccountPool } from './channels/pool.js';
import { createMaskingWaterfallListener } from './masking/interceptor.js';
import { SecretVault } from './masking/placeholder.js';
import { PolicyGuard } from './masking/policy-guard.js';
import { CooldownTracker } from './router/cooldown.js';
import { GroupRouter } from './router/group-router.js';
import { StickySessionCache } from './router/sticky-cache.js';
import { mountHitchfinHttpRoutes, } from './rpc/http-routes.js';
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
function unwrapValue(val, fallback) {
    if (val === undefined || val === null)
        return fallback;
    if (typeof val === 'object' &&
        val !== null &&
        'get' in val &&
        typeof val.get === 'function') {
        return unwrapValue(val.get(), fallback);
    }
    return val;
}
export function unwrapConfig(raw) {
    if (!raw || typeof raw !== 'object')
        return {};
    const obj = raw;
    return {
        mode: unwrapValue(obj.mode, 'auto'),
        magpieEndpoint: unwrapValue(obj.magpieEndpoint, DEFAULT_MAGPIE_ENDPOINT),
        maskingEnabled: unwrapValue(obj.maskingEnabled, true),
        blockHighRiskTools: unwrapValue(obj.blockHighRiskTools, true),
        customFetch: typeof obj.customFetch === 'function'
            ? obj.customFetch
            : undefined,
    };
}
export class HitchfinHostController {
    ctx;
    pool;
    cooldown = new CooldownTracker();
    sticky;
    router;
    vault = new SecretVault();
    policyGuard;
    workerHost = new MagpiePluginWorkerHost();
    mode;
    magpieEndpoint;
    maskingEnabled;
    magpieReachable = false;
    channels = [];
    routingGroups = [];
    llmRuntime = null;
    adapter = null;
    adapterHandle = null;
    defaultTransport;
    customFetch;
    constructor(ctx, rawConfig = {}) {
        this.ctx = ctx;
        const config = unwrapConfig(rawConfig);
        this.mode = config.mode ?? 'auto';
        this.magpieEndpoint =
            typeof config.magpieEndpoint === 'string' && config.magpieEndpoint.trim() !== ''
                ? config.magpieEndpoint.trim()
                : DEFAULT_MAGPIE_ENDPOINT;
        this.maskingEnabled = config.maskingEnabled ?? true;
        this.customFetch = config.customFetch;
        this.pool = new AccountPool(() => this.ctx.get?.('credentials'));
        this.sticky = new StickySessionCache(this.cooldown);
        this.router = new GroupRouter(this.pool, this.cooldown, this.sticky);
        this.policyGuard = new PolicyGuard({
            blockHighRiskTools: config.blockHighRiskTools ?? true,
        });
        this.defaultTransport = createOpenAiSseTransport({
            resolveBaseUrl: () => this.magpieEndpoint,
            resolveAuthToken: async ({ channelId, slotId }) => {
                const record = await this.pool.readAccountCredential(channelId, slotId);
                return record?.accessToken ?? record?.apiKey;
            },
            ...(this.customFetch ? { customFetch: this.customFetch } : {}),
        });
    }
    getStatusSnapshot() {
        return {
            mode: this.mode,
            activeMode: this.magpieReachable && this.mode !== 'standalone'
                ? 'bridge'
                : 'standalone',
            magpieBridgeReachable: this.magpieReachable,
            magpieEndpoint: this.magpieEndpoint,
            channels: [...this.channels],
            accounts: this.pool.listSlots(),
            routingGroups: this.routingGroups.length > 0
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
    async refreshMagpieBridgeStatus() {
        const res = await probeMagpieGateway(this.magpieEndpoint, 1500, this.customFetch);
        this.magpieReachable = res.reachable;
        this.channels = res.channels;
        return res.reachable;
    }
    attachLlmRuntime(llm) {
        this.llmRuntime = llm;
    }
    async refreshAndSyncRoutes() {
        const probe = await probeMagpieGateway(this.magpieEndpoint, 1500, this.customFetch);
        this.magpieReachable = probe.reachable;
        if (this.mode !== 'standalone' && probe.reachable) {
            this.channels = probe.channels;
            registerBridgeSlotsOnPool(probe, this.pool);
            const entries = buildCatalogEntriesFromMagpie(probe);
            this.syncCatalogEntries(entries);
        }
        else if (this.mode === 'standalone') {
            this.channels = this.channels.filter((c) => c.source !== 'magpie-bridge');
            if (this.adapterHandle) {
                this.adapterHandle.replace([]);
            }
        }
        return this.getStatusSnapshot();
    }
    async setRuntimeMode(mode) {
        this.mode = mode;
        return this.refreshAndSyncRoutes();
    }
    updateMaskingConfig(patch) {
        if (typeof patch.enabled === 'boolean') {
            this.maskingEnabled = patch.enabled;
        }
        if (typeof patch.blockHighRiskTools === 'boolean') {
            this.policyGuard.setBlockHighRiskTools(patch.blockHighRiskTools);
        }
        return this.getStatusSnapshot();
    }
    syncCatalogEntries(entries, transport = this.defaultTransport) {
        if (!this.llmRuntime)
            return;
        if (!this.adapter) {
            this.adapter = new HitchfinAdapter(entries, this.router, transport);
        }
        else {
            this.adapter.replaceCatalog(entries);
        }
        const providerIds = this.adapter.providerIds();
        if (!this.adapterHandle) {
            if (providerIds.length > 0) {
                this.adapterHandle = this.llmRuntime.registerAdapter(providerIds, this.adapter);
            }
        }
        else {
            this.adapterHandle.replace(providerIds);
        }
    }
    mountLlmAdapter(llm, entries, transport = this.defaultTransport) {
        this.llmRuntime = llm;
        const adapter = new HitchfinAdapter(entries, this.router, transport);
        this.adapter = adapter;
        const providerIds = adapter.providerIds();
        if (providerIds.length === 0) {
            return () => { };
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
    async dispose() {
        this.adapterHandle?.();
        this.adapterHandle = null;
        await this.workerHost.dispose();
    }
}
export function apply(ctx, rawConfig = {}) {
    const config = unwrapConfig(rawConfig);
    const controller = new HitchfinHostController(ctx, config);
    // 1. Register outbound secret masking on the llm/stream waterfall
    const waterfallListener = createMaskingWaterfallListener(controller.vault, controller.policyGuard, () => controller.getStatusSnapshot().masking.enabled);
    ctx.on('llm/stream', waterfallListener);
    // 2. Inject LLM service when available to auto-discover Magpie / channels
    const maybeInject = ctx.inject;
    if (typeof maybeInject === 'function') {
        maybeInject.call(ctx, ['llm'], (llmCtx) => {
            const llm = llmCtx.llm;
            if (llm) {
                controller.attachLlmRuntime(llm);
                controller.refreshAndSyncRoutes().catch((err) => {
                    ctx
                        .logger?.('dsh-hitchfin')
                        ?.warn('Failed to initialize routes on startup:', err);
                });
            }
        });
        maybeInject.call(ctx, ['webServer'], (webCtx) => {
            const webServer = webCtx.webServer;
            if (webServer) {
                webCtx.effect(() => mountHitchfinHttpRoutes(webServer, controller, () => webCtx.get?.('connection')), 'dsh-hitchfin: http routes');
            }
        });
        maybeInject.call(ctx, ['settings'], (settingsCtx) => {
            const settings = settingsCtx.settings;
            if (typeof settings?.configure === 'function') {
                settingsCtx.effect(() => settings.configure?.({ auto: false }, ctx.fiber) ?? (() => { }), 'dsh-hitchfin: custom settings surface');
            }
        });
    }
    ctx.effect(() => () => {
        void controller.dispose();
    }, 'dsh-hitchfin: host controller lifecycle');
}
