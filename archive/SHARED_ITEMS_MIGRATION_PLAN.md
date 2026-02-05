# Plan de Migration : Items Partagés (Many-to-Many)

## ✅ IMPLÉMENTATION TERMINÉE

Le code a été mis à jour. Voici les étapes pour déployer :

### Étape 1 : Créer les tables dans Supabase
```bash
# Copier le contenu de scripts/create-shared-items-tables.sql
# et l'exécuter dans Supabase SQL Editor
```

### Étape 2 : Migrer les données existantes
```bash
cd server
npm run migrate:shared-items
```

### Étape 3 : Déployer le nouveau code
- Serveur : `npm run build && npm start`
- Extension : `npm run build` puis recharger dans Chrome

### Étape 4 : Valider et finaliser
Après validation en production, exécuter `scripts/finalize-shared-items-migration.sql`

---

## Objectif

Transformer l'architecture de la base de données pour que les items (transcripts YouTube, pages web) soient des ressources partagées entre collections, éliminant la redondance de stockage et les appels API inutiles.

---

## Architecture Actuelle vs Cible

### Actuel (One-to-Many)

```
collections (1) ───────< items (N)
                         └── collection_id (FK)
```

- Un item appartient à UNE seule collection
- Même vidéo dans 10 collections = 10 copies du transcript
- Chaque ajout = extraction YouTube même si déjà fait

### Cible (Many-to-Many)

```
collections (N) ──────< collection_items >────── items (M)
                       (table de jonction)
```

- Un item peut être dans PLUSIEURS collections
- Une vidéo = UN seul transcript stocké
- Ajout = vérifier si existe, sinon extraire

---

## Nouveau Schéma SQL

```sql
-- ============================================
-- ITEMS : Ressources partagées
-- ============================================

CREATE TABLE items_new (
  id TEXT PRIMARY KEY,

  -- Identifiant unique de la source
  -- YouTube: youtube_id (11 chars)
  -- Webpage: SHA256 hash de l'URL (64 chars) - évite les problèmes de longueur
  source_id TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube', 'webpage')),

  -- Métadonnées
  url TEXT NOT NULL,
  title TEXT,
  channel TEXT,                       -- Chaîne YouTube ou domaine
  duration TEXT,                      -- Format "MM:SS" ou "H:MM:SS"

  -- Contenu
  transcript TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_new_source_id ON items_new(source_id);
CREATE INDEX idx_items_new_source_type ON items_new(source_type);
CREATE INDEX idx_items_new_created_at ON items_new(created_at DESC);

-- ============================================
-- COLLECTION_ITEMS : Table de jonction
-- ============================================

CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items_new(id) ON DELETE CASCADE,

  -- Ordre dans la collection (0 = premier)
  position INT NOT NULL DEFAULT 0,

  -- Quand cet item a été ajouté à CETTE collection
  added_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX idx_collection_items_item_id ON collection_items(item_id);
CREATE INDEX idx_collection_items_position ON collection_items(collection_id, position);

-- ============================================
-- COLLECTIONS : Inchangée (sauf suppression FK)
-- ============================================

-- La table collections reste identique, on retire juste la relation directe avec items
```

---

## Plan d'Implémentation

### Phase 1 : Préparation (sans downtime)

#### 1.1 Créer les nouvelles tables

Exécuter dans Supabase SQL Editor :

```sql
-- Créer items_new
CREATE TABLE items_new (
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

CREATE INDEX idx_items_new_source_id ON items_new(source_id);
CREATE INDEX idx_items_new_source_type ON items_new(source_type);
CREATE INDEX idx_items_new_created_at ON items_new(created_at DESC);

-- Créer collection_items
CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items_new(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX idx_collection_items_item_id ON collection_items(item_id);
```

#### 1.2 Script de migration des données

Créer `scripts/migrate-to-shared-items.ts` :

