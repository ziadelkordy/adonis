import { useState } from 'react'
import { ApiError } from '@/lib/api'
import { cx } from '@/lib/cx'
import type { AppState } from '@/lib/useAppState'
import { Button } from './ui'

type Mode = 'login' | 'signup' | 'reset'

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
  const [recoveryCode, setRecoveryCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      if (mode === 'signup') await state.signup(email, password, displayName)
      else if (mode === 'reset') await state.resetPassword(recoveryCode, password)
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
            aria-pressed={mode === option || (mode === 'reset' && option === 'login')}
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

        {mode === 'reset' && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-900">Recovery code</span>
            <input
              type="text"
              required
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
              placeholder="ABCD-2345-EFGH-6789"
              autoComplete="off"
              spellCheck={false}
              className={`${FIELD_CLASSES} font-mono`}
            />
            {/* No email asked for: the code identifies the account by itself, and
                asking would reveal which addresses are registered. */}
            <span className="mt-1.5 block text-xs text-ink-500">
              One of the codes you saved when you signed up. Each works once.
            </span>
          </label>
        )}

        {mode !== 'reset' && (
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
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-900">
            {mode === 'reset' ? 'New password' : 'Password'}
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
          {busy
            ? 'One moment…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'reset'
                ? 'Set new password'
                : 'Sign in'}
        </Button>
      </form>

      {mode !== 'signup' && (
        <p className="mt-3 text-center text-xs text-ink-500">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => {
                setMode('reset')
                setError(null)
              }}
              className="underline underline-offset-2 hover:text-ink-800"
            >
              Forgotten your password?
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError(null)
              }}
              className="underline underline-offset-2 hover:text-ink-800"
            >
              Back to signing in
            </button>
          )}
        </p>
      )}

      <p className="mt-4 text-center text-xs text-ink-500">
        Your day and saved places are stored on your own machine, in Adonis's database.
      </p>
    </div>
  )
}
