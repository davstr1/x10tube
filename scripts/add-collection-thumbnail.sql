-- ============================================
-- Migration: Add thumbnail_url to collections
-- Date: 2026-02-06
-- ============================================

-- Add thumbnail_url column to collections table
ALTER TABLE collections ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Vérification
SELECT
  'Migration complete!' as status,
  COUNT(*) as total_collections,
  COUNT(thumbnail_url) as collections_with_thumbnail
FROM collections;
