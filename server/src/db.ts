import postgres from 'postgres'

const DEFAULT_URL = 'postgres://adonis:adonis_dev@localhost:5433/adonis'

export const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_URL

/**
 * Whether to negotiate TLS.
 *
 * Managed Postgres (Neon, Render, Supabase, RDS) refuses plaintext connections,
 * and their connection strings advertise that with `?sslmode=require`. Set
 * explicitly rather than relying on the driver's URL parsing, because getting it
 * wrong shows up only at deploy time as an unhelpful connection error.
 *
 * `'require'` encrypts without verifying the certificate chain — right for hosted
 * providers that present certificates the container has no root for. Local
 * development stays plaintext.
 */
function sslSetting(url: string): 'require' | false {
  if (/[?&]sslmode=(require|prefer|verify-ca|verify-full)/.test(url)) return 'require'
  // Local development, and anything explicitly asking for no TLS.
  if (/localhost|127\.0\.0\.1|host\.docker\.internal/.test(url)) return false
  // A remote host with no sslmode given: assume TLS, since managed hosts demand it.
  return /[?&]sslmode=disable/.test(url) ? false : 'require'
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  // Surface real errors rather than a generic "connection closed" after a hang.
  connect_timeout: 10,
  ssl: sslSetting(DATABASE_URL),
  onnotice: () => {},
})

export async function assertDatabaseReachable(): Promise<void> {
  await sql`SELECT 1`
}

/** Exported for tests; the logic is easy to get subtly wrong. */
export { sslSetting }
