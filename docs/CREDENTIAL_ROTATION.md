# Credential Rotation Runbook

**Status:** URGENT — do before any app store submission or public repo push.
**Owner:** Jaime (founder)
**Estimated time:** 30–45 minutes end-to-end.

## Why

The following credentials were committed to plain `.txt` / `.mjs` files on disk
(outside version control, but still sitting in the project directory and in
Claude Code transcripts). They must be treated as **compromised** and rotated.

| # | Credential | Leaked value (prefix for identification only) | Where it lives today |
|---|---|---|---|
| 1 | Supabase Postgres DB password | `Darcka234101!` | was in `supabase/seed*.mjs`, `supabase/fix_*.mjs`, `supabase/run_migration.mjs` |
| 2 | Supabase service role key | `sb_secret_W6HmkVW…` | was in `supabase/seed_v2.mjs`, `supabase/seed_influencers.mjs` |
| 3 | Google OAuth client secret | `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` | `C:\MeeCrowd\*.txt` (assets project root) |
| 4 | Founder account password (app login) | `Darka982!` | was in `supabase/seed_multimedia_post.mjs` |

The `.mjs` files have already been rewritten to read from env vars — but the
**values themselves** are still valid and must be invalidated at the provider.

> **Do not reuse any of the above strings anywhere else.** Pick new,
> high-entropy values (password managers' "generate" button is fine).

## Pre-flight

Before you start, have these open:

- [ ] Supabase dashboard: https://supabase.com/dashboard/project/nfreggighhtvznvcofql
- [ ] Google Cloud Console → APIs & Services → Credentials: https://console.cloud.google.com/apis/credentials
- [ ] Your password manager (1Password / Bitwarden / whatever you use)
- [ ] Your `.env` file at `C:\MeeCrowdApp\.env` (create from `.env.example` if missing)

Keep this runbook open in a separate window so you can tick items off as you go.

---

## Step 1 — Rotate Supabase service role key (5 min)

This is the most dangerous leak: the service role key bypasses RLS.

1. Supabase dashboard → **Project Settings** → **API**.
2. Under **Project API keys**, find the `service_role` row.
3. Click **Reveal** to confirm it still ends in `…_D91i9C16`, then click the
   circular **Rotate** icon (or equivalent "Generate new key" button).
4. Copy the new value.
5. Open `C:\MeeCrowdApp\.env` and set (create the line if absent):
   ```
   SUPABASE_SERVICE_ROLE_KEY=<new value>
   ```
   Do **not** prefix with `EXPO_PUBLIC_`. This key must never ship to the client.
6. Save.

**Verify:** In the Supabase dashboard → SQL Editor, try a request using the
old key via the REST API (or just confirm the dashboard shows only the new key).
The old key is now invalid.

---

## Step 2 — Rotate Postgres database password (5 min)

1. Supabase dashboard → **Project Settings** → **Database**.
2. Scroll to **Database password** → click **Reset database password**.
3. Let Supabase generate a strong password (or paste one from your manager).
4. Copy the new value.
5. In `C:\MeeCrowdApp\.env` set:
   ```
   SUPABASE_DB_HOST=db.nfreggighhtvznvcofql.supabase.co
   SUPABASE_DB_PASSWORD=<new value>
   ```
6. Save.

**Verify:** If you have the Supabase CLI installed, run
`supabase db remote ping` against the new password, or run the seed script
with `SUPABASE_DB_HOST=… SUPABASE_DB_PASSWORD=… node supabase/fix_avatars.mjs`
— it should connect successfully.

---

## Step 3 — Rotate Google OAuth client secret (5 min)

Only required if Sign in with Google is wired up (check `app/(auth)/login.tsx`
for any `signInWithOAuth({ provider: 'google' })` call — if not, skip this step
and just delete the old secret).

1. Google Cloud Console → **APIs & Services** → **Credentials**.
2. Find the OAuth 2.0 Client for MeeCrowd.
3. Click the pencil icon → **Reset Secret**.
4. Copy the new client secret.
5. In Supabase dashboard → **Authentication** → **Providers** → **Google**,
   paste the new client secret into the **Client Secret** field. Keep the
   Client ID as-is. Save.
6. If you store the secret anywhere app-side, update it there too. (Normally
   OAuth client secrets for Google live only in Supabase, not in the app.)

**Verify:** Delete the Google identity you're signed in with, then run a
fresh Sign in with Google flow in the app — it should still work.

---

## Step 4 — Rotate founder account password (2 min)

The `Darka982!` password was the login for `j.sanzipar@outlook.com`. Change it.

**Option A (via app):**
1. Open MeeCrowd.
2. Sign out, go to Login → **Forgot password?** → send reset email.
3. Click the link in the email → set a new password.

**Option B (via Supabase dashboard):**
1. Supabase dashboard → **Authentication** → **Users**.
2. Find `j.sanzipar@outlook.com` → ⋯ menu → **Send magic link** or **Reset
   password**.

Then update `C:\MeeCrowdApp\.env`:
```
SEED_FOUNDER_EMAIL=j.sanzipar@outlook.com
SEED_FOUNDER_PASSWORD=<new value>
```

---

## Step 5 — Scrub the old values from disk (3 min)

The seed scripts have already been updated to read from env vars, but the
project still has some root-level `.txt` files in `C:\MeeCrowd` that contain
the old values.

1. List them:
   ```
   dir C:\MeeCrowd\*.txt
   ```
2. For each `.txt` file that contains any of the four leaked values above,
   either delete it (if the info is no longer needed) or edit out the secret.
3. Confirm nothing under either project directory still contains the old values:
   ```
   findstr /S /M "Darcka234101 sb_secret_W6HmkVW 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 Darka982" C:\MeeCrowd\*.* C:\MeeCrowdApp\*.*
   ```
   Expected: no files listed.

> **Why not git-remove?** The `C:\MeeCrowdApp\.gitignore` already excludes
> `.env`, `supabase/*.mjs`, and the root `.txt` files — none of the leaked
> values were ever committed to git. The risk is local-disk leakage via
> backups, screen shares, or copy-paste, not git history.

---

## Step 6 — Confirm `.env` is complete (2 min)

Open `C:\MeeCrowdApp\.env` and make sure every key below has a value:

```bash
# Client (bundled into the app — OK to be public)
EXPO_PUBLIC_SUPABASE_URL=https://nfreggighhtvznvcofql.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key — NOT the service role key>
EXPO_PUBLIC_TERMS_URL=https://meecrowd.com/terms
EXPO_PUBLIC_PRIVACY_URL=https://meecrowd.com/privacy
EXPO_PUBLIC_SUPPORT_EMAIL=support@meecrowd.com
EXPO_PUBLIC_ENV=development

# Server-side only (seed scripts, migrations — never ship to client)
SUPABASE_URL=https://nfreggighhtvznvcofql.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<new value from Step 1>
SUPABASE_DB_HOST=db.nfreggighhtvznvcofql.supabase.co
SUPABASE_DB_PASSWORD=<new value from Step 2>
SEED_FOUNDER_EMAIL=j.sanzipar@outlook.com
SEED_FOUNDER_PASSWORD=<new value from Step 4>
```

`.env.example` in the repo is the canonical template — copy missing lines
from there.

---

## Step 7 — Smoke test (5 min)

Run one seed script to confirm the new credentials work end-to-end:

```bash
cd C:\MeeCrowdApp
# PowerShell: use $env:VAR syntax
$env:SUPABASE_DB_HOST="db.nfreggighhtvznvcofql.supabase.co"
$env:SUPABASE_DB_PASSWORD="<new>"
node supabase/fix_avatars.mjs
```

Expected output:
```
Connected to DB
  jsanzipar: updated
  sarahgames: updated
  … etc
Done!
```

Then open the app and confirm login still works with the new founder password.

---

## Step 8 — Invalidate any other copies (ongoing)

- If you shared the leaked values with a collaborator, tell them the old
  values are dead.
- Check team chat / email for any paste of the old secrets and delete those
  messages.
- If the repo `MeeCrowd-17.4.26.01` (your stable backup on GitHub) contains
  any of these secrets, **do not push the current app repo to the same
  GitHub org without re-verifying** — run `git grep "Darcka234101"` and the
  other patterns on the backup too:
  ```
  cd <path to backup>
  git log --all -S "Darcka234101"
  git log --all -S "sb_secret_W6HmkVW"
  ```
  If any commit matches, the backup repo needs history rewriting
  (`git filter-repo`) or deletion + re-creation.

---

## Done checklist

- [ ] Step 1 — Service role key rotated, new value in `.env`
- [ ] Step 2 — DB password rotated, new value in `.env`
- [ ] Step 3 — Google OAuth client secret rotated and updated in Supabase
- [ ] Step 4 — Founder account password rotated, new value in `.env`
- [ ] Step 5 — Old values scrubbed from `C:\MeeCrowd\*.txt`
- [ ] Step 6 — `.env` has all required keys
- [ ] Step 7 — Smoke test passed
- [ ] Step 8 — Backup repo history checked

Once all boxes are ticked, the leaked credentials are dead. Safe to push to
GitHub and submit to App Store review.
