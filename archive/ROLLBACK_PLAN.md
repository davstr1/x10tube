# Rollback : Retour au One-to-Many Simple

## Objectif

Une seule table `items` avec `collection_id`. Duplicats OK. Check `source_id` avant extraction.

## Structure Cible

```sql
items (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,  -- youtube_id ou hash(url) - pour check cache
  source_type TEXT NOT NULL,  -- 'youtube' | 'webpage'
  url TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  duration TEXT,
  transcript TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
)

CREATE INDEX idx_items_collection ON items(collection_id);
CREATE INDEX idx_items_source ON items(source_id);  -- Pour check cache
```

## Logique d'ajout (avec cache)

```
1. Extension veut ajouter vidéo X à collection C
2. GET /api/item/check?youtubeId=X
3. Serveur: SELECT * FROM items WHERE source_id = X LIMIT 1
4. Si trouvé → renvoyer {exists: true, item: {title, channel, duration, transcript}}
5. Extension skip extraction, envoie useExisting=true + les métadonnées
6. Serveur:
   - Cherche un item existant avec source_id = X
   - COPIE ses données (transcript inclus) vers NOUVEL item avec:
     - id = nanoid()  ← NOUVEL ID
     - collection_id = C
     - source_id, source_type, url, title, channel, duration, transcript = copie
     - added_at = now()
```

## Étapes

### 1. SQL : Migrer les données

```sql
-- 1. Renommer l'ancienne table items si elle existe
ALTER TABLE IF EXISTS items RENAME TO items_v1_backup;

-- 2. Créer nouvelle table avec structure correcte
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
  gen_random_uuid()::text,  -- NOUVEL ID unique pour chaque ligne
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

-- 5. Supprimer les anciennes tables (après vérification!)
DROP TABLE collection_items;
DROP TABLE items_new;
-- DROP TABLE items_v1_backup;  -- Plus tard, après validation
```

### 2. Code : Simplifier collection.ts

#### Types
```typescript
// AVANT (complexe)
interface Item { id, source_id, source_type, ... }
interface CollectionItem extends Item { position, added_at }

// APRÈS (simple)
interface Item {
  id: string;
  collection_id: string;
  source_id: string;
  source_type: 'youtube' | 'webpage';
  url: string;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  added_at: string;
}
```

#### getCollectionById
```typescript
// AVANT: 2 requêtes avec JOIN sur collection_items
// APRÈS: 1 requête simple
const { data } = await supabase
  .from('collections')
  .select('*, items(*)')
  .eq('id', id)
  .single();
```

#### getCollectionsForAnonymous
```typescript
// AVANT: N+1 requêtes ou embedded complexe
// APRÈS: 1 requête
const { data } = await supabase
  .from('collections')
  .select('*, items(*)')
  .eq('anonymous_id', anonymousId)
  .order('updated_at', { ascending: false });
```

#### addPreExtractedItemToCollection
```typescript
// Gestion du cas useExisting
if (useExisting || !content) {
  // Chercher un item existant avec ce source_id
  const { data: cached } = await supabase
    .from('items')
    .select('*')
    .eq('source_id', sourceId)
    .limit(1)
    .single();

  if (cached) {
    // Copier les données
    content = cached.transcript;
    title = title || cached.title;
    channel = channel || cached.channel;
    // etc.
  }
}

// INSERT simple (toujours un nouvel item)
const { data } = await supabase
  .from('items')
  .insert({
    id: nanoid(),
    collection_id,
    source_id,
    source_type,
    url,
    title,
    channel,
    duration,
    transcript: content,
    added_at: now
  });
```

#### getItemBySourceId (pour le cache check)
```typescript
// Trouver N'IMPORTE QUEL item avec ce source_id (pour copier son transcript)
const { data } = await supabase
  .from('items')
  .select('*')
  .eq('source_id', sourceId)
  .limit(1)
  .single();
```

### 3. Code : api.ts

- `GET /api/item/check` : pas de changement (query sur source_id)
- `POST /api/x10/add-content` : passer le transcript trouvé au service si useExisting

### 4. Pas de changement

- Extension (déjà OK avec useExisting)
- Vues (déjà OK avec source_type/source_id)

## Fichiers à Modifier

| Fichier | Action |
|---------|--------|
| `server/src/services/collection.ts` | Simplifier toutes les fonctions |
| `server/src/routes/api.ts` | Simplifier duplicate checks |
| Scripts SQL | Nouveau script de migration |

## Vérification Post-Migration

```sql
-- Compter les items
SELECT COUNT(*) FROM items;

-- Vérifier qu'il n'y a pas d'items orphelins
SELECT COUNT(*) FROM items i
LEFT JOIN collections c ON c.id = i.collection_id
WHERE c.id IS NULL;  -- Doit retourner 0

-- Vérifier les duplicats (normal d'en avoir)
SELECT source_id, COUNT(*) as copies
FROM items
GROUP BY source_id
HAVING COUNT(*) > 1;
```
