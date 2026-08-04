import postgres from 'postgres'

const DEFAULT_URL = 'postgres://sundial:sundial_dev@localhost:5433/sundial'

export const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_URL

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  // Surface real errors rather than a generic "connection closed" after a hang.
  connect_timeout: 10,
  onnotice: () => {},
})

export async function assertDatabaseReachable(): Promise<void> {
  await sql`SELECT 1`
}
