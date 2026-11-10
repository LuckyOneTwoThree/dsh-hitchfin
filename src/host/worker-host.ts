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
    /** Share used, in percent. */
    used?: number
    /** Count used of `limit`, in `unit` — the vendor's own numbers. */
    amount?: number
    limit?: number
    unit?: string
    /** A number format the vendor already wrote, e.g. "200.0M / 200M". */
    display?: string
    resetsAt?: string
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
  /** Bytes queued before the response head arrived. */
  queuedBytes: number
  ended: boolean
  cleanup?: () => void
  idleTimer?: NodeJS.Timeout
}

export interface ChannelWorkerHostOptions {
  workerPath?: URL
  onAuthChanged?: (channelId: string, accountId: string, auth: unknown) => void | Promise<void>
  onAudit?: (event: { channelId: string; packagePath: string }) => void
  defaultTimeoutMs?: number
  /** Abort a response body that produces no chunk for this long. */
  streamIdleTimeoutMs?: number
}

const CRASH_WINDOW_MS = 30_000
const CRASH_THRESHOLD = 3
const CIRCUIT_MS = 30_000
/** Long enough for a browser sign-in, short enough to stop a leaked attempt. */
const AUTH_CALL_TIMEOUT_MS = 15 * 60_000
/** A stalled vendor connection must not hold a turn open forever. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 5 * 60_000
/**
 * Cap on bytes a single response may queue ahead of its consumer. The worker
 * pushes chunks without waiting for an ack; a slow consumer would otherwise
 * grow both queues without bound.
 */
