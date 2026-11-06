import type { ModelModality } from '../types.js'

export type ChannelId = 'workbuddy-cn' | 'qoder-cn' | 'trae-cn'

export type ChannelStatus = 'stable' | 'experimental'

export type ChannelProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'

export type AuthMethodKind = 'browser' | 'pat' | 'api-key'

export interface AuthMethodDescriptor {
  id: string
  label: string
  kind: AuthMethodKind
  /** Index in the channel package's auth.methods array. */
  index: number
  placeholder?: string
}

export interface ChannelModelDescriptor {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  input: readonly ModelModality[]
  efforts: readonly string[]
  free: boolean
  freeKnown: boolean
}

export interface ChannelDescriptor {
  id: ChannelId
  providerId: string
  packageProvider: string
  displayName: string
  status: ChannelStatus
  protocols: readonly ChannelProtocol[]
  authMethods: readonly AuthMethodDescriptor[]
  freeOnlyDefault: boolean
  supportsFreeWindow: boolean
  packageName: string
  packageVersion: string
  exportName: string
  fallbackPath: string
}

export interface ChannelRuntime {
  descriptor: ChannelDescriptor
  listModels(accountId: string): Promise<readonly ChannelModelDescriptor[]>
  refreshToken(accountId: string): Promise<void>
}
