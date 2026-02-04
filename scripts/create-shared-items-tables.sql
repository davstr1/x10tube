-- ============================================
-- SHARED ITEMS MIGRATION - Phase 1: Create Tables
-- Run this in Supabase SQL Editor BEFORE running the migration script
-- ============================================

-- Create items_new table (shared items)
CREATE TABLE IF NOT EXISTS items_new (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube', 'webpage')),
  url TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  duration TEXT,
  transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for items_new
CREATE INDEX IF NOT EXISTS idx_items_new_source_id ON items_new(source_id);
CREATE INDEX IF NOT EXISTS idx_items_new_source_type ON items_new(source_type);
CREATE INDEX IF NOT EXISTS idx_items_new_created_at ON items_new(created_at DESC);

-- Create collection_items junction table
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items_new(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, item_id)
);

-- Indexes for collection_items
CREATE INDEX IF NOT EXISTS idx_collection_items_item_id ON collection_items(item_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_position ON collection_items(collection_id, position);

-- Verify tables were created
SELECT 'Tables created successfully!' as status;
