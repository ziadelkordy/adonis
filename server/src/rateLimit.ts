import type { Context } from 'hono'

/*
 * Fixed-window rate limiting, in memory.
 *
 * Needed now the app is meant to be shared: without it, /auth/login is an open
 * invitation to brute-force a password, and scrypt verification is deliberately
 * expensive, so a flood is also a cheap way to peg the CPU.
 *
 * In-memory means limits are per process and reset on restart. That is honest for
 * a single-instance deployment; running more than one would want Redis or a
 * Postgres-backed counter.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

/** Stops the map growing without bound on a long-running process. */
function sweep(now: number): void {
  if (windows.size < 5000) return
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

export interface RateLimitOptions {
  /** Bucket name, so login and signup don't share a budget. */
  name: string
  limit: number
  windowMs: number
}

/**
 * Keys on the client IP. Behind a proxy that requires trusting an
 * `x-forwarded-for` header, this needs revisiting — a spoofable header would let
 * a caller sidestep the limit entirely, so the direct socket address is used and
 * the proxy header is deliberately ignored.
 */
function clientKey(c: Context, name: string): string {
  const info = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  const address = info?.incoming?.socket?.remoteAddress ?? 'unknown'
  return `${name}:${address}`
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSeconds: number
}

export function checkRateLimit(c: Context, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const key = clientKey(c, options.name)
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + options.windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > options.limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) }
  }

  return { ok: true, retryAfterSeconds: 0 }
}

/** Test seam: lets a suite start from a clean slate. */
export function resetRateLimits(): void {
  windows.clear()
}
