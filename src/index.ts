import type { Context } from '@deepseek-ai/cordis';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { AdapterRegistrationHandle, LlmRuntime } from '@deepseek-ai/dsh-llm';
import {
  HitchfinAdapter,
  type HitchfinCatalogEntry,
  type UpstreamStreamTransport,
} from './adapter/hitchfin-adapter.js';
import {
  DEFAULT_MAGPIE_ENDPOINT,
  probeMagpieGateway,
} from './channels/magpie-bridge.js';
import { MagpiePluginWorkerHost } from './channels/plugin-worker-host.js';
import { AccountPool } from './channels/pool.js';
import { createMaskingWaterfallListener } from './masking/interceptor.js';
import { SecretVault } from './masking/placeholder.js';
import { PolicyGuard } from './masking/policy-guard.js';
import { CooldownTracker } from './router/cooldown.js';
import { GroupRouter } from './router/group-router.js';
import { StickySessionCache } from './router/sticky-cache.js';
import type {
  HitchfinRuntimeMode,
  HitchfinStatusSnapshot,
} from './rpc/types.js';

export * from './adapter/hitchfin-adapter.js';
export * from './channels/magpie-bridge.js';
export * from './channels/plugin-worker-host.js';
export * from './channels/plugin-worker.js';
export * from './channels/pool.js';
export * from './masking/interceptor.js';
export * from './masking/placeholder.js';
export * from './masking/policy-guard.js';
export * from './masking/stream-unmasker.js';
export * from './router/cooldown.js';
export * from './router/group-router.js';
export * from './router/sticky-cache.js';
export * from './rpc/types.js';

export const name = 'dsh-hitchfin';

export interface HitchfinPluginConfig {
  mode?: HitchfinRuntimeMode;
  magpieEndpoint?: string;
  maskingEnabled?: boolean;
  blockHighRiskTools?: boolean;
}

export class HitchfinHostController {
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
  private adapterHandle: AdapterRegistrationHandle | null = null;

  constructor(
    private readonly ctx: Context,
    config: HitchfinPluginConfig = {},
  ) {
    this.mode = config.mode ?? 'auto';
    this.magpieEndpoint = config.magpieEndpoint ?? DEFAULT_MAGPIE_ENDPOINT;
    this.maskingEnabled = config.maskingEnabled ?? true;

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
      channels: [],
      accounts: this.pool.listSlots(),
      routingGroups: [],
      masking: {
        enabled: this.maskingEnabled,
        blockHighRiskTools: true,
        highRiskToolNames: [],
      },
      stats: {
        maskedSecretsCount: this.vault.getMaskedCount(),
        blockedExfiltrationsCount: this.policyGuard.getBlockedCount(),
        failoverCount: this.router.getFailoverCount(),
      },
    };
  }

  async refreshMagpieBridgeStatus(): Promise<boolean> {
    const res = await probeMagpieGateway(this.magpieEndpoint);
    this.magpieReachable = res.reachable;
    return res.reachable;
  }

  mountLlmAdapter(
    llm: LlmRuntime,
    entries: HitchfinCatalogEntry[],
    transport: UpstreamStreamTransport,
  ): () => void {
    const adapter = new HitchfinAdapter(entries, this.router, transport);
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

export function apply(ctx: Context, config: HitchfinPluginConfig = {}): void {
  const controller = new HitchfinHostController(ctx, config);

  // Register outbound secret masking on the llm/stream waterfall
  const waterfallListener = createMaskingWaterfallListener(
    controller.vault,
    controller.policyGuard,
    () => controller.getStatusSnapshot().masking.enabled,
  );
  (ctx as unknown as { on: (event: string, fn: unknown) => void }).on(
    'llm/stream',
    waterfallListener,
  );

  ctx.effect(
    () => () => {
      void controller.dispose();
    },
    'dsh-hitchfin: host controller lifecycle',
  );
}
