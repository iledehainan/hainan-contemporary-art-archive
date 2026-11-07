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

Render also sets `NODE_EXTRA_CA_CERTS` to the checked-in public Supabase Root 2021 CA certificate. This lets Node.js verify Supabase's PostgreSQL TLS chain without disabling certificate validation. The certificate is public trust material, not a credential.

## Production data and upload migration: not performed

The schema migration creates empty tables. No data has been imported by this work. The one-time importer below supports only the checksummed public API JSON backup; it does **not** copy a SQLite database, users, sessions, or uploaded files into Supabase. The current service and any local `data/archive.db` must be treated as separate data sources until their contents and authority are confirmed. No local or production database file was uploaded by this work.

The repository already tracks `data/archive.db` in its existing history. The new `.gitignore` rule prevents adding future SQLite files but does not untrack this existing file. The file remains unchanged in the branch; decide separately how to preserve or remove it from version control.

## One-time import of a verified public API backup

`scripts/import-public-backup.js` imports the JSON backup files (`artists.json`, `documents.json`, `exhibitions.json`, `timeline.json`, `settings.json`, and `metadata.json`) from a directory outside the repository. It verifies every file against `SHA256SUMS.txt`, checks the recorded counts, IDs, and document relationships, then runs the import in one PostgreSQL transaction. It preserves IDs, document codes, tag values, settings, and document/artist/exhibition links. It never imports users or sessions and never truncates or deletes data. Because it does not transfer files to Storage, it refuses a backup containing `/uploads/` references.

The importer locks and checks **all nine application tables**, including `users` and `sessions`, and refuses to proceed unless each is empty. Any error before commit rolls back the transaction. It advances the `artists`, `exhibitions`, `documents`, and `timeline` serial sequences after inserting the preserved IDs. PostgreSQL schema setup remains a separate manual step; run `migrations/001_initial_schema.sql` in the Supabase SQL Editor first.

Run the import before starting the application against this database: application startup creates an initial administrator when `users` is empty, and that causes the importer's intentional empty-table check to refuse the import.

The optional `recovered-document-0035.json` is separate from the public API export. Use this JSON structure when you add that separately recovered record to the private backup directory:

```json
{
  "id": 48,
  "code": "HNCA-D-0035",
  "title": "海南当代版画艺术的文脉传承——梁平平版画艺术赏析",
  "category": "艺术评论",
  "author": "陈淑丽",
  "publisher": "中国文化报",
  "pub_date": "2026-11-04",
  "year": 2026,
  "language": "中文",
  "summary": "以梁平平的版画创作为对象，聚焦黑白木刻和渔港题材，介绍其艺术特色及与海南地方文化脉络的联系。",
  "content": "",
  "source": "文旅中国（中国文化报；页面标注“原创 梁平平”）；依据用户此前提供的出处信息和截图著录。",
  "rights": "原文版权归作者及原发布平台所有；本条为文献编目，未录入全文。",
  "tags": ["海南版画", "梁平平", "黑白木刻", "渔港题材", "版画评论", "文脉传承"],
  "is_demo": 0,
  "artists": [],
  "exhibitions": []
}
```

The importer accepts only this specified id/code and attribution, requires a short summary (at most 280 characters), and requires empty artist/exhibition relationships. If `content` is empty, it records `仅有截图著录，未录入全文。`; it does not store article text. It appends `（根据用户此前提供的信息恢复；不属于公开 API 导出）` to the `source` field, so the restored entry is distinguishable from the public export. When the optional file is present, add its SHA-256 to `SHA256SUMS.txt` as well:

```powershell
$backup = 'C:\path\to\private\archive-migration-backup-2026-11-07'
$file = Join-Path $backup 'recovered-document-0035.json'
$hash = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLowerInvariant()
Add-Content -Encoding ascii (Join-Path $backup 'SHA256SUMS.txt') "$hash  recovered-document-0035.json"
```

Run a local validation-only dry run first:

```powershell
npm install
npm run import:backup -- --backup-dir 'C:\path\to\private\archive-migration-backup-2026-11-07'
```

For the actual import, supply `DATABASE_URL` to the process via a trusted local secret manager or an already-secure terminal environment, then repeat with the explicit `--apply` flag. Do not put credentials in the command line, repository, backup, or chat. The apply command is irreversible once committed; verify that this is the intended empty Supabase project first. The importer refuses a non-empty schema and does not offer a force, truncate, or overwrite option.

Before switching production traffic:

1. Arrange a maintenance window and take a verified, restorable backup of the authoritative production SQLite database and its upload files. Do not rely on a Render redeploy or local checkout as a backup; the current free service has no persistent disk configured, so local files may be lost when its instance is replaced.
2. Keep the original backup unchanged and confirm that it can be read/restored before importing anything. Resolve which source contains the latest edits, settings, accounts, and assets; otherwise records or uploaded documents may be lost.
3. Use the one-time importer only for the verified public API JSON backup described above. Production SQLite data, user accounts, and uploaded files need separate, reviewed migration steps. Preserve filenames/object keys for records that refer to `/uploads/<name>`, or update those record URLs during import. Verify record counts, relationships, login, and representative file URLs before directing traffic to the new database.
4. Keep the old service and backup available until the new deployment and rollback path have been verified. New edits made after the backup will not appear in the old copy unless they are migrated too.

Local SQLite startup retains its existing behavior and inserts demo records when the database is empty. PostgreSQL startup does not seed demo archive records; it only creates an initial administrator if the users table is empty. The explicit `npm run seed` command can write demo records to either backend, so do not run it or use the admin cleanup operation against production without confirming its effect.