```typescript
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

// Génère un source_id stable pour une URL (hash SHA256)
function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

// Détermine le source_id selon le type
function getSourceId(item: { youtube_id: string | null; url: string; type: string }): string {
  if (item.type === 'youtube' && item.youtube_id) {
    return item.youtube_id;
  }
  return hashUrl(item.url);
}

async function migrate() {
  console.log('Fetching existing items...');

  // 1. Récupérer tous les items actuels
  const { data: oldItems, error: fetchError } = await supabase
    .from('items')
    .select('*')
    .order('added_at', { ascending: true });

  if (fetchError || !oldItems) {
    throw new Error(`Failed to fetch items: ${fetchError?.message}`);
  }

  console.log(`Found ${oldItems.length} items to migrate`);

  // 2. Dédupliquer par source_id
  const uniqueItems = new Map<string, typeof oldItems[0]>();
  const itemMapping = new Map<string, string>(); // old_id -> source_id

  for (const item of oldItems) {
    const sourceId = getSourceId(item);
    const sourceType = (item.type === 'youtube' && item.youtube_id) ? 'youtube' : 'webpage';

    if (!uniqueItems.has(sourceId)) {
      uniqueItems.set(sourceId, {
        ...item,
        source_id: sourceId,
        source_type: sourceType
      });
    }

    // Mapper l'ancien ID vers le source_id (qui sera le nouvel identifiant logique)
    itemMapping.set(item.id, sourceId);
  }

  console.log(`Deduplicated to ${uniqueItems.size} unique items`);

  // 3. Insérer les items uniques dans items_new
  const newItems = Array.from(uniqueItems.values()).map(item => ({
    id: item.id, // Garder le premier ID rencontré
    source_id: item.source_id,
    source_type: item.source_type,
    url: item.url,
    title: item.title,
    channel: item.channel,
    duration: item.duration,
    transcript: item.transcript,
    created_at: item.added_at,
    updated_at: item.added_at
  }));

  // Insérer par batches
  for (let i = 0; i < newItems.length; i += 100) {
    const batch = newItems.slice(i, i + 100);
    const { error } = await supabase.from('items_new').insert(batch);
    if (error) {
      console.error(`Batch ${i} error:`, error);
    } else {
      console.log(`Inserted items ${i} to ${i + batch.length}`);
    }
  }

  // 4. Créer les liens collection_items
  // Construire un map source_id -> new_item_id
  const { data: insertedItems } = await supabase
    .from('items_new')
    .select('id, source_id');

  const sourceToNewId = new Map<string, string>();
  for (const item of insertedItems || []) {
    sourceToNewId.set(item.source_id, item.id);
  }

  // Créer les liens
  const links: { collection_id: string; item_id: string; position: number; added_at: string }[] = [];
  const positionCounters = new Map<string, number>();

  for (const oldItem of oldItems) {
    const sourceId = getSourceId(oldItem);
    const newItemId = sourceToNewId.get(sourceId);

    if (!newItemId) {
      console.warn(`No new item found for source_id: ${sourceId}`);
      continue;
    }

    // Incrémenter la position pour cette collection
    const pos = positionCounters.get(oldItem.collection_id) || 0;
    positionCounters.set(oldItem.collection_id, pos + 1);

    links.push({
      collection_id: oldItem.collection_id,
      item_id: newItemId,
      position: pos,
      added_at: oldItem.added_at
    });
  }

  // Dédupliquer les liens (même collection + même item = un seul lien)
  const uniqueLinks = new Map<string, typeof links[0]>();
  for (const link of links) {
    const key = `${link.collection_id}:${link.item_id}`;
    if (!uniqueLinks.has(key)) {
      uniqueLinks.set(key, link);
    }
  }

  const finalLinks = Array.from(uniqueLinks.values());
  console.log(`Creating ${finalLinks.length} collection_items links`);

  // Insérer les liens par batches
  for (let i = 0; i < finalLinks.length; i += 100) {
    const batch = finalLinks.slice(i, i + 100);
    const { error } = await supabase.from('collection_items').insert(batch);
    if (error) {
      console.error(`Links batch ${i} error:`, error);
    } else {
      console.log(`Inserted links ${i} to ${i + batch.length}`);
    }
  }

  console.log('Migration complete!');
  console.log(`Items: ${oldItems.length} -> ${uniqueItems.size} (saved ${oldItems.length - uniqueItems.size} duplicates)`);
}

migrate().catch(console.error);
```

