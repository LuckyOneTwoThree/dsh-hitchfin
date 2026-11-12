import { HitchfinAdapter, SPIKE_PROVIDER } from './adapter/hitchfin-adapter.js'
import { AccountStore, accountKey, labelFromAuth } from './accounts/store.js'
import { HitchfinError, errorMessage } from './errors.js'
import { ChannelRegistry } from './channels/registry.js'
import { ChannelWorkerHost } from './host/worker-host.js'
import { registerHitchfinRoutes } from './routes.js'
import type { HitchfinContext, ImageAttachmentRef } from './types.js'

export const name = 'dsh-hitchfin'
export const inject = ['llm', 'credentials', 'authorization']

/**
 * The host's native authorization flow owns its own account slot. It used to
 * hard-code `acct-1`, which is also the first id the settings page allocates —
 * re-authenticating through the host silently overwrote the user's primary
 * account. Keep a dedicated slot so the two entry points never collide.
 */
const NATIVE_ACCOUNT_ID = 'native-1'

export interface HitchfinConfig {
  /** Development: keep the fake spike provider beside the real channels. */
  devSpike?: boolean
  /** Development: show a channel's static models before sign-in. */
  devStaticModels?: boolean
  /** Override channel package entry paths, keyed by channel id. */
  channelPackages?: Record<string, string>
  /**
   * Load a channel package from `~/.config/magpie/plugins` when it is not
   * installed beside this plugin. That tree is user-writable, so it is opt-in.
   */
  allowMagpieFallback?: boolean
}

interface AttachmentReaderLike {
  readImageRequest(
    ref: ImageAttachmentRef,
    target: { width: number; height: number; maxBytes: number },
    signal?: AbortSignal,
  ): Promise<{ data: Uint8Array; mediaType: string }>
}

/** Resolve the host attachment service at call time: it may activate after this plugin. */
function attachmentReader(ctx: HitchfinContext): AttachmentReaderLike | undefined {
  try {
    const attachments = ctx.get?.('attachments') as AttachmentReaderLike | undefined
    return attachments && typeof attachments.readImageRequest === 'function'
      ? attachments
      : undefined
  } catch {
    return undefined
  }
}

