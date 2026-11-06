import { HitchfinAdapter, SPIKE_PROVIDER } from './adapter/hitchfin-adapter.js'
import { AccountStore, accountKey } from './accounts/store.js'
import { errorMessage } from './errors.js'
import { ChannelRegistry } from './channels/registry.js'
import { ChannelWorkerHost } from './host/worker-host.js'
import { registerHitchfinRoutes } from './routes.js'
import type { HitchfinContext } from './types.js'

export const name = 'dsh-hitchfin'
export const inject = ['llm', 'credentials', 'authorization']

export interface HitchfinConfig {
  /** Development: keep the fake spike provider beside the real channels. */
  devSpike?: boolean
  /** Development: show a channel's static models before sign-in. */
  devStaticModels?: boolean
  /** Override channel package entry paths, keyed by channel id. */
  channelPackages?: Record<string, string>
}

export function apply(ctx: HitchfinContext, config: HitchfinConfig = {}): void {
  const registry = new ChannelRegistry(config.channelPackages ?? {})
  const accounts = new AccountStore(ctx.credentials)
  const worker = new ChannelWorkerHost({
    onAuthChanged: (channelId, accountId, auth) => {
      void accounts.updateAuth(channelId, accountId, auth)
    },
  })

  const devSpike = config.devSpike === true
  const adapter = new HitchfinAdapter({
    registry,
    accounts,
    worker,
    logger: ctx.logger,
    devStaticModels: config.devStaticModels ?? false,
  })

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
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => {
      registerHitchfinRoutes(scope, routeServices)
    })
  } else if (ctx.webServer) {
    registerHitchfinRoutes(ctx, routeServices)
  } else {
    ctx.logger.warn('dsh-hitchfin: webServer is unavailable; settings routes are disabled')
  }

  if (ctx.authorization) {
    for (const descriptor of registry.all()) {
      const firstMethod = descriptor.authMethods[0]
      if (!firstMethod) continue
      const accountId = 'acct-1'
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

          const started = await worker.authorize(loadInfo, accountId, firstMethod.index)
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

          const result = await worker.callback(loadInfo, started.session, code)
          const now = Date.now()
          await session.commit({
            kind: 'grant',
            payload: {
              channelId: descriptor.id,
              accountId,
              label: descriptor.displayName,
              auth: result.auth,
              freeOnly: descriptor.freeOnlyDefault,
              createdAt: now,
              updatedAt: now,
            },
          })
          adapter.invalidate(descriptor.providerId)
          ctx.emit?.('llm/models-updated', descriptor.providerId)
          ctx.logger.info(`dsh-hitchfin: signed in to ${descriptor.displayName}`)
        },
      })
    }
  } else {
    ctx.logger.warn('dsh-hitchfin: authorization service is unavailable; sign-in is disabled')
  }
}

export { HitchfinAdapter, SPIKE_PROVIDER }
