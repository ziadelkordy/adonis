import { useState } from 'react'
import { Button } from './ui'

/*
 * Shown once, immediately after signing up.
 *
 * There is no email provider behind this app, so these codes are the entire
 * account-recovery story — if they are lost, the account is unreachable and nobody,
 * including us, can restore it. That makes this screen unusually load-bearing for
 * something that looks like a confirmation dialog, which is why it blocks on an
 * explicit acknowledgement rather than offering a dismiss button.
 */

interface RecoveryCodesProps {
  codes: string[]
  onDone: () => void
  /** Wording differs between "you just signed up" and "you asked for new ones". */
  regenerated?: boolean
}

export function RecoveryCodes({ codes, onDone, regenerated = false }: RecoveryCodesProps) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const asText = codes.join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText)
      setCopied(true)
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers. The codes
      // are on screen and downloadable, so this is a convenience, not the route.
      setCopied(false)
    }
  }

  const download = () => {
    /*
     * A plain text file, built locally — the codes must never travel anywhere to be
     * saved. Revoked immediately so the blob isn't left in memory.
     */
    const blob = new Blob([`Adonis recovery codes\n\n${asText}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'adonis-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/45 p-4 py-[8vh] backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-heading"
        className="w-full max-w-lg rounded-shell bg-shell p-6 shadow-high sm:p-8"
      >
        <h2 id="recovery-heading" className="text-2xl font-semibold text-ink-900">
          {regenerated ? 'Your new recovery codes' : 'Save your recovery codes'}
        </h2>

        <p className="mt-2 text-sm text-ink-700">
          These are the only way back into your account if you forget your password.
          Adonis can’t email you a reset link, and can’t recover these for you — so
          keep them somewhere safe now.
        </p>

        {regenerated && (
          <p className="mt-2 text-sm font-medium text-bloom-600">
            Your previous codes no longer work.
          </p>
        )}

        <ul className="mt-5 grid grid-cols-1 gap-1.5 rounded-petal bg-cream p-4 font-mono text-sm text-ink-900 ring-1 ring-ink-200 ring-inset sm:grid-cols-2">
          {codes.map((code) => (
            <li key={code} className="tracking-tight">
              {code}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="secondary" size="sm" onClick={download}>
            Download
          </Button>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-bloom-500"
          />
          <span>I’ve saved these codes somewhere I can find them.</span>
        </label>

        {/*
          * Gated on the checkbox rather than trusting a glance. Someone who clicks
          * past this and later forgets their password has no recourse at all, so a
          * moment of friction here is the cheapest thing in the flow.
          */}
        <Button size="lg" disabled={!confirmed} onClick={onDone} className="mt-4 w-full">
          Continue
        </Button>
      </div>
    </div>
  )
}
