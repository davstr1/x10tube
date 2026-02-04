-- ============================================
-- ROLLBACK: Retour au One-to-Many Simple
-- ============================================

-- 1. Renommer l'ancienne table items si elle existe
ALTER TABLE IF EXISTS items RENAME TO items_v1_backup;

-- 2. Créer nouvelle table items avec structure simple
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube', 'webpage')),
  url TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  duration TEXT,
  transcript TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Migrer les données avec NOUVEAUX IDs (un par lien collection_items)
INSERT INTO items (id, collection_id, source_id, source_type, url, title, channel, duration, transcript, added_at)
SELECT
  gen_random_uuid()::text,
  ci.collection_id,
  i.source_id,
  i.source_type,
  i.url,
  i.title,
  i.channel,
  i.duration,
  i.transcript,
  ci.added_at
FROM items_new i
JOIN collection_items ci ON ci.item_id = i.id;

-- 4. Créer les index
CREATE INDEX idx_items_collection ON items(collection_id);
CREATE INDEX idx_items_source ON items(source_id);

-- 5. Supprimer les tables many-to-many
DROP TABLE IF EXISTS collection_items;
DROP TABLE IF EXISTS items_new;

-- 6. Vérification
SELECT 'Migration complete!' as status, COUNT(*) as items_count FROM items;
