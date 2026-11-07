CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  birth_year INTEGER,
  death_year INTEGER,
  birthplace TEXT,
  region TEXT,
  medium TEXT,
  bio TEXT,
  statement TEXT,
  portrait TEXT,
  tags TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS exhibitions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  title_en TEXT,
  venue TEXT,
  city TEXT,
  start_date TEXT,
  end_date TEXT,
  year INTEGER,
  curators TEXT,
  organizer TEXT,
  intro TEXT,
  poster TEXT,
  tags TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  title_en TEXT,
  category TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  pub_date TEXT,
  year INTEGER,
  extent TEXT,
  language TEXT,
  summary TEXT,
  content TEXT,
  cover TEXT,
  file_path TEXT,
  source TEXT,
  rights TEXT,
  tags TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS doc_artists (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, artist_id)
);

CREATE TABLE IF NOT EXISTS doc_exhibitions (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  exhibition_id INTEGER NOT NULL REFERENCES exhibitions(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, exhibition_id)
);

CREATE TABLE IF NOT EXISTS timeline (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER,
  date_text TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);
CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);
CREATE INDEX IF NOT EXISTS idx_doc_artists_artist ON doc_artists(artist_id);
CREATE INDEX IF NOT EXISTS idx_doc_exh_exhibition ON doc_exhibitions(exhibition_id);
CREATE INDEX IF NOT EXISTS idx_timeline_year ON timeline(year);
