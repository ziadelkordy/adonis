import { describe, expect, it } from 'vitest'
import { sslSetting } from './db.ts'

/*
 * Getting this wrong only shows up at deploy time, as a connection error that
 * says nothing about TLS — worth pinning down.
 */
describe('sslSetting', () => {
  it('stays plaintext for local development', () => {
    expect(sslSetting('postgres://adonis:pw@localhost:5433/adonis')).toBe(false)
    expect(sslSetting('postgres://adonis:pw@127.0.0.1:5433/adonis')).toBe(false)
    // How the container reaches a database on the host machine.
    expect(sslSetting('postgres://adonis:pw@host.docker.internal:5433/adonis')).toBe(false)
  })

  it('requires TLS when the connection string asks for it', () => {
    for (const mode of ['require', 'prefer', 'verify-ca', 'verify-full']) {
      expect(sslSetting(`postgres://u:p@db.neon.tech/main?sslmode=${mode}`)).toBe('require')
    }
  })

  it('assumes TLS for a remote host that says nothing', () => {
    // Managed providers refuse plaintext, so defaulting off would just fail.
    expect(sslSetting('postgres://u:p@ep-cool-123.us-east-2.aws.neon.tech/main')).toBe('require')
  })

  it('honours an explicit opt-out', () => {
    expect(sslSetting('postgres://u:p@somewhere.internal/db?sslmode=disable')).toBe(false)
  })

  it('finds sslmode when it is not the first parameter', () => {
    expect(sslSetting('postgres://u:p@host/db?application_name=adonis&sslmode=require')).toBe(
      'require',
    )
  })
})
