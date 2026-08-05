import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { sql } from './db.ts'

const scrypt = promisify(scryptCallback)

const KEY_LENGTH = 64
const SESSION_DAYS = 30
export const SESSION_COOKIE = 'adonis_session'

/*
 * scrypt is used rather than bcrypt/argon2 purely because it ships in Node's
 * standard library — no native module to build. It is a sound password KDF.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':')
  if (!saltHex || !keyHex) return false

  const expected = Buffer.from(keyHex, 'hex')
  if (expected.length !== KEY_LENGTH) return false

  const derived = (await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH)) as Buffer
  // Constant-time: a fast/slow comparison would leak how much of the hash matched.
  return timingSafeEqual(derived, expected)
}

export interface SessionUser {
  id: string
  email: string
  displayName: string
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await sql`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (${token}, ${userId}, ${expiresAt})
  `

  return { token, expiresAt }
}

export async function findSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null

  const rows = await sql<{ id: string; email: string; display_name: string }[]>`
    SELECT u.id, u.email, u.display_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()
  `

  const row = rows[0]
  return row ? { id: row.id, email: row.email, displayName: row.display_name } : null
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return
  await sql`DELETE FROM sessions WHERE token = ${token}`
}

/** Housekeeping so the table doesn't grow forever. */
export async function pruneExpiredSessions(): Promise<void> {
  await sql`DELETE FROM sessions WHERE expires_at <= now()`
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60
