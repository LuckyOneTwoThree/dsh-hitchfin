export interface HitchfinErrorOptions {
  status?: number
  providerRetryAfterMs?: number
  cause?: unknown
}

/** A channel/upstream failure that the adapter turns into a terminal finish. */
export class HitchfinError extends Error {
  readonly code: string
  readonly status?: number
  readonly providerRetryAfterMs?: number

  constructor(message: string, code: string, options: HitchfinErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'HitchfinError'
    this.code = code
    this.status = options.status
    this.providerRetryAfterMs = options.providerRetryAfterMs
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
