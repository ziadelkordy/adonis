#!/bin/bash
#
# Drives the deployed server's photo warm to completion, over HTTPS.
#
#   ADONIS_URL=https://your-app.onrender.com \
#   ADONIS_ADMIN_TOKEN=... server/scripts/warm-photos-remote.sh
#
# Use this rather than `pnpm warm:photos` whenever the database is not reachable
# directly: warming needs Postgres on 5432 and Wikipedia on 443 at the same time,
# and many networks (including the one this was written on) refuse outbound 5432
# while leaving 443 open. The deployed service has both, so it does the work and
# this only paces it.
#
# Safe to interrupt and re-run — the server records each place as it settles and
# skips anything already looked at, so a second run resumes rather than restarts.
# Never exits on transient failure: this runs for ~1.5h across laptop sleeps and
# network drops, and the previous version quit on 8 consecutive misses that were
# all local connectivity, while the server was healthy the whole time.
U="${ADONIS_URL:-https://adonis-tnyu.onrender.com}"
T="${ADONIS_ADMIN_TOKEN:-$(cat /tmp/admtok 2>/dev/null)}"
if [ -z "$T" ]; then echo "Set ADONIS_ADMIN_TOKEN (matches the server's ADMIN_TOKEN)." >&2; exit 1; fi
fails=0
while :; do
  R=$(curl -s -m 120 -X POST -H "Authorization: Bearer $T" "$U/api/admin/photos/warm?limit=25" 2>/dev/null)
  P=$(printf '%s' "$R" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: raise SystemExit
print(f\"{d.get('done')}|{d.get('attempted')}|{d.get('found')}|{d.get('withPhoto')}|{d.get('remaining')}\")" 2>/dev/null)
  if [ -z "$P" ]; then
    fails=$((fails+1))
    # Back off, cap at 60s, and keep going indefinitely.
    w=$(( fails < 6 ? fails*10 : 60 ))
    echo "$(date +%H:%M:%S) no response (#$fails), retrying in ${w}s"
    sleep "$w"; continue
  fi
  fails=0
  IFS='|' read -r done att found withp rem <<< "$P"
  echo "$(date +%H:%M:%S) batch=$att found=$found | photos=$withp | remaining=$rem"
  if [ "$done" = "True" ] || [ "$rem" = "0" ]; then echo "COMPLETE"; exit 0; fi
done
