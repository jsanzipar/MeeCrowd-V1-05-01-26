# discover-live-youtube

Supabase Edge Function that discovers the world's top currently-live YouTube
streams (~50 per run) and ingests them as auto-discovered channels +
content rows. Works in tandem with `refresh_live_metrics.mjs`, which
keeps viewer counts fresh every minute and cleans up streams when they end.

## Deploy

You need the Supabase CLI and a personal access token. One-time setup:

1. Install CLI (skip if you already have it):
   ```bash
   npm install -g supabase
   ```
2. Get a personal access token at <https://supabase.com/dashboard/account/tokens>
3. Login:
   ```bash
   supabase login
   ```
4. Link this repo to the MeeCrowd project (one-time):
   ```bash
   cd C:\MeeCrowdApp
   supabase link --project-ref nfreggighhtvznvcofql
   ```

Then deploy any time the function changes:

```bash
cd C:\MeeCrowdApp
supabase functions deploy discover-live-youtube
```

## Schedule

In the Supabase Studio for the project:

1. Go to **Database → Cron Jobs → New Job**
2. Name: `discover-live-youtube-hourly`
3. Schedule: `0 * * * *`  (top of every hour)
4. Type: `Edge Function`
5. Function: `discover-live-youtube`
6. HTTP method: `POST`
7. Save.

The job will fire once an hour, costing ~103 YouTube quota units per run
(~2,500 units/day, well inside the 10,000-unit free tier).

## Test manually

```bash
curl -X POST \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  https://nfreggighhtvznvcofql.supabase.co/functions/v1/discover-live-youtube
```

Successful response:
```json
{ "ok": true, "videos_in_search": 50, "videos_returned": 50,
  "unique_channels": 41, "processed": 50, "duration_ms": 8421 }
```