---

### Phase 2 : Adapter le Code Serveur

#### 2.1 Modifier les types (`server/src/services/collection.ts`)

```typescript
// AVANT
export interface Item {
  id: string;
  collection_id: string;  // <-- À SUPPRIMER
  url: string;
  type: 'youtube' | 'webpage';
  youtube_id: string | null;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  added_at: string;
}

// APRÈS
export interface Item {
  id: string;
  source_id: string;
  source_type: 'youtube' | 'webpage';
  url: string;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  created_at: string;
  updated_at: string;
}

// Nouveau type pour les items dans une collection (avec position)
export interface CollectionItem extends Item {
  position: number;
  added_at: string;  // Quand ajouté à CETTE collection
}

export interface CollectionWithItems extends Collection {
  items: CollectionItem[];
  tokenCount: number;
}
```

#### 2.2 Modifier `getCollectionById`

```typescript
export async function getCollectionById(id: string): Promise<CollectionWithItems | null> {
  // 1. Récupérer la collection
  const { data: collection, error: collError } = await supabase
    .from('collections')
    .select('*')
    .eq('id', id)
    .single();

  if (collError || !collection) return null;

  // 2. Récupérer les items via la table de jonction
  const { data: links, error: linkError } = await supabase
    .from('collection_items')
    .select(`
      position,
      added_at,
      item:items_new (*)
    `)
    .eq('collection_id', id)
    .order('position', { ascending: true });

  if (linkError) return null;

  // 3. Transformer en CollectionItem[]
  const items: CollectionItem[] = (links || []).map(link => ({
    ...link.item,
    position: link.position,
    added_at: link.added_at
  }));

  return {
    ...collection,
    items,
    tokenCount: calculateTokenCount(items)
  };
}
```

#### 2.3 Modifier `addPreExtractedItemToCollection`

**Note** : Cette fonction gère automatiquement le cas `useExisting=true` car elle vérifie d'abord si l'item existe par `source_id`. Si oui, elle crée juste le lien sans toucher au transcript.

```typescript
export async function addPreExtractedItemToCollection(
  collectionId: string,
  content: PreExtractedItem
): Promise<CollectionItem> {
  const now = new Date().toISOString();
  const sourceId = content.youtube_id || hashUrl(content.url);
  const sourceType = content.type;
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  // 1. Vérifier si l'item existe déjà (par source_id)
  let { data: existingItem } = await supabase
    .from('items_new')
    .select('*')
    .eq('source_id', sourceId)
    .single();

  let itemId: string;

  if (existingItem) {
    // Item existe déjà - réutiliser
    itemId = existingItem.id;
    console.log(`[Collection] Reusing existing item ${itemId} for source ${sourceId}`);
  } else {
    // Créer nouvel item
    itemId = generateId();
    const { error: insertError } = await supabase
      .from('items_new')
      .insert({
        id: itemId,
        source_id: sourceId,
        source_type: sourceType,
        url: content.url,
        title: content.title,
        channel: content.channel || null,
        duration: durationStr,
        transcript: content.content,
        created_at: now,
        updated_at: now
      });

    if (insertError) throw new Error(insertError.message);
    console.log(`[Collection] Created new item ${itemId} for source ${sourceId}`);
  }

  // 2. Vérifier si le lien existe déjà
  const { data: existingLink } = await supabase
    .from('collection_items')
    .select('*')
    .eq('collection_id', collectionId)
    .eq('item_id', itemId)
    .single();

  if (existingLink) {
    // Déjà dans cette collection
    const item = existingItem || await supabase
      .from('items_new')
      .select('*')
      .eq('id', itemId)
      .single()
      .then(r => r.data);

    return {
      ...item!,
      position: existingLink.position,
      added_at: existingLink.added_at
    };
  }

  // 3. Obtenir la prochaine position
  const { data: maxPos } = await supabase
    .from('collection_items')
    .select('position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (maxPos?.position ?? -1) + 1;

  // 4. Créer le lien
  const { error: linkError } = await supabase
    .from('collection_items')
    .insert({
      collection_id: collectionId,
      item_id: itemId,
      position: nextPosition,
      added_at: now
    });

  if (linkError) throw new Error(linkError.message);

  // 5. Mettre à jour updated_at de la collection
  await supabase
    .from('collections')
    .update({ updated_at: now })
    .eq('id', collectionId);

  // 6. Retourner l'item avec sa position
  const item = existingItem || await supabase
    .from('items_new')
    .select('*')
    .eq('id', itemId)
    .single()
    .then(r => r.data);

  return {
    ...item!,
    position: nextPosition,
    added_at: now
  };
}
```