const MAX_STREAM_BUFFER_BYTES = 8 * 1024 * 1024

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
  /** worker auth session -> pending callback RPC id */
  private readonly authCallIds = new Map<string, number>()
  private readonly defaultTimeoutMs: number
  private readonly streamIdleTimeoutMs: number
  private readonly expectedExits = new WeakSet<Worker>()
  private crashCount = 0
  private lastCrashAt = 0
  private circuitOpenUntil = 0
  private disposed = false
  /** Set when a cancelled auth could not recycle immediately because work was live. */
  private recycleAfterIdle = false
  /**
   * Bumped for every worker we spawn. Auth sessions carry the generation that
   * issued them: a recycled worker restarts its own session counter at 1, so an
   * old id could otherwise match a brand-new sign-in and hand its credentials
   * to the wrong account.
   */
  private workerGeneration = 0

  constructor(private readonly options: ChannelWorkerHostOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000
    this.streamIdleTimeoutMs = options.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  }

  /** Stop rebuilding a worker that keeps dying instead of hammering the host. */
  private noteCrash(at: number): void {
    this.crashCount = at - this.lastCrashAt > CRASH_WINDOW_MS ? 1 : this.crashCount + 1
    this.lastCrashAt = at
    if (this.crashCount >= CRASH_THRESHOLD) {
      this.circuitOpenUntil = at + CIRCUIT_MS
      this.crashCount = 0
    }
  }

  private ensureWorker(): Worker {
    if (this.disposed) {
      throw new HitchfinError('channel worker has been stopped', 'WORKER_STOPPED')
    }
    const now = Date.now()
    if (this.circuitOpenUntil > now) {
      const seconds = Math.ceil((this.circuitOpenUntil - now) / 1000)
      throw new HitchfinError(`channel worker keeps failing; retry in ${seconds}s`, 'SERVER')
    }
    if (this.worker) return this.worker
    this.workerGeneration += 1
    const workerPath = this.options.workerPath ?? new URL('../../worker/index.mjs', import.meta.url)
    const worker = new Worker(workerPath)
    let crashReported = false
    const reportCrash = (): void => {
      if (crashReported || this.expectedExits.has(worker)) return
      crashReported = true
      this.noteCrash(Date.now())
    }
    worker.on('message', (message: unknown) => this.onMessage(message))
    worker.on('error', (error) => {
      if (this.expectedExits.has(worker)) return
      reportCrash()
      if (this.worker === worker || this.worker === null) this.failAll(error)
    })
    worker.on('exit', (code) => {
      const wasCurrent = this.worker === worker
      if (wasCurrent) this.worker = null
      if (this.expectedExits.has(worker)) return
      reportCrash()
      if (wasCurrent || this.worker === null) {
        this.failAll(new Error(`channel worker exited with code ${code}`))
      }
    })
    this.worker = worker
    return worker
  }

  private onMessage(raw: unknown): void {
    try {
      this.routeMessage(raw)
    } catch (error) {
      // A malformed worker message must not become an uncaught exception in
      // the DSH host. Fail only the call it belongs to: aborting every
      // concurrent chat and sign-in over one bad message is worse than losing
      // that one call.
      const failure = error instanceof Error ? error : new Error(errorMessage(error))
      const id = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).id : undefined
      if (typeof id === 'number' && this.failCall(id, failure)) return
      this.failAll(failure)
    } finally {
      this.maybeRecycle()
    }
  }

  /** Fail one pending call or stream; false when the id is unknown. */
  private failCall(id: number, error: Error): boolean {
    const pending = this.pending.get(id)
    if (pending) {
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(error)
      return true
    }
    const stream = this.streams.get(id)
    if (!stream) return false
    this.streams.delete(id)
    stream.cleanup?.()
    this.clearStreamIdle(stream)
    if (stream.headSettled) {
      try {
        stream.controller.error(error)
      } catch {
        // Already closed.
      }
    } else {
      stream.headReject(error)
    }
    try {
      this.send({ type: 'cancelFetch', id })
    } catch {
      // The worker is already gone.
    }
    return true
  }

  private routeMessage(raw: unknown): void {
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

    if (message.type === 'audit') {
      const channelId = String(message.channelId ?? '')
      const packagePath = String(message.packagePath ?? '')
      if (channelId && packagePath) this.options.onAudit?.({ channelId, packagePath })
      return
    }

    const id = typeof message.id === 'number' ? message.id : -1
    const stream = this.streams.get(id)
    if (stream) {
      if (message.type === 'head') {
        stream.headSettled = true
        this.armStreamIdle(id, stream)
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
            stream.queuedBytes = 0
          },
          cancel: () => {
            stream.cleanup?.()
            this.clearStreamIdle(stream)
            this.streams.delete(id)
            try {
              this.send({ type: 'cancelFetch', id })
            } catch {
              // The worker is already gone.
            }
            this.maybeRecycle()
          },
        }, {
          highWaterMark: MAX_STREAM_BUFFER_BYTES,
          size: (chunk: Uint8Array) => chunk.byteLength,
        })
        // 204/205/304 forbid a body; the Response constructor throws otherwise.
        const responseBody = status === 204 || status === 205 || status === 304 ? null : body
        stream.headResolve(new Response(responseBody, { status, headers }))
        return
      }
      if (message.type === 'chunk') {
        const data = typeof message.data === 'string' ? bytesFromBase64(message.data) : null
        if (!data) return
        this.armStreamIdle(id, stream)
        if (!stream.headSettled) {
          stream.queued.push(data)
          stream.queuedBytes += data.byteLength
          if (stream.queuedBytes > MAX_STREAM_BUFFER_BYTES) {
            this.overflowStream(id, stream)
          }
        } else {
          try {
            stream.controller.enqueue(data)
            // A negative desiredSize means the consumer is further behind than
            // the queue budget; stop the stream instead of buffering forever.
            if ((stream.controller.desiredSize ?? 0) < 0) {
              this.overflowStream(id, stream)
            }
          } catch {
            // The reader is gone; drop the chunk.
          }
        }
        return
      }
      if (message.type === 'end') {
        stream.ended = true
        this.clearStreamIdle(stream)
        stream.cleanup?.()
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
        stream.cleanup?.()
        this.clearStreamIdle(stream)
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

  private call<T>(
    type: string,
    payload: Record<string, unknown>,
    timeoutMs = this.defaultTimeoutMs,
    onStart?: (id: number) => void,
  ): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new HitchfinError(`${type} timed out after ${timeoutMs}ms`, 'TIMEOUT'))
        this.maybeRecycle()
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        label: type,
      })
      onStart?.(id)
      try {
        this.send({ id, type, ...payload })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(
          error instanceof Error
            ? error
            : new HitchfinError(errorMessage(error), 'CHANNEL_ERROR'),
        )
        this.maybeRecycle()
      }
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

  /** Tag a worker session with the generation that issued it. */
  private scopeSession(session: string): string {
    return `${this.workerGeneration}:${session}`
  }

  /** The worker-side id, or undefined when that generation is gone. */
  private rawSession(session: string): string | undefined {
    const separator = session.indexOf(':')
    if (separator <= 0) return undefined
    const generation = Number(session.slice(0, separator))
    if (!Number.isInteger(generation) || generation !== this.workerGeneration) return undefined
    return session.slice(separator + 1)
  }

  async authorize(
    channel: ChannelLoadInfo,
    accountId: string,
    method: number,
    inputs: Record<string, string> = {},
    proxy?: string,
  ): Promise<ChannelAuthStart> {
    const started = await this.call<ChannelAuthStart>(
      'authorize',
      { channel, accountId, method, inputs, ...(proxy ? { proxy } : {}) },
      60_000,
    )
    return { ...started, session: this.scopeSession(started.session) }
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
    const workerSession = this.rawSession(session)
    if (workerSession === undefined) {
      throw new HitchfinError('sign-in session expired; start the sign-in again', 'ABORTED')
    }
    let callId: number | undefined
    try {
      return await this.call(
        'callback',
        { channel, session: workerSession, code: code ?? '', ...(proxy ? { proxy } : {}) },
        AUTH_CALL_TIMEOUT_MS,
        (id) => {
          callId = id
          this.authCallIds.set(workerSession, id)
        },
      )
    } finally {
      if (callId !== undefined && this.authCallIds.get(workerSession) === callId) {
        this.authCallIds.delete(workerSession)
      }
    }
  }

  cancelAuth(session: string): void {
    const workerSession = this.rawSession(session)
    // A session from a worker we already recycled has nothing left to cancel.
    if (workerSession === undefined) return
    // Fail the pending callback now. Waiting for its fifteen-minute RPC
    // timeout is what kept a cancelled sign-in (and Trae's loopback server)
    // alive long after the user gave up.
    const callId = this.authCallIds.get(workerSession)
    if (callId !== undefined) {
      this.authCallIds.delete(workerSession)
      const pending = this.pending.get(callId)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(callId)
        pending.reject(new HitchfinError('sign-in cancelled', 'ABORTED'))
      }
    }
    try {
      this.send({ type: 'cancelAuth', session: workerSession })
    } catch {
      // The worker is already gone; there is nothing left to cancel.
    }
    // Trae's browser sign-in opens a loopback callback server. Aborting its
    // signal is not enough to release that server, so recycle the worker once
    // the cancel message has been delivered and no streams or RPC calls are
    // active. If work is still running, remember to recycle as soon as it ends.
    const timer = setTimeout(() => {
      if (this.disposed) return
      if (this.streams.size === 0 && this.pending.size === 0) {
        void this.restart()
      } else {
        this.recycleAfterIdle = true
      }
    }, 500)
    timer.unref?.()
  }

  /** Recycle a worker that was waiting for in-flight work when auth was cancelled. */
  private maybeRecycle(): void {
    if (!this.recycleAfterIdle || this.disposed) return
    if (this.streams.size > 0 || this.pending.size > 0) return
    this.recycleAfterIdle = false
    void this.restart()
  }

  /** Reset the no-chunk watchdog for one response body. */
  private armStreamIdle(id: number, stream: StreamState): void {
    this.clearStreamIdle(stream)
    if (this.disposed || this.streamIdleTimeoutMs <= 0) return
    stream.idleTimer = setTimeout(() => this.timeoutStream(id, stream), this.streamIdleTimeoutMs)
    stream.idleTimer.unref?.()
  }

  private clearStreamIdle(stream: StreamState): void {
    if (!stream.idleTimer) return
    clearTimeout(stream.idleTimer)
    stream.idleTimer = undefined
  }

  private timeoutStream(id: number, stream: StreamState): void {
    if (this.streams.get(id) !== stream) return
    stream.idleTimer = undefined
    this.streams.delete(id)
    stream.cleanup?.()
    try {
      this.send({ type: 'cancelFetch', id })
    } catch {
      // The worker is already gone; the consumer still needs the timeout.
    }
    const error = new HitchfinError(
      `channel stream idle for ${this.streamIdleTimeoutMs}ms`,
      'TIMEOUT',
    )
    if (stream.headSettled) {
      try {
        stream.controller.error(error)
      } catch {
        // Already closed.
      }
    } else {
      stream.headReject(error)
    }
    this.maybeRecycle()
  }

  /** Stop a stream whose consumer fell more than the buffer budget behind. */
  private overflowStream(id: number, stream: StreamState): void {
    if (this.streams.get(id) !== stream) return
    this.streams.delete(id)
    stream.cleanup?.()
    this.clearStreamIdle(stream)
    try {
      this.send({ type: 'cancelFetch', id })
    } catch {
      // The worker is already gone.
    }
    const error = new HitchfinError(
      `channel stream exceeded ${MAX_STREAM_BUFFER_BYTES} bytes of buffering`,
      'CHANNEL_ERROR',
    )
    if (stream.headSettled) {
      try {
        stream.controller.error(error)
      } catch {
        // Already closed.
      }
    } else {
      stream.headReject(error)
    }
    this.maybeRecycle()
  }

  async restart(): Promise<void> {
    this.recycleAfterIdle = false
    // Any sign-in issued by the outgoing worker is dead from here on, even
    // before its replacement exists.
    this.workerGeneration += 1
    this.authCallIds.clear()
    const worker = this.worker
    this.worker = null
    if (worker) {
      this.expectedExits.add(worker)
      await worker.terminate().catch(() => {})
    }
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
        queuedBytes: 0,
        ended: false,
      }
      this.streams.set(id, state)
      this.armStreamIdle(id, state)

      const onAbort = () => {
        state.cleanup?.()
        this.clearStreamIdle(state)
        try {
          this.send({ type: 'cancelFetch', id })
        } catch {
          // The worker is already gone; the consumer still needs the abort.
        }
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
        this.maybeRecycle()
      }
      if (init.signal) {
        if (init.signal.aborted) {
          onAbort()
          return
        }
        const signal = init.signal
        state.cleanup = () => signal.removeEventListener('abort', onAbort)
        signal.addEventListener('abort', onAbort, { once: true })
      }

      try {
        this.send({
          id,
          type: 'fetch',
          channel: options.channel,
          accountId: options.accountId ?? '',
          auth: options.auth,
          freeOnly: options.freeOnly ?? false,
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
      } catch (error) {
        state.cleanup?.()
        this.clearStreamIdle(state)
        this.streams.delete(id)
        reject(
          error instanceof Error
            ? error
            : new HitchfinError(errorMessage(error), 'CHANNEL_ERROR'),
        )
        this.maybeRecycle()
      }
    })
  }

  async stop(): Promise<void> {
    this.disposed = true
    this.recycleAfterIdle = false
    this.authCallIds.clear()
    const worker = this.worker
    this.worker = null
    const stoppedError = new HitchfinError('channel worker stopped', 'WORKER_STOPPED')
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(stoppedError)
    }
    this.pending.clear()
    for (const stream of this.streams.values()) {
      stream.cleanup?.()
      this.clearStreamIdle(stream)
      if (!stream.headSettled) {
        stream.headReject(stoppedError)
      } else {
        try {
          stream.controller.error(stoppedError)
        } catch {
          // already closed
        }
      }
    }
    this.streams.clear()
    if (worker) {
      this.expectedExits.add(worker)
      await worker.terminate().catch(() => {})
    }
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    for (const stream of this.streams.values()) {
      stream.cleanup?.()
      this.clearStreamIdle(stream)
      if (!stream.headSettled) {
        stream.headReject(error)
      } else {
        try {
          stream.controller.error(error)
        } catch {
          // already errored
        }
      }
    }
    this.streams.clear()
  }
}

export { workerError }
