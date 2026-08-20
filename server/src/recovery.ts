/*
 * Account recovery without email. See migrations/005_recovery_codes.sql for why
 * codes rather than a reset link, and why they are hashed with SHA-256 rather than
 * scrypt.
 */

import { createHash, randomBytes } from 'node:crypto'
import { sql } from './db.ts'

/**
 * How many codes are issued.
 *
 * Enough that losing one or two doesn't matter, few enough that someone will
 * actually keep them. Each is single-use, so this is also the number of times an
 * account can be recovered before new codes must be generated.
 */
const CODE_COUNT = 8

/*
 * Crockford's base32 minus the letters that get misread when copying by hand: no
 * I, L, O or U. People will write these on paper, and a code that cannot be
 * transcribed reliably is not a recovery mechanism.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 16 characters over a 32-letter alphabet — 80 bits, far past guessable. */
const CODE_LENGTH = 16

function generateCode(): string {
  // rejection-free: 32 divides 256 evenly, so no modulo bias.
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length]
  // Grouped for legibility when written down; the groups are stripped on input.
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12)}`
}

/**
 * Strips formatting so a code matches however it was typed.
 *
 * People will paste it with the dashes, type it without them, or lowercase it. All
 * three must work, or the code is useless at the moment it's needed most.
 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function hashCode(input: string): string {
  return createHash('sha256').update(normalizeCode(input)).digest('hex')
}

/**
 * Issues a fresh set, replacing any that exist.
 *
 * Replacing rather than adding is the point: regenerating is what you do when you
 * think the old list leaked, so the old list must stop working.
 *
 * Returns the plaintext codes — the only time they exist outside the caller's
 * screen. They are not recoverable afterwards, by us or by anyone.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, generateCode)

  await sql.begin(async (tx) => {
    await tx`DELETE FROM recovery_codes WHERE user_id = ${userId}`
    await tx`
      INSERT INTO recovery_codes ${tx(
        codes.map((code) => ({ user_id: userId, code_hash: hashCode(code) })),
      )}
    `
  })

  return codes
}

/**
 * Spends a code and returns whose account it belongs to.
 *
 * The update is conditional on `used_at IS NULL` and returns the row it changed,
 * so two simultaneous attempts with the same code cannot both succeed — the second
 * matches nothing. Doing this as a read-then-write would leave exactly that race.
 */
export async function consumeRecoveryCode(input: string): Promise<string | null> {
  const normalized = normalizeCode(input)
  // Reject obvious non-codes before touching the database.
  if (normalized.length !== CODE_LENGTH) return null

  const rows = await sql<{ user_id: string }[]>`
    UPDATE recovery_codes
    SET used_at = now()
    WHERE code_hash = ${hashCode(normalized)} AND used_at IS NULL
    RETURNING user_id
  `
  return rows[0]?.user_id ?? null
}

/** How many codes remain, so the UI can warn before they run out. */
export async function remainingCodeCount(userId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM recovery_codes
    WHERE user_id = ${userId} AND used_at IS NULL
  `
  return row?.count ?? 0
}
