import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATABASE_URL, sql } from './db.ts'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

/**
 * Applies every .sql file in migrations/ in filename order, recording each one so
 * it is never applied twice. The migrations themselves are also written to be
 * individually idempotent, which keeps a half-applied file from wedging things.
 */
async function migrate(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort()
  const applied = new Set(
    (await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`).map(
      (row) => row.filename,
    ),
  )

  let ran = 0
  for (const filename of files) {
    if (applied.has(filename)) continue

    const contents = await readFile(join(MIGRATIONS_DIR, filename), 'utf8')
    // sql.unsafe is required for multi-statement DDL; the input is a local file,
    // never user data.
    await sql.begin(async (tx) => {
      await tx.unsafe(contents)
      await tx`INSERT INTO schema_migrations (filename) VALUES (${filename})`
    })
    console.log(`applied ${filename}`)
    ran += 1
  }

  console.log(ran === 0 ? 'no new migrations' : `${ran} migration(s) applied`)
}

try {
  console.log(`migrating ${DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`)
  await migrate()
  await sql.end()
} catch (error) {
  console.error('migration failed:', error instanceof Error ? error.message : error)
  await sql.end({ timeout: 5 })
  process.exit(1)
}
