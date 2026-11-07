import { Worker } from 'node:worker_threads'
import { HitchfinError, errorMessage } from '../errors.js'
import type { ChannelProtocol } from '../channels/descriptor.js'

export interface ChannelLoadInfo {
  channelId: string
  packagePath: string
  exportName: string
  provider: string
  /** Channel-package options, e.g. free_only. */
  options?: Record<string, unknown>
}

export interface ChannelCallOptions {
  channel: ChannelLoadInfo
  accountId?: string
  auth?: unknown
  freeOnly?: boolean
  model?: string
  proxy?: string
}

export interface ChannelModelRecord {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  input: readonly ('text' | 'image')[]
  efforts: readonly string[]
  free: boolean
  freeKnown: boolean
  /** Set by the channel package's model metadata (api/provider npm). */
  protocol?: ChannelProtocol
}

export interface ChannelUsageRecord {
  plan?: string
  user?: string
  until?: string
  balance?: string
  windows?: readonly {
    name: string
    used?: number
    resetsAt?: string
    display?: string
    free?: boolean
  }[]
  [key: string]: unknown
}

export interface ChannelAuthStart {
  session: string
  url?: string
  instructions?: string
  method?: 'auto' | 'code'
  opened?: boolean
}

export interface ChannelAuthResult {
  provider?: string
  auth: unknown
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  label: string
}

interface StreamState {
  controller: ReadableStreamDefaultController<Uint8Array>
  headResolve: (response: Response) => void
  headReject: (error: Error) => void
  headSettled: boolean
  queued: Uint8Array[]
  ended: boolean
}

export interface ChannelWorkerHostOptions {
  workerPath?: URL
  onAuthChanged?: (channelId: string, accountId: string, auth: unknown) => void | Promise<void>
  defaultTimeoutMs?: number
}

function bytesFromBase64(data: string): Uint8Array {
  return Uint8Array.from(Buffer.from(data, 'base64'))
}

function workerError(payload: unknown): HitchfinError {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : 'channel worker failed'
    const code = typeof record.code === 'string' ? record.code : 'CHANNEL_ERROR'
    const status = typeof record.status === 'number' ? record.status : undefined
    const retryAfter =
      typeof record.providerRetryAfterMs === 'number'
        ? record.providerRetryAfterMs
        : undefined
    return new HitchfinError(message, code, {
      ...(status !== undefined ? { status } : {}),
      ...(retryAfter !== undefined ? { providerRetryAfterMs: retryAfter } : {}),
    })
  }
  return new HitchfinError(errorMessage(payload), 'CHANNEL_ERROR')
}

/**
 * Host-side worker boundary. The worker runs the community channel packages so
 * a broken package cannot take down the DSH host; the host only sends the
 * selected account's auth snapshot with each operation.
 */
export class ChannelWorkerHost {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingCall>()
  private readonly streams = new Map<number, StreamState>()
  private readonly defaultTimeoutMs: number

  constructor(private readonly options: ChannelWorkerHostOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const workerPath = this.options.workerPath ?? new URL('../../worker/index.mjs', import.meta.url)
    const worker = new Worker(workerPath)
    worker.on('message', (message: unknown) => this.onMessage(message))
    worker.on('error', (error) => this.failAll(error))
    worker.on('exit', (code) => {
      if (this.worker === worker) this.worker = null
      this.failAll(new Error(`channel worker exited with code ${code}`))
    })
    this.worker = worker
    return worker
  }

