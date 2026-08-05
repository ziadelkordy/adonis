import { useState } from 'react'
import { ApiError } from '@/lib/api'
import { cx } from '@/lib/cx'
import type { AppState } from '@/lib/useAppState'
import { Button } from './ui'

type Mode = 'login' | 'signup'

const FIELD_CLASSES =
  'h-11 w-full rounded-full bg-shell px-4 text-sm text-ink-900 ring-1 ring-ink-200 ring-inset ' +
  'shadow-low transition placeholder:text-ink-400 hover:ring-sun-300 focus:ring-2 ' +
  'focus:ring-bloom-400 focus:outline-none'

export function AuthPanel({
  state,
  heading,
  description,
}: {
  state: AppState
  heading: string
  description: string
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      if (mode === 'signup') await state.signup(email, password, displayName)
      else await state.login(email, password)
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-shell bg-shell p-6 ring-1 ring-ink-200/70 ring-inset shadow-mid sm:p-8">
      <h2 className="text-2xl font-semibold text-ink-900">{heading}</h2>
      <p className="mt-2 text-sm text-ink-700">{description}</p>

      {/* Mode switch */}
      <div className="mt-6 flex gap-1 rounded-full bg-sand/80 p-1 ring-1 ring-ink-200/70 ring-inset">
        {(['login', 'signup'] as Mode[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option)
              setError(null)
            }}
            aria-pressed={mode === option}
            className={cx(
              'h-9 flex-1 rounded-full text-sm font-medium transition-colors duration-200',
              mode === option
                ? 'bg-shell text-ink-900 shadow-low'
                : 'text-ink-500 hover:text-ink-800',
            )}
          >
            {option === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {mode === 'signup' && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-900">Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="What should we call you?"
              autoComplete="name"
              className={FIELD_CLASSES}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-900">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={FIELD_CLASSES}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-900">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className={FIELD_CLASSES}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-petal bg-bloom-50 px-3.5 py-2.5 text-sm font-medium text-bloom-700"
          >
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-ink-500">
        Your day and saved places are stored on your own machine, in Adonis's database.
      </p>
    </div>
  )
}