#### 2.4 Nouvelle fonction : `getItemBySourceId`

```typescript
export async function getItemBySourceId(sourceId: string): Promise<Item | null> {
  const { data, error } = await supabase
    .from('items_new')
    .select('*')
    .eq('source_id', sourceId)
    .single();

  if (error || !data) return null;
  return data;
}
```

#### 2.5 Modifier `removeItemFromCollection`

```typescript
export async function removeItemFromCollection(
  collectionId: string,
  itemId: string
): Promise<boolean> {
  // Supprimer le lien (pas l'item lui-même)
  const { error } = await supabase
    .from('collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq('item_id', itemId);

  if (error) return false;

  // Mettre à jour updated_at
  await supabase
    .from('collections')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', collectionId);

  return true;
}
```

#### 2.6 Modifier `checkItemInAnonymousCollections`

```typescript
export async function checkItemInAnonymousCollections(
  anonymousId: string,
  sourceId: string  // youtube_id ou hash URL
): Promise<string[]> {
  // 1. Trouver l'item par source_id
  const { data: item } = await supabase
    .from('items_new')
    .select('id')
    .eq('source_id', sourceId)
    .single();

  if (!item) return [];

  // 2. Trouver les collections de cet utilisateur qui contiennent cet item
  const { data, error } = await supabase
    .from('collection_items')
    .select('collection_id, collections!inner(anonymous_id)')
    .eq('item_id', item.id)
    .eq('collections.anonymous_id', anonymousId);

  if (error || !data) return [];
  return data.map(d => d.collection_id);
}
```

#### 2.7 Modifier `checkItemInUserCollections`

```typescript
export async function checkItemInUserCollections(
  userId: string,
  sourceId: string
): Promise<string[]> {
  const { data: item } = await supabase
    .from('items_new')
    .select('id')
    .eq('source_id', sourceId)
    .single();

  if (!item) return [];

  const { data, error } = await supabase
    .from('collection_items')
    .select('collection_id, collections!inner(user_id)')
    .eq('item_id', item.id)
    .eq('collections.user_id', userId);

  if (error || !data) return [];
  return data.map(d => d.collection_id);
}
```

#### 2.8 Modifier `getCollectionsForAnonymous`

```typescript
export async function getCollectionsForAnonymous(anonymousId: string): Promise<CollectionWithItems[]> {
  // 1. Récupérer les collections
  const { data: collections, error: collError } = await supabase
    .from('collections')
    .select('*')
    .eq('anonymous_id', anonymousId)
    .order('updated_at', { ascending: false });

  if (collError || !collections) return [];

  // 2. Pour chaque collection, récupérer les items
  const results: CollectionWithItems[] = [];

  for (const collection of collections) {
    const { data: links } = await supabase
      .from('collection_items')
      .select(`position, added_at, item:items_new (*)`)
      .eq('collection_id', collection.id)
      .order('position', { ascending: true });

    const items: CollectionItem[] = (links || []).map(link => ({
      ...link.item,
      position: link.position,
      added_at: link.added_at
    }));

    results.push({
      ...collection,
      items,
      tokenCount: calculateTokenCount(items)
    });
  }

  return results;
}
```

#### 2.9 Modifier `getCollectionsForUser` (même pattern)

```typescript
export async function getCollectionsForUser(userId: string): Promise<CollectionWithItems[]> {
  const { data: collections, error: collError } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (collError || !collections) return [];

  const results: CollectionWithItems[] = [];

  for (const collection of collections) {
    const { data: links } = await supabase
      .from('collection_items')
      .select(`position, added_at, item:items_new (*)`)
      .eq('collection_id', collection.id)
      .order('position', { ascending: true });

    const items: CollectionItem[] = (links || []).map(link => ({
      ...link.item,
      position: link.position,
      added_at: link.added_at
    }));

    results.push({
      ...collection,
      items,
      tokenCount: calculateTokenCount(items)
    });
  }

  return results;
}
```

