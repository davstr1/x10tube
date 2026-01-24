import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'x10tube.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS magic_links (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS x10s (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    anonymous_id TEXT,
    title TEXT,
    pre_prompt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_x10s_anonymous_id ON x10s(anonymous_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_code TEXT PRIMARY KEY,
    default_pre_prompt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    x10_id TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT DEFAULT 'youtube',
    youtube_id TEXT,
    title TEXT,
    channel TEXT,
    duration TEXT,
    transcript TEXT,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (x10_id) REFERENCES x10s(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_x10s_user_id ON x10s(user_id);
  CREATE INDEX IF NOT EXISTS idx_videos_x10_id ON videos(x10_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`);

// Migrations for existing databases
try {
  // Add pre_prompt column to x10s if it doesn't exist
  db.exec(`ALTER TABLE x10s ADD COLUMN pre_prompt TEXT`);
} catch (e) {
  // Column already exists, ignore
}

try {
  // Add type column to videos if it doesn't exist (for web pages support)
  db.exec(`ALTER TABLE videos ADD COLUMN type TEXT DEFAULT 'youtube'`);
} catch (e) {
  // Column already exists, ignore
}

// Migration: Make youtube_id nullable by recreating the table
// SQLite doesn't support ALTER COLUMN, so we need to recreate
try {
  // Check if youtube_id has NOT NULL constraint by trying to insert NULL
  const tableInfo = db.prepare("PRAGMA table_info(videos)").all() as any[];
  const youtubeIdCol = tableInfo.find((col: any) => col.name === 'youtube_id');

  if (youtubeIdCol && youtubeIdCol.notnull === 1) {
    console.log('[DB Migration] Recreating videos table to make youtube_id nullable...');

    db.exec(`
      -- Create new table with nullable youtube_id
      CREATE TABLE videos_new (
        id TEXT PRIMARY KEY,
        x10_id TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT DEFAULT 'youtube',
        youtube_id TEXT,
        title TEXT,
        channel TEXT,
        duration TEXT,
        transcript TEXT,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (x10_id) REFERENCES x10s(id) ON DELETE CASCADE
      );

      -- Copy data
      INSERT INTO videos_new SELECT id, x10_id, url, type, youtube_id, title, channel, duration, transcript, added_at FROM videos;

      -- Drop old table and rename
      DROP TABLE videos;
      ALTER TABLE videos_new RENAME TO videos;

      -- Recreate index
      CREATE INDEX idx_videos_x10_id ON videos(x10_id);
    `);

    console.log('[DB Migration] Videos table migrated successfully');
  }
} catch (e) {
  console.error('[DB Migration] Error migrating videos table:', e);
}

export default db;

// Helper types
export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface X10 {
  id: string;
  user_id: string | null;
  anonymous_id: string | null;
  title: string | null;
  pre_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_code: string;
  default_pre_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  x10_id: string;
  url: string;
  type: 'youtube' | 'webpage';
  youtube_id: string | null;
  title: string | null;
  channel: string | null;        // channel for YouTube, domain for web pages
  duration: string | null;       // YouTube only
  transcript: string | null;     // transcript for YouTube, markdown for web pages
  added_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}