export function apply(ctx: HitchfinContext, config: HitchfinConfig = {}): void {
  const registry = new ChannelRegistry({
    overrides: config.channelPackages ?? {},
    allowMagpieFallback: config.allowMagpieFallback === true,
  })
  const accounts = new AccountStore(ctx.credentials)
  let authChanged:
    | ((channelId: string, accountId: string, auth: unknown) => void)
    | undefined
  const worker = new ChannelWorkerHost({
    onAuthChanged: (channelId, accountId, auth) => {
      authChanged?.(channelId, accountId, auth)
    },
    onAudit: ({ channelId, packagePath }) => {
      ctx.logger.info(`dsh-hitchfin: loaded channel package ${channelId} from ${packagePath}`)
    },
  })

  // The auth-method indexes below mirror one exact channel-package release.
  // A newer package can reorder or extend that array, which would silently
  // route a sign-in to the wrong method; say so once instead of guessing.
  for (const descriptor of registry.all()) {
    const info = registry.packageInfo(descriptor)
    if (!info) continue
    if (info.source === 'magpie-fallback') {
      ctx.logger.warn(
        `dsh-hitchfin: ${descriptor.displayName} loaded from the magpie fallback at ${info.path}; ` +
          'install the channel package beside this plugin instead of relying on a user-writable tree',
      )
    }
    if (info.versionMatches === false) {
      ctx.logger.warn(
        `dsh-hitchfin: ${descriptor.packageName} is ${info.version}, expected ${info.expectedVersion}; ` +
          'sign-in method indexes may not match this release',
      )
    }
  }

  const devSpike = config.devSpike === true
  const readImage = (
    ref: ImageAttachmentRef,
    signal?: AbortSignal,
  ): Promise<{ data: Uint8Array; mediaType: string }> => {
    const reader = attachmentReader(ctx)
    if (!reader) {
      throw new HitchfinError(
        'the host attachment service is unavailable; restart DSH and try again',
        'INVALID_REQUEST',
      )
    }
    return reader.readImageRequest(
      ref,
      { width: ref.width, height: ref.height, maxBytes: ref.bytes },
      signal,
    )
  }
  const adapter = new HitchfinAdapter({
    registry,
    accounts,
    worker,
    logger: ctx.logger,
    devStaticModels: config.devStaticModels ?? false,
    readImage,
    canReadImages: () => attachmentReader(ctx) !== undefined,
  })

  // A channel package can refresh its own token through client.auth.set(). The
  // failure that triggered the refresh may have put the account in AUTH
  // cooldown; persist the auth and clear that routing state, but never let a
  // rejected credentials write escape as an unhandled rejection.
  authChanged = (channelId, accountId, auth) => {
    void accounts
      .updateAuth(channelId, accountId, auth)
      .then(() => {
        const descriptor = registry.all().find((entry) => entry.id === channelId)
        if (descriptor) adapter.forget(descriptor.providerId, accountId)
      })
      .catch((error) => {
        ctx.logger.warn(
          `dsh-hitchfin: storing refreshed ${channelId}/${accountId} auth failed: ${errorMessage(error)}`,
        )
      })
  }

  const providers = [
    ...(devSpike ? [SPIKE_PROVIDER] : []),
    ...registry.providerIds(),
  ]
  ctx.llm.registerAdapter(providers, adapter)
  ctx.logger.info(
    `dsh-hitchfin: registered ${providers.length} providers (${providers.join(', ')})`,
  )

  void accounts
    .migrate()
    .then((changed) => {
      if (changed === 0) return
      adapter.invalidate()
      for (const providerId of registry.providerIds()) {
        ctx.emit?.('llm/models-updated', providerId)
      }
      ctx.logger.info(`dsh-hitchfin: migrated ${changed} stored account auth record(s)`)
    })
    .catch((error) => {
      ctx.logger.warn(`dsh-hitchfin: account auth migration failed: ${errorMessage(error)}`)
    })

  const routeServices = { registry, accounts, worker, adapter }
  const cleanups: Array<() => void> = []
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      cleanups.push(registerHitchfinRoutes(scope, routeServices))
    })
  } else if (ctx.webServer) {
    cleanups.push(registerHitchfinRoutes(ctx, routeServices))
  } else {
    ctx.logger.warn('dsh-hitchfin: webServer is unavailable; settings routes are disabled')
  }

  // Cordis 4 ends a plugin through its fiber, not through a `dispose` event.
  // `ctx.on('dispose', ...)` silently never fires here, which used to leak the
  // worker thread and leave the settings route registered across a reload.
  const disposePlugin = (): void => {
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch {
        // The host may already be tearing down its services.
      }
    }
    void worker.stop()
  }
  let teardownRegistered = false
  if (typeof ctx.effect === 'function') {
    try {
      ctx.effect(() => disposePlugin)
      teardownRegistered = true
    } catch {
      // Fall back to the legacy hook below.
    }
  }
  if (!teardownRegistered && typeof ctx.on === 'function') {
    ctx.on('dispose', disposePlugin)
  }

  if (ctx.authorization) {
    for (const descriptor of registry.all()) {
      const firstMethod = descriptor.authMethods[0]
      if (!firstMethod) continue
      const accountId = NATIVE_ACCOUNT_ID
      const key = accountKey(descriptor.id, accountId)
      ctx.authorization.registerFlow({
        key,
        label: descriptor.displayName,
        methods: [{ id: firstMethod.id, label: firstMethod.label }],
        async run(session) {
          const loadInfo = registry.loadInfo(descriptor)
          if (!loadInfo) {
            throw new Error(
              `${descriptor.displayName}: channel package ${descriptor.packageName} is not installed`,
            )
          }

          const existing = await accounts.get(descriptor.id, accountId).catch(() => undefined)
          const started = await worker.authorize(
            loadInfo,
            accountId,
            firstMethod.index,
            {},
            existing?.proxy,
          )
          const onAbort = () => {
            try {
              worker.cancelAuth(started.session)
            } catch {
              // The worker may already be stopping.
            }
          }
          session.signal.addEventListener('abort', onAbort, { once: true })

          try {
            if (started.url || started.instructions) {
              session.notify({
                message: started.instructions || `Continue signing in to ${descriptor.displayName}`,
                ...(started.url ? { url: started.url } : {}),
              })
            }

            let code: string | undefined
            if (started.method === 'code') {
              code = await session.prompt({
                kind: 'text',
                message: `Paste the ${descriptor.displayName} authorization code`,
              })
            }

            const result = await worker.callback(loadInfo, started.session, code, existing?.proxy)
            const now = Date.now()
            // Write through AccountStore so the native flow gets the same
            // normalization, key validation and schema as the settings page,
            // then let the host flow commit that exact record.
            const saved = await accounts.save({
              ...(existing ?? {}),
              channelId: descriptor.id,
              accountId,
              label: existing?.label ?? labelFromAuth(descriptor.displayName, result.auth),
              auth: result.auth,
              freeOnly: existing !== undefined ? existing.freeOnly : descriptor.freeOnlyDefault,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
              ...(existing
                ? {}
                : { enabled: true, priority: (await accounts.list(descriptor.id)).length }),
            })
            await session.commit({ kind: 'grant', payload: saved })
            adapter.forget(descriptor.providerId, accountId)
            adapter.invalidate(descriptor.providerId)
            ctx.emit?.('llm/models-updated', descriptor.providerId)
            ctx.logger.info(`dsh-hitchfin: signed in to ${descriptor.displayName}`)
          } finally {
            session.signal.removeEventListener('abort', onAbort)
          }
        },
      })
    }
  } else {
    ctx.logger.warn('dsh-hitchfin: authorization service is unavailable; sign-in is disabled')
  }
}

export { HitchfinAdapter, SPIKE_PROVIDER }