#### 2.10 Modifier `createCollectionWithPreExtractedItem`

```typescript
export async function createCollectionWithPreExtractedItem(
  content: PreExtractedItem,
  anonymousId: string
): Promise<CollectionWithItems> {
  const collectionId = generateId();
  const now = new Date().toISOString();
  const sourceId = content.youtube_id || hashUrl(content.url);
  const sourceType = content.type;
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  // 1. Créer la collection
  const { error: collectionError } = await supabase
    .from('collections')
    .insert({
      id: collectionId,
      user_id: null,
      anonymous_id: anonymousId,
      title: content.title,
      created_at: now,
      updated_at: now
    });

  if (collectionError) throw new Error(collectionError.message);

  // 2. Vérifier si l'item existe déjà
  let { data: existingItem } = await supabase
    .from('items_new')
    .select('*')
    .eq('source_id', sourceId)
    .single();

  let itemId: string;

  if (existingItem) {
    itemId = existingItem.id;
  } else {
    // Créer l'item
    itemId = generateId();
    const { error: itemError } = await supabase
      .from('items_new')
      .insert({
        id: itemId,
        source_id: sourceId,
        source_type: sourceType,
        url: content.url,
        title: content.title,
        channel: content.channel || null,
        duration: durationStr,
        transcript: content.content,
        created_at: now,
        updated_at: now
      });

    if (itemError) throw new Error(itemError.message);
  }

  // 3. Créer le lien
  const { error: linkError } = await supabase
    .from('collection_items')
    .insert({
      collection_id: collectionId,
      item_id: itemId,
      position: 0,
      added_at: now
    });

  if (linkError) throw new Error(linkError.message);

  // 4. Retourner la collection complète
  const item = existingItem || {
    id: itemId, source_id: sourceId, source_type: sourceType,
    url: content.url, title: content.title, channel: content.channel || null,
    duration: durationStr, transcript: content.content,
    created_at: now, updated_at: now
  };

  return {
    id: collectionId,
    user_id: null,
    anonymous_id: anonymousId,
    title: content.title,
    pre_prompt: null,
    created_at: now,
    updated_at: now,
    items: [{ ...item, position: 0, added_at: now }],
    tokenCount: estimateTokens(content.content)
  };
}
```

#### 2.11 Modifier `forkCollection` (créer des liens, pas copier)

```typescript
export async function forkCollection(originalId: string, newUserId: string): Promise<CollectionWithItems | null> {
  const original = await getCollectionById(originalId);
  if (!original) return null;

  const newId = generateId();
  const now = new Date().toISOString();

  // 1. Copier la collection
  const { error: collectionError } = await supabase
    .from('collections')
    .insert({
      id: newId,
      user_id: newUserId,
      anonymous_id: null,
      title: original.title,
      pre_prompt: original.pre_prompt,
      created_at: now,
      updated_at: now
    });

  if (collectionError) return null;

  // 2. Créer des LIENS vers les mêmes items (pas de copie!)
  for (let i = 0; i < original.items.length; i++) {
    const item = original.items[i];
    await supabase.from('collection_items').insert({
      collection_id: newId,
      item_id: item.id,
      position: i,
      added_at: now
    });
  }

  return getCollectionById(newId);
}
```

#### 2.12 Ajouter helper `hashUrl` dans collection.ts

```typescript
import { createHash } from 'crypto';

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}
```

---

### Phase 3 : Nouvel Endpoint API - Check Before Extract

#### 3.1 Ajouter `GET /api/item/check`

Dans `server/src/routes/api.ts` :

**Ajouter l'import :**
```typescript
import {
  // ... imports existants ...
  getItemBySourceId  // AJOUTER
} from '../services/collection.js';
```

