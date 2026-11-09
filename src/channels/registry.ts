import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ChannelDescriptor } from './descriptor.js'
import type { ChannelLoadInfo } from '../host/worker-host.js'

const require = createRequire(import.meta.url)

const MAGPIE_PLUGINS = join(homedir(), '.config', 'magpie', 'plugins', 'node_modules', '@magpie-community')

function fallbackPackagePath(name: string): string {
  return join(MAGPIE_PLUGINS, name, 'index.mjs')
}

function resolvePackagePath(packageName: string, fallbackPath: string): string | undefined {
  // The channel packages export their OpenCode 2.x face at ".", so
  // `${packageName}/index.mjs` and `${packageName}/package.json` may both be
  // blocked by their exports map. Resolve the package main, then take the
  // 1.x entry beside it.
  try {
    const main = require.resolve(packageName)
    const indexPath = join(dirname(main), 'index.mjs')
    if (existsSync(indexPath)) return indexPath
    return main
  } catch {
    // Not installed beside the plugin; try package.json and the dev fallback.
  }
  try {
    const pkgJson = require.resolve(`${packageName}/package.json`)
    const indexPath = join(dirname(pkgJson), 'index.mjs')
    if (existsSync(indexPath)) return indexPath
  } catch {
    // Fall through to the dev fallback.
  }
  return existsSync(fallbackPath) ? fallbackPath : undefined
}

export const WORKBUDDY: ChannelDescriptor = {
  id: 'workbuddy-cn',
  providerId: 'hitchfin-workbuddy-cn',
  packageProvider: 'workbuddy',
  displayName: 'WorkBuddy CN',
  status: 'stable',
  protocols: ['openai-completions', 'anthropic-messages'],
  // Indexes mirror the channel package's auth.methods (0 browser, 1 desktop,
  // 2 api). The desktop entry is not exposed: WorkBuddy 5.6+ seals its local
  // tokens and the package refuses to read them. Keep index 2 for the API key
  // so it still maps to the package's third method.
  authMethods: [
    { id: 'browser', label: '浏览器登录', kind: 'browser', index: 0 },
    {
      id: 'api-key',
      label: 'WorkBuddy API Key',
      kind: 'api-key',
      index: 2,
      placeholder: 'sk-...',
    },
  ],
  freeOnlyDefault: true,
  supportsFreeWindow: true,
  packageName: '@magpie-community/opencode-workbuddy-auth',
  packageVersion: '0.2.24',
  exportName: 'WorkBuddyAuthPlugin',
  fallbackPath: fallbackPackagePath('opencode-workbuddy-auth'),
}

export const QODER: ChannelDescriptor = {
  id: 'qoder-cn',
  providerId: 'hitchfin-qoder-cn',
  packageProvider: 'qoder-cn',
  displayName: 'Qoder CN',
  status: 'stable',
  protocols: ['openai-completions'],
  authMethods: [
    { id: 'browser', label: '浏览器登录', kind: 'browser', index: 0 },
    {
      id: 'pat',
      label: 'Qoder PAT',
      kind: 'pat',
      index: 1,
      placeholder: 'pt-...',
    },
  ],
  freeOnlyDefault: true,
  supportsFreeWindow: true,
  packageName: '@magpie-community/opencode-qoder-auth',
  packageVersion: '0.2.61',
  exportName: 'QoderCNAuthPlugin',
  fallbackPath: fallbackPackagePath('opencode-qoder-auth'),
}

export const TRAE: ChannelDescriptor = {
  id: 'trae-cn',
  providerId: 'hitchfin-trae-cn',
  packageProvider: 'trae-cn',
  displayName: 'Trae CN',
  status: 'experimental',
  protocols: ['openai-completions'],
  authMethods: [{ id: 'browser', label: '浏览器登录', kind: 'browser', index: 0 }],
  freeOnlyDefault: true,
  supportsFreeWindow: false,
  packageName: '@magpie-community/opencode-trae-auth',
  packageVersion: '0.2.30',
  exportName: 'TraeCNAuthPlugin',
  fallbackPath: fallbackPackagePath('opencode-trae-auth'),
}

export class ChannelRegistry {
  private readonly channels = new Map<string, ChannelDescriptor>([
    [WORKBUDDY.providerId, WORKBUDDY],
    [QODER.providerId, QODER],
    [TRAE.providerId, TRAE],
  ])

  constructor(private readonly overrides: Record<string, string> = {}) {}

  all(): readonly ChannelDescriptor[] {
    return [...this.channels.values()]
  }

  get(providerId: string): ChannelDescriptor | undefined {
    return this.channels.get(providerId)
  }

  providerIds(): readonly string[] {
    return [...this.channels.keys()]
  }

  packagePath(descriptor: ChannelDescriptor): string | undefined {
    return this.overrides[descriptor.id] ?? resolvePackagePath(descriptor.packageName, descriptor.fallbackPath)
  }

  loadInfo(descriptor: ChannelDescriptor, options: Record<string, unknown> = {}): ChannelLoadInfo | undefined {
    const packagePath = this.packagePath(descriptor)
    if (!packagePath) return undefined
    return {
      channelId: descriptor.id,
      packagePath,
      exportName: descriptor.exportName,
      provider: descriptor.packageProvider,
      options,
    }
  }
}
