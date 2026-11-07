# GitHub Pages and Supabase deployment

The current public hosting target is GitHub Pages. It publishes only a static, read-only view of the public export. The Node application and Supabase-backed editing/storage require a separate server host; the former Render service has been deleted.

## GitHub Pages public archive

The public, read-only archive is built from `data/content-export.json` and can be hosted at `https://iledehainan.github.io/hainan-contemporary-art-archive/`. The `Deploy GitHub Pages` workflow builds a standalone static site and deploys it on pushes to `main` that change the public export or its builder. To enable the first deployment, open the repository's **Settings → Pages** and set the build and deployment source to **GitHub Actions**. The workflow can also be started manually from the repository's **Actions** tab.

Run `npm run pages:build` locally to generate the site in `dist/`. The static version provides browsing and search for documents, artists, exhibitions, and the timeline. It does not run the Node server and does not provide sign-in, editing, uploads, or other write operations. It only includes the public content export and never reads environment variables or Supabase credentials. GitHub Pages provides the `github.io` hostname; a custom domain would require separately owning and configuring that domain.

## Supabase setup

1. Create a Supabase project and keep its database password private.
2. In the Supabase SQL Editor, run `migrations/001_initial_schema.sql` once. The application does not create or reset PostgreSQL tables on startup.
3. In **Storage**, create a **private** bucket named `archive-uploads` (or choose another name and set `SUPABASE_STORAGE_BUCKET`). Set its file size limit to at least 24 MB. The backend uses the service-role key to upload files and redirects `/uploads/...` requests to short-lived signed URLs. The management form accepts JPG, PNG, WebP, and GIF images plus PDF files; each file is limited to 24 MiB. The server checks the declared MIME type, filename extension, and file signature before storing it. New SVG uploads are intentionally disabled; shipped decorative SVGs remain static assets, while existing locally stored SVG uploads remain readable under a restrictive content policy.
4. If you separately host the Node app, copy the project URL, service-role key, and a PostgreSQL connection-pooler URI from the Supabase project settings. Use the service-role key only as a server environment variable; never put it in frontend files or commit it. The GitHub Pages build does not use Supabase credentials.

## Configure the app

Set these variables in the hosting service before deploying:

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | Yes in production | Supabase PostgreSQL connection-pooler URI |
| `SUPABASE_URL` | Yes for durable uploads | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for durable uploads | Server-only service-role key |
| `SUPABASE_STORAGE_BUCKET` | No | `archive-uploads` unless you chose another bucket |
| `DB_POOL_SIZE` | No | Defaults to `5`; keep low for a small free-tier instance |

`.env.example` contains placeholders only. Locally, omit `DATABASE_URL` to keep using SQLite and local `uploads/`; do not copy production credentials into the repository.

The Node app's public **图像索引** (`/gallery`) uses document covers, artist portraits, and exhibition posters. The static GitHub Pages version does not include that API-powered gallery or an admin login. For a separately hosted Node app, local-development uploads use `uploads/`; durable production uploads require the configured private Supabase bucket.

The old Render blueprint declared secret variables as dashboard-managed values (`sync: false`), but that Render service and Blueprint have been deleted. Production startup intentionally fails if `DATABASE_URL` is missing, rather than silently using an ephemeral SQLite file.

The previous Render setup used `NODE_EXTRA_CA_CERTS` with the checked-in public Supabase Root 2021 CA certificate. This public certificate remains in the repository; the GitHub Pages site does not use it.

## Production data and upload migration: not performed

The schema migration creates empty tables. No data has been imported by this work. The one-time importer below supports either the existing checksummed public API JSON backup directory or a ZIP containing `data/content-export.json`; it does **not** import a SQLite database, users, sessions, or uploaded files into Supabase. For ZIP input it reads only `data/content-export.json`; entries such as `data/archive.db` and `uploads/` are not extracted or imported. The current service and any local `data/archive.db` must be treated as separate data sources until their contents and authority are confirmed. No local or production database file was uploaded by this work.

The repository already tracks `data/archive.db` in its existing history. The new `.gitignore` rule prevents adding future SQLite files but does not untrack this existing file. The file remains unchanged in the branch; decide separately how to preserve or remove it from version control.

## One-time import of a verified public API backup

`scripts/import-public-backup.js` accepts either a checksummed directory of JSON backup files (`artists.json`, `documents.json`, `exhibitions.json`, `timeline.json`, `settings.json`, and `metadata.json`) or a ZIP containing the public export at logical path `data/content-export.json`, optionally under one root folder. ZIP paths using Windows separators are normalized for validation. ZIP validation checks the archive directory and target local header, rejects duplicate or unsafe paths, encrypted/ZIP64 archives, malformed metadata, unsupported target compression, size mismatches, and CRC-32 failures. The export must have the expected public tables and fields; its entity counts, category/year/digitized statistics, IDs, and relation references are checked before any database connection. The ZIP's SQLite file and all other entries are ignored. The public export has no settings table, so no settings are imported from ZIP input. Both formats preserve entity IDs, document codes, tag values, and document/artist/exhibition links. The importer never imports users or sessions and never truncates or deletes data. Because it does not transfer files to Storage, it refuses data containing `/uploads/` references.

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

Run a local validation-only dry run first. For the supplied ZIP, use `--backup-zip`; the older checksummed directory format remains available with `--backup-dir`:

```powershell
npm install
npm run import:backup -- --backup-zip 'C:\path\to\海南当代艺术文献网站_2026-11-06.zip'
```

The default is a dry run and opens no database connection. For the actual import, supply `DATABASE_URL` to the process via a trusted local secret manager or an already-secure terminal environment, then repeat with the explicit `--apply` flag. Do not put credentials in the command line, repository, backup, or chat. The apply command is irreversible once committed; verify that this is the intended empty Supabase project first. The importer refuses a non-empty schema and does not offer a force, truncate, or overwrite option.

Before migrating a separately hosted production application:

1. Arrange a maintenance window and take a verified, restorable backup of the authoritative database and its upload files. Do not rely on a deployment host's ephemeral filesystem or a local checkout as a backup.
2. Keep the original backup unchanged and confirm that it can be read/restored before importing anything. Resolve which source contains the latest edits, settings, accounts, and assets; otherwise records or uploaded documents may be lost.
3. Use the one-time importer only for the public JSON export or checksummed backup format described above. Production SQLite data, user accounts, settings absent from the public export, and uploaded files need separate, reviewed migration steps. Preserve filenames/object keys for records that refer to `/uploads/<name>`, or update those record URLs during import. Verify record counts, relationships, login, and representative file URLs before directing traffic to the new database.
4. Keep the source backup available until the new deployment and rollback path have been verified. New edits made after the backup will not appear in the migration unless they are migrated too.

Local SQLite startup retains its existing behavior and inserts demo records when the database is empty. PostgreSQL startup does not seed demo archive records; it only creates an initial administrator if the users table is empty. The explicit `npm run seed` command can write demo records to either backend, so do not run it or use the admin cleanup operation against production without confirming its effect.
