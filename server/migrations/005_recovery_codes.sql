/*
 * One-time recovery codes, so a forgotten password doesn't mean a lost account.
 *
 * WHY NOT AN EMAILED RESET LINK
 *
 * That is the usual answer and it needs an email provider — an API key, a billing
 * relationship, a verified sending domain, and deliverability that quietly fails
 * into spam folders. None of that exists here, so the choice was between codes and
 * no recovery at all. GitHub and Google both issue codes like these as backup
 * authentication; here they are the primary route.
 *
 * They are also strictly better than an emailed link in one respect: they cannot be
 * intercepted in transit, because they never travel.
 *
 * Stored as SHA-256 rather than scrypt, which is deliberate and the opposite of
 * what `users.password_hash` does. Slow hashing exists to make guessing a
 * low-entropy human-chosen password expensive. A code here is 80 bits of CSPRNG
 * output, so brute force is already impossible and key stretching would buy
 * nothing — while costing a scrypt round per candidate code on every attempt.
 * Hashing at all is what matters: a database leak must not hand over live codes.
 */
CREATE TABLE IF NOT EXISTS recovery_codes (
  user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- SHA-256 of the normalised code. Never the code itself.
  code_hash text NOT NULL,
  used_at   timestamptz,
  PRIMARY KEY (user_id, code_hash)
);

/*
 * Finding a code by its hash alone, without knowing whose it is.
 *
 * The reset flow deliberately does not ask for an email address: requiring one
 * would turn this into an oracle for which addresses have accounts, and the code
 * already identifies the user on its own.
 */
CREATE INDEX IF NOT EXISTS recovery_codes_hash_idx ON recovery_codes (code_hash)
  WHERE used_at IS NULL;