  private onMessage(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    const message = raw as Record<string, unknown>

    if (message.type === 'authChanged') {
      const channelId = String(message.channelId ?? '')
      const accountId = String(message.accountId ?? '')
      if (channelId && accountId) {
        void this.options.onAuthChanged?.(channelId, accountId, message.auth)
      }
      return
    }

    const id = typeof message.id === 'number' ? message.id : -1
    const stream = this.streams.get(id)
    if (stream) {
      if (message.type === 'head') {
        stream.headSettled = true
        const status = typeof message.status === 'number' ? message.status : 200
        const headers = new Headers(
          message.headers && typeof message.headers === 'object'
            ? (message.headers as Record<string, string>)
            : {},
        )
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => {
            stream.controller = controller
            for (const chunk of stream.queued) controller.enqueue(chunk)
            stream.queued = []
          },
          cancel: () => {
            this.send({ type: 'cancelFetch', id })
          },
        })
        stream.headResolve(new Response(body, { status, headers }))
        return
      }
      if (message.type === 'chunk') {
        const data = typeof message.data === 'string' ? bytesFromBase64(message.data) : null
        if (!data) return
        if (!stream.headSettled) {
          stream.queued.push(data)
        } else {
          try {
            stream.controller.enqueue(data)
          } catch {
            // The reader is gone; drop the chunk.
          }
        }
        return
      }
      if (message.type === 'end') {
        stream.ended = true
        try {
          stream.controller.close()
        } catch {
          // Already closed.
        }
        this.streams.delete(id)
        if (!stream.headSettled) {
          stream.headReject(new HitchfinError('channel stream ended before headers', 'TRANSPORT'))
        }
        return
      }
      if (message.type === 'error') {
        this.streams.delete(id)
        const error = workerError(message.error)
        if (!stream.headSettled) {
          stream.headReject(error)
        } else {
          try {
            stream.controller.error(error)
          } catch {
            // Already errored.
          }
        }
        return
      }
    }

    const pending = this.pending.get(id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(id)
    if (message.ok === false || message.error !== undefined) {
      pending.reject(workerError(message.error ?? { message: `${pending.label} failed` }))
    } else {
      pending.resolve(message.result)
    }
  }

  private send(message: Record<string, unknown>): void {
    this.ensureWorker().postMessage(message)
  }

  private call<T>(type: string, payload: Record<string, unknown>, timeoutMs = this.defaultTimeoutMs): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new HitchfinError(`${type} timed out after ${timeoutMs}ms`, 'TIMEOUT'))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        label: type,
      })
      this.send({ id, type, ...payload })
    })
  }

  async describe(channel: ChannelLoadInfo): Promise<Record<string, unknown>> {
    return this.call('describe', { channel })
  }

  async models(
    options: ChannelCallOptions,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<readonly ChannelModelRecord[]> {
    const result = await this.call<{ models?: ChannelModelRecord[] }>(
      'models',
      {
        channel: options.channel,
        accountId: options.accountId ?? '',
        auth: options.auth,
        freeOnly: options.freeOnly ?? false,
        ...(options.proxy ? { proxy: options.proxy } : {}),
      },
      timeoutMs,
    )
    return result.models ?? []
  }

  async usage(options: ChannelCallOptions, timeoutMs = 30_000): Promise<ChannelUsageRecord> {
    const result = await this.call<{ usage?: ChannelUsageRecord }>(
      'usage',
      {
        channel: options.channel,
        accountId: options.accountId ?? '',
        auth: options.auth,
        ...(options.proxy ? { proxy: options.proxy } : {}),
      },
      timeoutMs,
    )
    return result.usage ?? {}
  }

  async authorize(
    channel: ChannelLoadInfo,
    accountId: string,
    method: number,
    inputs: Record<string, string> = {},
    proxy?: string,
  ): Promise<ChannelAuthStart> {
    return this.call(
      'authorize',
      { channel, accountId, method, inputs, ...(proxy ? { proxy } : {}) },
      60_000,
    )
  }

  async apiKey(
    channel: ChannelLoadInfo,
    accountId: string,
    method: number,
    key: string,
    inputs: Record<string, string> = {},
  ): Promise<ChannelAuthResult> {
    return this.call(
      'apiKey',
      { channel, accountId, method, key, inputs },
      60_000,
    )
  }

  async callback(
    channel: ChannelLoadInfo,
    session: string,
    code?: string,
    proxy?: string,
  ): Promise<ChannelAuthResult> {
    return this.call(
      'callback',
      { channel, session, code: code ?? '', ...(proxy ? { proxy } : {}) },
      15 * 60_000,
    )
  }

  cancelAuth(session: string): void {
    this.send({ type: 'cancelAuth', session })
    // Trae's browser sign-in opens a loopback callback server. Aborting its
    // signal is not enough to release that server, so recycle the worker once
    // the cancel message has been delivered and no streams are actively using it.
    setTimeout(() => {
      if (this.streams.size === 0) {
        void this.restart()
      } else {
        const check = setInterval(() => {
          if (this.streams.size === 0) {
            clearInterval(check)
            void this.restart()
          }
        }, 1000)
      }
    }, 500)
  }

  async restart(): Promise<void> {
    const worker = this.worker
    this.worker = null
    if (worker) await worker.terminate().catch(() => {})
  }

  async fetch(
    input: string,
    init: RequestInit,
    options: ChannelCallOptions & { sessionId?: string },
  ): Promise<Response> {
    const id = this.nextId++
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value
    })

    return new Promise<Response>((resolve, reject) => {
      const state: StreamState = {
        controller: null as unknown as ReadableStreamDefaultController<Uint8Array>,
        headResolve: resolve,
        headReject: reject,
        headSettled: false,
        queued: [],
        ended: false,
      }
      this.streams.set(id, state)

      const onAbort = () => {
        this.send({ type: 'cancelFetch', id })
        const error = new HitchfinError('request aborted', 'ABORTED')
        if (state.headSettled) {
          try {
            state.controller.error(error)
          } catch {
            // already errored
          }
        } else {
          state.headReject(error)
        }
        this.streams.delete(id)
      }
      if (init.signal) {
        if (init.signal.aborted) {
          onAbort()
          return
        }
        init.signal.addEventListener('abort', onAbort, { once: true })
      }

      this.send({
        id,
        type: 'fetch',
        channel: options.channel,
        accountId: options.accountId ?? '',
        auth: options.auth,
        model: options.model ?? '',
        sessionId: options.sessionId ?? '',
        ...(options.proxy ? { proxy: options.proxy } : {}),
        request: {
          url: input,
          method: init.method ?? 'POST',
          headers,
          body: typeof init.body === 'string' ? init.body : undefined,
        },
      })
    })
  }

  async stop(): Promise<void> {
    const worker = this.worker
    this.worker = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new HitchfinError('channel worker stopped', 'WORKER_STOPPED'))
    }
    this.pending.clear()
    for (const stream of this.streams.values()) {
      try {
        stream.controller.error(new HitchfinError('channel worker stopped', 'WORKER_STOPPED'))
      } catch {
        // already closed
      }
    }
    this.streams.clear()
    if (worker) await worker.terminate()
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    for (const stream of this.streams.values()) {
      if (!stream.headSettled) stream.headReject(error)
    }
    this.streams.clear()
  }
}

export { workerError }
