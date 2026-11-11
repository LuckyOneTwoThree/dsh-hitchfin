import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { ChannelDescriptor } from './descriptor.js'
import type { ChannelLoadInfo } from '../host/worker-host.js'

const require = createRequire(import.meta.url)

const MAGPIE_PLUGINS = join(homedir(), '.config', 'magpie', 'plugins', 'node_modules', '@magpie-community')

/** How a channel package entry was found; surfaced so a stale copy is visible. */
export type PackageSource = 'installed' | 'override' | 'magpie-fallback'

export interface ChannelPackageInfo {
  path: string
  source: PackageSource
  /** Version declared by the package on disk, when it can be read. */
  version?: string
  /** Version this plugin's auth-method indexes were written against. */
  expectedVersion: string
  /** `undefined` when the package version could not be read. */
  versionMatches?: boolean
}

function fallbackPackagePath(name: string): string {
  return join(MAGPIE_PLUGINS, name, 'index.mjs')
}

function resolveInstalled(packageName: string): string | undefined {
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
  return undefined
}

/** Read the nearest package.json above a module entry. */
function readPackageVersion(entryPath: string): string | undefined {
  let directory = dirname(resolve(entryPath))
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, 'package.json')
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: unknown }
        return typeof parsed.version === 'string' ? parsed.version : undefined
      } catch {
        return undefined
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
  return undefined
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
  status: 'stable',
  protocols: ['openai-completions'],
  authMethods: [{ id: 'browser', label: '浏览器登录', kind: 'browser', index: 0 }],
  freeOnlyDefault: true,
  supportsFreeWindow: false,
  packageName: '@magpie-community/opencode-trae-auth',
  packageVersion: '0.2.30',
  exportName: 'TraeCNAuthPlugin',
  fallbackPath: fallbackPackagePath('opencode-trae-auth'),
}

export interface ChannelRegistryOptions {
  /** Channel id -> explicit package entry path. */
  overrides?: Record<string, string>
  /**
   * Allow loading a channel package from `~/.config/magpie/plugins`. That tree
   * is user-writable and outside this plugin's dependency graph, so it is off
   * unless the operator asks for it.
   */
  allowMagpieFallback?: boolean
}

export class ChannelRegistry {
  private readonly channels = new Map<string, ChannelDescriptor>([
    [WORKBUDDY.providerId, WORKBUDDY],
    [QODER.providerId, QODER],
    [TRAE.providerId, TRAE],
  ])

  private readonly overrides: Record<string, string>
  private readonly allowMagpieFallback: boolean
  /** Resolution is disk-bound and stable for a process; `/state` asks often. */
  private readonly packageCache = new Map<string, ChannelPackageInfo | undefined>()

  constructor(options: ChannelRegistryOptions = {}) {
    this.overrides = options.overrides ?? {}
    this.allowMagpieFallback = options.allowMagpieFallback === true
  }

  all(): readonly ChannelDescriptor[] {
    return [...this.channels.values()]
  }

  get(providerId: string): ChannelDescriptor | undefined {
    return this.channels.get(providerId)
  }

  providerIds(): readonly string[] {
    return [...this.channels.keys()]
  }

  /** Where a channel's package would be loaded from, plus its declared version. */
  packageInfo(descriptor: ChannelDescriptor): ChannelPackageInfo | undefined {
    const cached = this.packageCache.get(descriptor.id)
    if (cached !== undefined || this.packageCache.has(descriptor.id)) return cached
    const info = this.resolvePackageInfo(descriptor)
    this.packageCache.set(descriptor.id, info)
    return info
  }

  private resolvePackageInfo(descriptor: ChannelDescriptor): ChannelPackageInfo | undefined {
    const override = this.overrides[descriptor.id]
    const installed = override ?? resolveInstalled(descriptor.packageName)
    const source: PackageSource = override
      ? 'override'
      : installed
        ? 'installed'
        : 'magpie-fallback'
    const path =
      installed ??
      (this.allowMagpieFallback && existsSync(descriptor.fallbackPath)
        ? descriptor.fallbackPath
        : undefined)
    if (!path) return undefined
    const version = readPackageVersion(path)
    return {
      path,
      source,
      ...(version ? { version } : {}),
      expectedVersion: descriptor.packageVersion,
      ...(version ? { versionMatches: version === descriptor.packageVersion } : {}),
    }
  }

  packagePath(descriptor: ChannelDescriptor): string | undefined {
    return this.packageInfo(descriptor)?.path
  }

  loadInfo(descriptor: ChannelDescriptor, options: Record<string, unknown> = {}): ChannelLoadInfo | undefined {
    const info = this.packageInfo(descriptor)
    if (!info) return undefined
    return {
      channelId: descriptor.id,
      packagePath: info.path,
      exportName: descriptor.exportName,
      provider: descriptor.packageProvider,
      options,
    }
  }
}
