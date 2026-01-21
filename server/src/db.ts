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
    title TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    x10_id TEXT NOT NULL,
    url TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
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
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  x10_id: string;
  url: string;
  youtube_id: string;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  added_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}
