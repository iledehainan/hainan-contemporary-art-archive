# Supabase and Render deployment preparation

This repository now supports Supabase PostgreSQL while keeping SQLite as the local-development default. No production service was contacted, no production data was copied, and no deployment was performed as part of this change.

## Supabase setup

1. Create a Supabase project and keep its database password private.
2. In the Supabase SQL Editor, run `migrations/001_initial_schema.sql` once. The application does not create or reset PostgreSQL tables on startup.
3. In **Storage**, create a **private** bucket named `archive-uploads` (or choose another name and set `SUPABASE_STORAGE_BUCKET`). Set its file size limit to at least 24 MB. The backend uses the service-role key to upload files and redirects `/uploads/...` requests to short-lived signed URLs.
4. Copy the project URL, service-role key, and a PostgreSQL connection-pooler URI from the Supabase project settings. Use the service-role key only as a server environment variable; never put it in frontend files or commit it.

## Configure the app

Set these variables in the hosting service before deploying:

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes in production | Supabase PostgreSQL connection-pooler URI |
| `SUPABASE_URL` | Yes for durable uploads | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for durable uploads | Server-only service-role key |
| `SUPABASE_STORAGE_BUCKET` | No | `archive-uploads` unless you chose another bucket |
| `DB_POOL_SIZE` | No | Defaults to `5`; keep low for a small free-tier instance |

`.env.example` contains placeholders only. Locally, omit `DATABASE_URL` to keep using SQLite; do not copy production credentials into the repository.

The Render blueprint declares the secret variables as dashboard-managed values (`sync: false`). Add the real values in the Render dashboard before deploying. Production startup intentionally fails if `DATABASE_URL` is missing, rather than silently using an ephemeral SQLite file. The free Render web service remains in place; this setup does not require a paid disk or plan.

## Data and upload migration: not performed

The schema migration creates empty tables. It does **not** copy a SQLite database, settings, users, sessions, archive records, or uploaded files into Supabase. The current service and any local `data/archive.db` must be treated as separate data sources until their contents and authority are confirmed. No local or production database file was uploaded by this work.

The repository already tracks `data/archive.db` in its existing history. The new `.gitignore` rule prevents adding future SQLite files but does not untrack this existing file. This work leaves it untouched and does not push the branch; decide separately how to preserve or remove it from version control before publishing changes.

Before switching production traffic:

1. Arrange a maintenance window and take a verified, restorable backup of the authoritative production SQLite database and its upload files. Do not rely on a Render redeploy or local checkout as a backup; the current free service has no persistent disk configured, so local files may be lost when its instance is replaced.
2. Keep the original backup unchanged and confirm that it can be read/restored before importing anything. Resolve which source contains the latest edits, settings, accounts, and assets; otherwise records or uploaded documents may be lost.
3. Migrate data and upload files in a separately reviewed, controlled operation. This repository change does not perform that import. Preserve filenames/object keys for records that refer to `/uploads/<name>`, or update those record URLs during import. Verify record counts, relationships, login, and representative file URLs before directing traffic to the new database.
4. Keep the old service and backup available until the new deployment and rollback path have been verified. New edits made after the backup will not appear in the old copy unless they are migrated too.

Local SQLite startup retains its existing behavior and inserts demo records when the database is empty. PostgreSQL startup does not seed demo archive records; it only creates an initial administrator if the users table is empty. The explicit `npm run seed` command can write demo records to either backend, so do not run it or use the admin cleanup operation against production without confirming its effect.
