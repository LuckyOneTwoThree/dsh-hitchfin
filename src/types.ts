/**
 * Minimal DSH host contracts used by the Phase 1/2 scaffold.
 *
 * These mirror packages/@deepseek-ai/dsh-llm@0.2.2-rc.1 and the credential /
 * authorization seams. They stay local so the scaffold builds without pulling
 * the whole DSH dependency graph; the runtime adapter is duck-typed, as
 * verified by the Phase 0 spike.
 */

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export type ModelModality = 'text' | 'image'

export interface LlmProviderInfo {
  id: string
  name: string
}

export interface LlmModelBadge {
  text: string | Readonly<Record<string, string>>
  tone: 'neutral' | 'info' | 'success' | 'warning'
}

export interface LlmModelInfo {
  provider: string
  id: string
  name: string
  description?: string
  inputModalities?: readonly ModelModality[]
  badge?: LlmModelBadge
}

export interface LlmReasoningEffortInfo {
  id: string
  name: string
  description?: string
}

export interface LlmModelReasoningInfo {
  efforts: readonly LlmReasoningEffortInfo[]
  defaultEffort?: string
}

export interface LlmResolvedModelInfo extends LlmModelInfo {
  context?: { contextWindow: number }
  defaultMaxTokens?: number
  reasoning?: LlmModelReasoningInfo
  systemPromptUpdate?: 'in-history'
  toolUpdate?: 'in-history' | 'addition-only'
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export interface LlmFailure {
  message: string
  code: string
  status?: number
  providerRetryAfterMs?: number
  requestId?: string
}

export type FinishReason =
  | { kind: 'stop' }
  | { kind: 'tool-calls' }
  | { kind: 'max-tokens' }
  | { kind: 'aborted'; failure: LlmFailure }
  | { kind: 'error'; failure: LlmFailure }

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ReasoningBlock {
  type: 'reasoning'
  text: string
}

export interface ToolCallBlock {
  type: 'tool-call'
  id: string
  name: string
  arguments: string
}

export type ContentBlock = TextBlock | ReasoningBlock | ToolCallBlock

/** Loose request-side content block: DSH may also send image/file blocks. */
export type RequestContentBlock =
  | TextBlock
  | ReasoningBlock
  | ToolCallBlock
  | { type: string; [key: string]: unknown }

export interface RequestMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'
  content: readonly RequestContentBlock[]
  source?: { toolCallId?: string }
  [key: string]: unknown
}

export type StreamChunk =
  | { type: 'block-start'; index: number; blockType: 'text' | 'reasoning' | 'tool-call' }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason; replayState?: unknown }

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface GenerateOptions {
  provider: string
  model: string
  messages: readonly RequestMessage[]
  system?: string
  tools?: readonly ToolSchema[]
  signal?: AbortSignal
  sessionId?: string
  purpose?: string
  reasoningEffort?: string
  temperature?: number
  maxTokens?: number
  stop?: readonly string[]
}

export interface PreparedAdapterCall {
  model: LlmResolvedModelInfo
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

export interface HitchfinLlmAdapter {
  providerInfo(provider: string): LlmProviderInfo
  providerRetryPolicy(provider: string): undefined
  listModels(provider: string): Promise<readonly LlmModelInfo[]>
  resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>
  prepareCall(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<PreparedAdapterCall>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

export interface LlmRegistry {
  registerAdapter(providers: string[], adapter: HitchfinLlmAdapter): unknown
}

// ---------------------------------------------------------------------------
// Credentials (ctx.credentials)

export interface CredentialRecord {
  kind: 'api-key' | 'grant'
  key?: string
  env?: Readonly<Record<string, string>>
  payload?: unknown
}

export interface CredentialRecordEntry {
  key: string
  kind: CredentialRecord['kind']
}

export interface CredentialProvider {
  readRecord(key: string): Promise<CredentialRecord | undefined>
  modifyRecord(
    key: string,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined>
  deleteRecord(key: string): Promise<void>
  listRecords(): Promise<readonly CredentialRecordEntry[]>
}

// ---------------------------------------------------------------------------
// Authorization (ctx.authorization)

export interface AuthorizationNotice {
  message: string
  url?: string
  code?: string
}

export type AuthorizationPrompt =
  | { kind: 'text'; message: string; placeholder?: string }
  | { kind: 'secret'; message: string; placeholder?: string }
  | {
      kind: 'select'
      message: string
      options: readonly { id: string; label: string; description?: string }[]
    }

export interface AuthorizationSession {
  readonly method: string
  readonly signal: AbortSignal
  commit(record: CredentialRecord): Promise<void>
  notify(notice: AuthorizationNotice): void
  prompt(prompt: AuthorizationPrompt): Promise<string>
}

export interface AuthorizationFlow {
  key: string
  label: string
  methods: readonly { id: string; label: string }[]
  run(session: AuthorizationSession): Promise<void>
}

export interface AuthorizationService {
  registerFlow(flow: AuthorizationFlow): () => void
}

export interface WebRoute {
  kind: 'prefix' | 'exact'
  path: string
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void
}

export interface WebServerService {
  register(route: WebRoute): (() => void) | void
}

export interface HitchfinContext {
  llm: LlmRegistry
  logger: Logger
  credentials?: CredentialProvider
  authorization?: AuthorizationService
  webServer?: WebServerService
  inject?(deps: string[], callback: (scope: HitchfinContext) => void): void
  get?(name: string): unknown
  emit?(event: string, ...args: unknown[]): void
}
