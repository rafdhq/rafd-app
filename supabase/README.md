# RAFD Supabase - Migrations (Official Supabase CLI Standard)

> **RAFD | رفد - Retail ERP - Supabase Development**
> All SQL migrations now follow official Supabase CLI standard: `supabase/migrations/`

## Structure (Supabase CLI Standard)

```
supabase/
├── config.toml          # Local stack config + project_id
├── migrations/
│   ├── 20260722000001_base_schema.sql   → Core tables (tenants, branches, products, sales...)
│   ├── 20260722000002_storage.sql       → Bucket rafd-media + policies
│   ├── 20260722000003_p0_security.sql   → Tax, idempotency, RLS
│   ├── 20260722000004_p1_features.sql   → Shifts, refunds, stocktake, invites
│   └── 20260722000005_p2_features.sql   → Loyalty, pricing, BOM, AI
└── README.md            # This file
```

**Order is enforced by timestamp prefix** `YYYYMMDDHHMMSS`. All files are `IF NOT EXISTS` safe.

## Single-Command Migration (Official Way)

### Prerequisites

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```

2. Login:
   ```bash
   supabase login
   # Opens browser, generates access token
   ```

3. Link to your remote project (rafd-dev):
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   # Find REF in Dashboard URL: https://supabase.com/dashboard/project/<REF>
   # Will prompt for DB password (from Project Settings → Database → Connection String)
   ```

### Execute All Migrations with ONE Command

```bash
# Push local migrations to remote (rafd-dev)
supabase db push

# Or, to reset local dev stack and re-apply all migrations:
supabase db reset
```

That's it! `db push` reads all files in `supabase/migrations/` in timestamp order and applies only new ones (tracked in `supabase_migrations.schema_migrations`).

### Verify

```bash
supabase db pull --linked  # Optional: pull remote schema to ensure sync
```

Or check via SQL Editor:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
-- Should list 40+ tables: tenants, branches, app_users, products, sales, etc.

SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;
-- Should list 5 applied migrations
```

## Creating New Migrations

```bash
supabase migration new <migration_name>
# Creates supabase/migrations/<timestamp>_<migration_name>.sql
# Edit the file, then:
supabase db push
```

## Storage Bucket

Migration `20260722000002_storage.sql` creates bucket `rafd-media` (public) with policies:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('rafd-media','rafd-media', true) ...
```

If bucket already exists, it does `ON CONFLICT DO NOTHING`.

You can also create bucket via Dashboard → Storage → New Bucket → `rafd-media` → Public Yes.

## Auth Config

After migrations, configure in Dashboard → Authentication → URL Configuration:

- Site URL: `http://localhost:5173`
- Redirects: `http://localhost:5173/*`, `https://*.vercel.app/*`, `https://YOUR_DOMAIN/*`

For Google OAuth: Authentication → Providers → Google → Enable with Client ID/Secret.

## Seed (Optional)

Create `supabase/seed.sql` for dev data, applied on `supabase start` and `db reset`:

```sql
-- Example seed (optional)
INSERT INTO tenants (name, name_ar) VALUES ('متجر تجريبي','متجر تجريبي') ON CONFLICT DO NOTHING;
```

## GitHub Action (Automated)

To auto-migrate on push to `develop`, create `.github/workflows/supabase-migrate.yml`:

```yaml
name: Supabase Migrate
on:
  push:
    branches: [develop]
  workflow_dispatch:

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} --password ${{ secrets.SUPABASE_DB_PASSWORD }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - run: supabase db push --linked
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

Required Secrets (GitHub → Settings → Secrets):

- `SUPABASE_ACCESS_TOKEN` - from https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_REF` - e.g., `abcdefghijklmnopqrst`
- `SUPABASE_DB_PASSWORD` - Database password from Project Settings

**Note:** Current `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are for app runtime, not for CLI migrations. For migrations you need Access Token + DB Password.

## No Manual SQL Editor Needed

All migrations are now in `supabase/migrations/` and executable with `supabase db push` - single command. No copy-paste in SQL Editor unless technically impossible (e.g., CLI not linked).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `relation does not exist` | Ensure migrations applied in order via `db push` |
| `supabase_migrations` table not found | Run `supabase link` first |
| Permission denied on storage | Ensure `001_storage.sql` applied, bucket public |
| Auth redirect errors | Check URL Configuration in Dashboard |

---

**Last Updated:** 2026-07-22 - Infrastructure Migration Phase - develop branch - Supabase CLI standard