**Ajouter le helper et l'endpoint :**
```typescript
import { createHash } from 'crypto';

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

// Check if an item already exists (before extraction)
// Utilise query params pour éviter les problèmes d'encoding dans l'URL
apiRouter.get('/item/check', asyncHandler(async (req: Request, res: Response) => {
  const { youtubeId, url } = req.query;

  // Déterminer le source_id
  let sourceId: string;
  if (youtubeId && typeof youtubeId === 'string') {
    sourceId = youtubeId;
  } else if (url && typeof url === 'string') {
    sourceId = hashUrl(url);
  } else {
    return res.status(400).json({ error: 'youtubeId or url required' });
  }

  const item = await getItemBySourceId(sourceId);

  if (item) {
    res.json({
      exists: true,
      item: {
        id: item.id,
        title: item.title,
        channel: item.channel,
        duration: item.duration
      }
    });
  } else {
    res.json({ exists: false });
  }
}));
```

**Note** : On utilise des query params (`?youtubeId=xxx`) au lieu de path params (`/:sourceId`) pour éviter les problèmes d'encoding avec les URLs.

---

### Phase 4 : Adapter l'Extension

#### 4.1 Modifier `createX10WithExtraction` dans `content.ts`

```typescript
async createX10WithExtraction(
  videoUrl: string,
  forceNew = false
): Promise<{ success: boolean; x10Id?: string; userCode?: string; error?: string }> {
  try {
    const videoId = extractYoutubeId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // NOUVEAU: Vérifier si l'item existe déjà sur le serveur
    const checkResult = await this._fetch(`/api/item/check?youtubeId=${videoId}`);

    let payload: AddContentPayload;

    if (checkResult.exists && !checkResult._error) {
      // Item existe déjà - pas besoin d'extraire!
      console.log('[STYA] Item already exists, skipping extraction');
      payload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: checkResult.item.title,
        type: 'youtube',
        content: '', // Vide - le serveur réutilisera le transcript existant
        youtube_id: videoId,
        channel: checkResult.item.channel,
        duration: null,
        forceNew,
        useExisting: true  // Flag pour le serveur
      };
    } else {
      // Item n'existe pas - extraire
      console.log('[STYA] Extracting transcript for:', videoId);
      const result = await getTranscript(videoId);

      payload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: result.title,
        type: 'youtube',
        content: result.transcript,
        youtube_id: videoId,
        channel: result.channel,
        duration: result.duration,
        forceNew
      };
    }

    const data = await this._fetch('/api/x10/add-content', {
      method: 'POST',
      body: { ...payload, userCode: this.userCode || undefined },
    });

    if (data.success && data.userCode) {
      this.userCode = data.userCode as string;
      safeStorageSet({ styaUserCode: data.userCode });
    }

    return {
      success: !!data.success,
      x10Id: data.collectionId as string | undefined,
      userCode: data.userCode as string | undefined,
      error: data.error as string | undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] createX10WithExtraction error:', error);
    return { success: false, error: errorMessage };
  }
}
```

#### 4.2 Modifier `addVideoToX10WithExtraction` dans `content.ts`

```typescript
async addVideoToX10WithExtraction(
  x10Id: string,
  videoUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const videoId = extractYoutubeId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // NOUVEAU: Vérifier si l'item existe déjà sur le serveur
    const checkResult = await this._fetch(`/api/item/check?youtubeId=${videoId}`);

    let payload: AddContentPayload;

    if (checkResult.exists) {
      console.log('[STYA] Item already exists, skipping extraction');
      payload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: checkResult.item.title,
        type: 'youtube',
        content: '',
        youtube_id: videoId,
        channel: checkResult.item.channel,
        duration: null,
        collectionId: x10Id,
        useExisting: true
      };
    } else {
      console.log('[STYA] Extracting transcript for:', videoId);
      const result = await getTranscript(videoId);

      payload = {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: result.title,
        type: 'youtube',
        content: result.transcript,
        youtube_id: videoId,
        channel: result.channel,
        duration: result.duration,
        collectionId: x10Id
      };
    }

    const data = await this._fetch('/api/x10/add-content', {
      method: 'POST',
      body: { ...payload, userCode: this.userCode || undefined },
    });

    return {
      success: data._ok || !!data.success,
      error: data.error as string | undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STYA] addVideoToX10WithExtraction error:', error);
    return { success: false, error: errorMessage };
  }
}
```

