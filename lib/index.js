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
import { CHANNEL_PRESETS, } from './rpc/types.js';
import { discoverLocalSubscriptionAccounts, importDiscoveredAccountsToPool, } from './channels/subscription-discovery.js';
import { pollGitHubCopilotDeviceFlow, startGitHubCopilotDeviceFlow, } from './channels/github-copilot-auth.js';
export * from './adapter/hitchfin-adapter.js';
export * from './adapter/openai-sse-transport.js';
export * from './adapter/pi-ai-transport.js';
export * from './channels/flows.js';
export * from './channels/github-copilot-auth.js';
export * from './channels/magpie-bridge.js';
export * from './channels/plugin-worker-host.js';
export * from './channels/plugin-worker.js';
export * from './channels/pool.js';
export * from './channels/subscription-discovery.js';
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
    autoImportDiscovered: z.boolean().default(false).volatile(),
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
        autoImportDiscovered: unwrapValue(obj.autoImportDiscovered, false),
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
    autoImportDiscovered;
    magpieReachable = false;
    currentStrategy = 'smart';
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
        this.autoImportDiscovered = config.autoImportDiscovered ?? false;
        this.customFetch = config.customFetch;
        this.pool = new AccountPool(() => this.ctx.get?.('credentials'));
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
                const headers = {};
                const norm = channelId.toLowerCase();
                if (norm.includes('claude') || norm.includes('anthropic')) {
                    if (record?.apiKey || record?.accessToken) {
                        headers['x-api-key'] = (record.apiKey ?? record.accessToken);
                        headers['anthropic-version'] = '2023-06-01';
                    }
                }
                if (norm.includes('copilot')) {
                    headers['Editor-Version'] = 'vscode/1.95.0';
                    headers['Copilot-Integration-Id'] = 'vscode-chat';
                }
                if (norm.includes('trae')) {
                    headers['x-device-type'] = 'Windows';
                    headers['User-Agent'] = 'Trae/0.1.69';
                    if (record?.accessToken) {
                        headers['Authorization'] = `Cloud-IDE-JWT ${record.accessToken}`;
                    }
                }
                if (norm.includes('workbuddy')) {
                    headers['User-Agent'] = 'WorkBuddy/3.3.99';
                }
                if (norm.includes('zcode')) {
                    headers['X-App-Version'] = '3.17.2';
                }
                return headers;
            },
            ...(this.customFetch ? { customFetch: this.customFetch } : {}),
        });
    }
    resolveDefaultBaseUrlForChannel(channelId) {
        const norm = channelId.toLowerCase();
        if (norm.includes('deepseek'))
            return 'https://api.deepseek.com';
        if (norm.includes('openai') || norm.includes('codex'))
            return 'https://api.openai.com/v1';
        if (norm.includes('gemini'))
            return 'https://generativelanguage.googleapis.com/v1beta/openai';
        if (norm.includes('claude') || norm.includes('anthropic'))
            return 'https://api.anthropic.com/v1';
        if (norm.includes('trae'))
            return 'https://api.trae.ai/v1';
        if (norm.includes('copilot'))
            return 'https://api.githubcopilot.com';
        if (this.magpieReachable && this.magpieEndpoint)
            return this.magpieEndpoint;
        return 'https://api.openai.com/v1';
    }
    getDiscoveredSubscriptionsSummary() {
        const discovered = discoverLocalSubscriptionAccounts();
        const existingSlotIds = new Set(this.pool.listSlots().map((s) => s.slotId));
        return discovered
            .filter((d) => !existingSlotIds.has(d.slotId))
            .map((d) => ({
            id: d.id,
            source: d.source,
            channelId: d.channelId,
            providerName: d.providerName,
            user: d.user,
            plan: d.plan,
            hasToken: d.hasToken,
            baseUrl: d.baseUrl,
            models: d.models,
            slotId: d.slotId,
            label: d.label,
        }));
    }
    getDiscoveredSubscriptions() {
        return this.getDiscoveredSubscriptionsSummary();
    }
    async importDiscoveredSubscriptions(accountIds) {
        await importDiscoveredAccountsToPool(accountIds, this.pool);
        return this.refreshAndSyncRoutes();
    }
    async startCopilotDeviceFlow() {
        return startGitHubCopilotDeviceFlow(this.customFetch);
    }
    async pollCopilotDeviceFlow(deviceCode) {
        const poll = await pollGitHubCopilotDeviceFlow(deviceCode, this.customFetch);
        if (poll.status === 'authorized' && poll.accessToken) {
            await this.pool.addAutonomousAccount({
                channelId: 'copilot',
                slotId: `copilot-${Date.now().toString(36)}`,
                label: 'GitHub Copilot 订阅 (官方设备码授权)',
                authType: 'oauth',
                accessToken: poll.accessToken,
                baseUrl: 'https://api.githubcopilot.com',
                models: ['copilot-gpt-4o', 'copilot-claude-3.5-sonnet', 'copilot-o1'],
                updatedAt: Date.now(),
            });
            await this.refreshAndSyncRoutes();
        }
        return poll;
    }
    getStatusSnapshot() {
        return {
            mode: this.mode,
            activeMode: this.magpieReachable && this.mode !== 'standalone'
                ? 'bridge'
                : 'standalone',
            magpieBridgeReachable: this.magpieReachable,
            magpieEndpoint: this.magpieEndpoint,
            defaultStrategy: this.currentStrategy,
            presets: CHANNEL_PRESETS,
            discoveredSubscriptions: this.getDiscoveredSubscriptionsSummary(),
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
    buildAutonomousCatalogEntries() {
        const entries = [];
        const accounts = this.pool.listAutonomousAccounts();
        const byChannel = new Map();
        for (const acc of accounts) {
            const list = byChannel.get(acc.channelId) ?? [];
            list.push(acc);
            byChannel.set(acc.channelId, list);
        }
        for (const [channelId, channelAccounts] of byChannel.entries()) {
            const primary = channelAccounts[0];
            const modelsSet = new Set();
            for (const acc of channelAccounts) {
                if (acc.models && acc.models.length > 0) {
                    for (const m of acc.models)
                        modelsSet.add(m.trim());
                }
            }
            if (modelsSet.size === 0) {
                const preset = CHANNEL_PRESETS.find((p) => p.channelId.replace(/^hitchfin[-/]/, '') === channelId);
                const defaults = preset?.defaultModels ?? ['default-model'];
                for (const m of defaults)
                    modelsSet.add(m);
            }
            const providerId = channelId.startsWith('hitchfin')
                ? channelId
                : `hitchfin-${channelId}`;
            const preset = CHANNEL_PRESETS.find((p) => p.channelId.replace(/^hitchfin[-/]/, '') === channelId);
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
    buildAutonomousChannels() {
        const channels = [];
        const accounts = this.pool.listAutonomousAccounts();
        const byChannel = new Map();
        for (const acc of accounts) {
            const list = byChannel.get(acc.channelId) ?? [];
            list.push(acc);
            byChannel.set(acc.channelId, list);
        }
        for (const [channelId, channelAccounts] of byChannel.entries()) {
            const primary = channelAccounts[0];
            const preset = CHANNEL_PRESETS.find((p) => p.channelId.replace(/^hitchfin[-/]/, '') === channelId);
            const displayName = preset?.name ?? primary.label ?? channelId;
            const modelsSet = new Set();
            for (const acc of channelAccounts) {
                if (acc.models) {
                    for (const m of acc.models)
                        modelsSet.add(m.trim());
                }
            }
            if (modelsSet.size === 0) {
                const defaults = preset?.defaultModels ?? ['default-model'];
                for (const m of defaults)
                    modelsSet.add(m);
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
    async refreshAndSyncRoutes() {
        // 1. Reload persisted autonomous accounts from ctx.credentials
        await this.pool.loadPersistedAccounts();
        // If autoImportDiscovered is enabled and pool has no accounts configured yet, automatically discover and import from local official subscription logins
        if (this.autoImportDiscovered && this.pool.listSlots().length === 0) {
            await importDiscoveredAccountsToPool('all', this.pool);
        }
        // 2. Build catalog entries from autonomous accounts
        const autonomousEntries = this.buildAutonomousCatalogEntries();
        const autonomousChannels = this.buildAutonomousChannels();
        // 3. If mode !== 'standalone', optionally probe Magpie
        let bridgeEntries = [];
        let bridgeChannels = [];
        if (this.mode !== 'standalone') {
            const probe = await probeMagpieGateway(this.magpieEndpoint, 1500, this.customFetch);
            this.magpieReachable = probe.reachable;
            if (probe.reachable) {
                registerBridgeSlotsOnPool(probe, this.pool);
                bridgeEntries = buildCatalogEntriesFromMagpie(probe);
                bridgeChannels = probe.channels;
            }
        }
        else {
            this.magpieReachable = false;
        }
        // 4. Merge channels: autonomous accounts take precedence
        const channelMap = new Map();
        for (const ch of bridgeChannels) {
            channelMap.set(ch.channelId, ch);
        }
        for (const ch of autonomousChannels) {
            channelMap.set(ch.channelId, ch);
        }
        this.channels = [...channelMap.values()];
        // 5. Merge catalog entries: autonomous take precedence
        const catalogMap = new Map();
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
    async addAccount(params) {
        const rawChannel = params.channelId.trim();
        const cleanChannelId = rawChannel.replace(/^hitchfin[-/]/, '');
        const cleanSlotId = params.slotId?.trim().toLowerCase() ||
            params.label.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') ||
            `slot-${Date.now().toString(36)}`;
        const preset = CHANNEL_PRESETS.find((p) => p.channelId.replace(/^hitchfin[-/]/, '') === cleanChannelId);
        const baseUrl = params.baseUrl?.trim() ||
            preset?.defaultBaseUrl ||
            this.resolveDefaultBaseUrlForChannel(cleanChannelId);
        const models = params.models && params.models.length > 0
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
    async removeAccount(channelId, slotId) {
        const bareChannel = channelId.trim().replace(/^hitchfin[-/]/, '');
        await this.pool.removeAutonomousAccount(bareChannel, slotId.trim());
        return this.refreshAndSyncRoutes();
    }
    async updateRoutingStrategy(strategy) {
        this.currentStrategy = strategy;
        return this.refreshAndSyncRoutes();
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
