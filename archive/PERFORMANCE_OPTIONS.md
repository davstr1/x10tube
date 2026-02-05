# Analyse : Performance de l'Architecture Shared Items

## Problème Constaté

Les opérations sont trop lentes (~500ms) :
- Affichage de `/collections`
- Ajout d'un item
- Suppression d'une collection

## Architecture Actuelle

```
collections ──────< collection_items >────── items_new
     │                    │                      │
     │              (junction table)             │
     │                    │                      │
     └── id               ├── collection_id      └── id
                          ├── item_id                 source_id
                          ├── position                source_type
                          └── added_at                transcript...
```

**Requête actuelle** (Supabase embedded) :
```sql
SELECT collections.*,
       collection_items.position, collection_items.added_at,
       items_new.*
FROM collections
LEFT JOIN collection_items ON ...
LEFT JOIN items_new ON ...
WHERE anonymous_id = ?
```

**Pourquoi c'est lent :**
1. Double JOIN sur chaque requête
2. Supabase embedded relations = overhead réseau
3. Pas d'index optimisé pour ce pattern de requête

---

## Option A : Garder la Junction Table + Optimiser

### Indexes à ajouter

```sql
-- Index composite pour la requête principale
CREATE INDEX idx_collection_items_coll_pos
ON collection_items(collection_id, position DESC);

-- Index pour les lookups par item
CREATE INDEX idx_collection_items_item
ON collection_items(item_id);
```

### Requête optimisée (raw SQL au lieu d'embedded)

```typescript
const { data } = await supabase.rpc('get_collections_with_items', {
  p_anonymous_id: anonymousId
});
```

Avec une fonction PostgreSQL :
```sql
CREATE FUNCTION get_collections_with_items(p_anonymous_id TEXT)
RETURNS JSON AS $$
  SELECT json_agg(...)
  FROM collections c
  LEFT JOIN LATERAL (
    SELECT json_agg(...)
    FROM collection_items ci
    JOIN items_new i ON i.id = ci.item_id
    WHERE ci.collection_id = c.id
    ORDER BY ci.position DESC
  ) items ON true
  WHERE c.anonymous_id = p_anonymous_id
$$ LANGUAGE sql;
```

### Avantages
- ✅ Modèle relationnel propre
- ✅ Intégrité référentielle (CASCADE)
- ✅ Peut requêter "quelles collections contiennent cet item"
- ✅ Pas de duplication de données

### Inconvénients
- ❌ Complexité des requêtes
- ❌ Dépendance à une fonction PostgreSQL
- ❌ Toujours des JOINs (même si optimisés)

### Performance estimée
~100-200ms (amélioration 2-5x)

---

## Option B : JSONB Array dans Collections

### Nouveau schéma

```sql
ALTER TABLE collections ADD COLUMN item_ids JSONB DEFAULT '[]';

-- Exemple de valeur :
-- ["itemId1", "itemId2", "itemId3"]
```

### Requête

```typescript
// 1. Get collections (très rapide)
const { data: collections } = await supabase
  .from('collections')
  .select('*')
  .eq('anonymous_id', anonymousId);

// 2. Get all item IDs
const allItemIds = collections.flatMap(c => c.item_ids);

// 3. Get items in one query
const { data: items } = await supabase
  .from('items_new')
  .select('*')
  .in('id', allItemIds);

// 4. Assemble in memory
```

### Avantages
- ✅ Requêtes très simples
- ✅ Pas de JOIN
- ✅ 2 requêtes max (collections + items)
- ✅ Ordre des items préservé nativement dans le JSON

### Inconvénients
- ❌ Pas d'intégrité référentielle (item supprimé = ID orphelin)
- ❌ Requête "quelles collections ont cet item" = scan complet
- ❌ Limite de taille JSONB (~1GB mais parsing lent après ~100KB)
- ❌ Migration nécessaire

### Performance estimée
~50-100ms (amélioration 5-10x)

---

## Option C : Supprimer collection_items + Garder la Relation Simple

### Approche

On garde `items_new` partagés mais on stocke les références directement :

```sql
ALTER TABLE collections ADD COLUMN item_ids TEXT[] DEFAULT '{}';
```

Ou même revenir à un modèle plus simple où chaque collection a ses propres items (copie), mais on garde un cache/index pour éviter de re-extraire.

### Table de cache séparée

```sql
CREATE TABLE transcript_cache (
  source_id TEXT PRIMARY KEY,  -- youtube_id ou hash(url)
  transcript TEXT,
  title TEXT,
  channel TEXT,
  duration TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Quand on ajoute un item :
1. Check si `source_id` existe dans `transcript_cache`
2. Si oui → copier le transcript dans `items` (table originale one-to-many)
3. Si non → extraire, sauvegarder dans cache, puis dans items

### Avantages
- ✅ Revient au modèle simple one-to-many (requêtes rapides)
- ✅ Skip extraction grâce au cache
- ✅ Pas de JOIN complexes
- ✅ Intégrité référentielle simple

### Inconvénients
- ❌ Duplication des données (mais c'est OK, stockage pas cher)
- ❌ Migration pour revenir en arrière
- ❌ Cache à maintenir (TTL ? cleanup ?)

### Performance estimée
~30-80ms (comme avant la migration)

---

## Comparaison

| Critère | A (Junction + Index) | B (JSONB) | C (Cache + One-to-Many) |
|---------|---------------------|-----------|------------------------|
| **Performance** | ~150ms | ~75ms | ~50ms |
| **Complexité code** | Haute | Moyenne | Basse |
| **Intégrité données** | ✅ Forte | ⚠️ Faible | ✅ Forte |
| **Skip extraction** | ✅ Oui | ✅ Oui | ✅ Oui |
| **Migration** | Indexes seulement | Moyenne | Rollback + cache |
| **Requête "item in collections"** | ✅ Facile | ❌ Scan | ❌ Scan |

---

## Recommandation

**Option C** semble la meilleure pour ton cas d'usage :

1. **Performance** : Retour aux requêtes simples one-to-many
2. **Simplicité** : Moins de JOINs, code plus simple
3. **Skip extraction** : Le cache `transcript_cache` évite les appels YouTube inutiles
4. **Duplication acceptable** : Un transcript de 50KB × 100 copies = 5MB, c'est rien

Le seul avantage réel du many-to-many (pas de duplication) ne vaut pas la complexité et la lenteur qu'il introduit.

---

## Questions à Trancher

1. **Veut-on pouvoir répondre à "quelles collections contiennent cette vidéo" ?**
   - Si oui → Option A ou B
   - Si non → Option C

2. **Le stockage dupliqué est-il un problème ?**
   - Probablement non pour un MVP

3. **Préfères-tu migrer vers l'avant (B) ou revenir en arrière (C) ?**