#### 4.3 Modifier le endpoint serveur pour gérer `useExisting`

Dans `server/src/routes/api.ts`, modifier `POST /api/x10/add-content` :

```typescript
apiRouter.post('/x10/add-content', asyncHandler(async (req: Request, res: Response) => {
  const { url, title, type, content, youtube_id, channel, duration,
          collectionId, forceNew, userCode, useExisting } = req.body;

  // Validations de base
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL required' });
  }
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ success: false, error: 'Title required' });
  }
  if (!type || (type !== 'youtube' && type !== 'webpage')) {
    return res.status(400).json({ success: false, error: 'Type must be "youtube" or "webpage"' });
  }

  // Si useExisting=true, content peut être vide (on réutilise l'existant)
  // Sinon, content est obligatoire
  if (!useExisting) {
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'Content required' });
    }
    if (content.length > 500 * 1024) {
      return res.status(400).json({ success: false, error: 'Content too large (max 500KB)' });
    }
  }

  // YouTube videos must have youtube_id
  if (type === 'youtube' && !youtube_id) {
    return res.status(400).json({ success: false, error: 'YouTube ID required for YouTube videos' });
  }

  // ... reste du code (la fonction addPreExtractedItemToCollection gère useExisting) ...
}));
```

---

### Phase 5 : Finalisation

#### 5.1 Renommer les tables

```sql
-- Après avoir vérifié que tout fonctionne
ALTER TABLE items RENAME TO items_old;
ALTER TABLE items_new RENAME TO items;

-- Mettre à jour les FK de collection_items
-- (déjà créée avec référence à items_new, donc pas de changement nécessaire si on renomme)
```

#### 5.2 Supprimer l'ancienne table

```sql
-- Uniquement après validation complète en production
DROP TABLE items_old;
```

---

## Fichiers à Modifier

| Fichier | Modifications |
|---------|---------------|
| `server/src/services/collection.ts` | Types Item/CollectionItem, toutes les fonctions CRUD, ajouter `hashUrl` |
| `server/src/routes/api.ts` | Nouveau endpoint `GET /api/item/check`, modifier `add-content` pour `useExisting` |
| `server/src/routes/x10.ts` | Adapter les routes `.md` : `item.youtube_id` → `item.source_id` (si type=youtube) |
| `extension/src/content.ts` | Check before extract dans `createX10WithExtraction` et `addVideoToX10WithExtraction` |
| `extension/src/lib/types.ts` | Ajouter `useExisting?: boolean` à `AddContentPayload` |

### Détails x10.ts (routes markdown)

Les routes qui génèrent le markdown utilisent `item.youtube_id`. Adapter :

```typescript
// AVANT
const itemId = isYouTube ? item.youtube_id : item.id;

// APRÈS
const itemId = item.source_type === 'youtube' ? item.source_id : item.id;
```

Et pour le type :
```typescript
// AVANT
const isYouTube = item.type === 'youtube' || item.youtube_id;

// APRÈS
const isYouTube = item.source_type === 'youtube';
```

---

## Tests de Validation

### Test 1 : Pas de duplication
```bash
# Ajouter la même vidéo à 2 collections différentes
# Vérifier qu'il n'y a qu'une seule ligne dans items_new
SELECT COUNT(*) FROM items_new WHERE source_id = 'VIDEO_ID';
# Attendu: 1

# Vérifier qu'il y a 2 liens
SELECT COUNT(*) FROM collection_items WHERE item_id = (
  SELECT id FROM items_new WHERE source_id = 'VIDEO_ID'
);
# Attendu: 2
```

### Test 2 : Skip extraction si existe
```bash
# Activer les logs console dans l'extension
# Ajouter une vidéo déjà existante
# Vérifier le log: "[STYA] Item already exists, skipping extraction"
```

### Test 3 : Suppression cascade
```bash
# Supprimer une collection
# Vérifier que les liens sont supprimés mais pas les items
DELETE FROM collections WHERE id = 'XXX';
SELECT * FROM collection_items WHERE collection_id = 'XXX';
# Attendu: 0 rows (liens supprimés)

SELECT * FROM items_new;
# Attendu: items toujours présents
```

---

## Gains Attendus

| Métrique | Avant | Après |
|----------|-------|-------|
| Vidéo dans 10 collections | 10 copies transcript | 1 copie |
| Stockage pour vidéo populaire | N × 100KB | 100KB |
| Temps ajout vidéo existante | 5-15s (extraction) | <500ms (lien seulement) |
| Appels InnerTube | À chaque ajout | Seulement si nouveau |

---

## Rollback Plan

Si problème en production :

1. L'ancienne table `items_old` est conservée
2. Revenir au code précédent (git revert)
3. Les données sont intactes dans `items_old`

---

## Ordre d'Exécution

**Important** : L'ordre est crucial pour éviter le downtime.

### Étape 1 : Préparation base de données (pas de downtime)
1. Créer les nouvelles tables SQL (`items_new`, `collection_items`)
2. Exécuter le script de migration des données
3. Vérifier que les données sont correctement migrées

### Étape 2 : Déploiement code serveur
4. Déployer le nouveau code serveur (Phase 2 + Phase 3)
   - Le code utilise `items_new` qui existe déjà
   - L'ancien code n'est plus utilisé

### Étape 3 : Déploiement extension
5. Mettre à jour l'extension Chrome (Phase 4)
   - Publier sur Chrome Web Store ou recharger en dev

### Étape 4 : Validation
6. Tester en production :
   - Créer une collection
   - Ajouter une vidéo déjà existante → doit skip l'extraction
   - Vérifier les logs serveur

### Étape 5 : Nettoyage (après validation)
7. Renommer les tables :
   ```sql
   ALTER TABLE items RENAME TO items_old;
   ALTER TABLE items_new RENAME TO items;
   ```
8. Après 1 semaine sans problème : `DROP TABLE items_old;`

---

## Cas Limites et Edge Cases

### Race condition : deux users ajoutent la même vidéo simultanément

La contrainte `UNIQUE` sur `source_id` protège contre les doublons. Si deux insertions arrivent en même temps :
- La première réussit
- La deuxième échoue avec erreur duplicate key
- **Solution** : dans `addPreExtractedItemToCollection`, attraper l'erreur et réessayer en mode "existing item"

```typescript
// Dans addPreExtractedItemToCollection, après l'insert qui échoue :
if (insertError?.code === '23505') { // PostgreSQL duplicate key error
  // Item créé par un autre process - réessayer en mode existing
  const { data: existingItem } = await supabase
    .from('items_new')
    .select('*')
    .eq('source_id', sourceId)
    .single();
  if (existingItem) {
    itemId = existingItem.id;
    // Continuer avec le lien...
  }
}
```

### useExisting=true mais item n'existe pas

Si l'extension envoie `useExisting=true` mais l'item a été supprimé entre-temps :
- `addPreExtractedItemToCollection` cherche par `source_id` → ne trouve pas
- Essaie d'insérer avec `content` vide → transcript sera vide

**Solution** : Le serveur doit vérifier et retourner une erreur :

```typescript
// Dans POST /api/x10/add-content
if (useExisting) {
  const existingItem = await getItemBySourceId(sourceId);
  if (!existingItem) {
    return res.status(400).json({
      success: false,
      error: 'Item not found. Please retry without cache.',
      retryWithExtraction: true  // Signal à l'extension
    });
  }
}
```

### N+1 queries dans getCollectionsFor*

Les fonctions `getCollectionsForAnonymous` et `getCollectionsForUser` font une requête par collection (N+1 pattern). Pour un MVP avec <100 collections par user, c'est acceptable.

**Optimisation future** : Utiliser une seule requête avec `array_agg` ou charger tous les items d'un coup.

---

## Questions Ouvertes

1. **Nettoyage des items orphelins** : Faut-il supprimer les items qui ne sont plus dans aucune collection ? (Cron job ?)

2. **Pages web** : Pour les webpages, `source_id` = hash(URL). Mais si le contenu change ? Garder l'ancien ou mettre à jour ?

3. **Limites** : Faut-il limiter le nombre de collections pouvant référencer le même item ? (Probablement non)
