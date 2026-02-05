# Plan de Migration SQLite → Supabase

## Pourquoi migrer

1. **Concurrence** : SQLite avec better-sqlite3 est synchrone et bloquant. Les écritures sont sérialisées. Avec plusieurs utilisateurs faisant des ajouts simultanés → goulots d'étranglement.

2. **Scalabilité** : Supabase (PostgreSQL) gère nativement les connexions concurrentes avec un pool de connexions.

3. **Hébergement** : La DB est hébergée par Supabase, pas besoin de gérer un fichier .db sur ton serveur.

4. **Dashboard** : Interface web pour visualiser/éditer les données.

**Latence** : Les requêtes passent par le réseau (vs fichier local), mais Supabase est rapide.

---

## Décisions

| Décision | Choix |
|----------|-------|
| Authentification | **Non** - on garde `anonymous_id` (cookie) |
| Row Level Security | **Non** - le serveur utilise la service key |
| Tables auth Supabase | **Non utilisées** |
| Renommage tables | `x10s` → `collections`, `videos` → `items` |

---

## Schéma Supabase

```sql
-- ============================================
-- STRAIGHTTOYOUR.AI - SCHEMA SUPABASE
-- ============================================

-- Collections
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  user_id TEXT,                -- Nullable, pour future auth
  anonymous_id TEXT,           -- Nullable, pour users anonymes (actuel)
  title TEXT,
  pre_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collections_anonymous_id ON collections(anonymous_id);
CREATE INDEX idx_collections_created_at ON collections(created_at DESC);

-- Items (vidéos YouTube et pages web)
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'youtube' CHECK (type IN ('youtube', 'webpage')),
  youtube_id TEXT,
  title TEXT,
  channel TEXT,
  duration TEXT,
  transcript TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_collection_id ON items(collection_id);
CREATE INDEX idx_items_youtube_id ON items(youtube_id);

-- Préférences utilisateur
CREATE TABLE user_settings (
  user_code TEXT PRIMARY KEY,
  default_pre_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRIGGER updated_at automatique
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Renommages dans le code

### Tables et colonnes

| Ancien | Nouveau |
|--------|---------|
| `x10s` (table) | `collections` |
| `videos` (table) | `items` |
| `x10_id` | `collection_id` |

### Fichiers

| Ancien | Nouveau |
|--------|---------|
| `server/src/services/x10.ts` | `server/src/services/collection.ts` |
| `server/src/db.ts` | **Supprimer** (remplacé par supabase.ts) |

### Fonctions (x10.ts → collection.ts)

| Ancien | Nouveau | Notes |
|--------|---------|-------|
| `createX10()` | `createCollection()` | Était async (extraction serveur) - DÉSACTIVÉ |
| `getX10ById()` | `getCollectionById()` | |
| `getX10sForUser()` | `getCollectionsForUser()` | Garder pour future auth |
| `getX10sForAnonymous()` | `getCollectionsForAnonymous()` | |
| `addVideoToX10()` | `addItemToCollection()` | Était async (extraction serveur) - DÉSACTIVÉ |
| `addPreExtractedContentToX10()` | `addPreExtractedItemToCollection()` | Endpoint actif |
| `createX10WithPreExtractedContent()` | `createCollectionWithPreExtractedItem()` | Endpoint actif |
| `removeVideoFromX10()` | `removeItemFromCollection()` | |
| `updateX10Title()` | `updateCollectionTitle()` | |
| `updateX10PrePrompt()` | `updateCollectionPrePrompt()` | |
| `claimX10()` | `claimCollection()` | Garder pour future auth |
| `forkX10()` | `forkCollection()` | Garder pour future auth |
| `deleteX10()` | `deleteCollection()` | |
| `checkVideoInUserX10s()` | `checkItemInUserCollections()` | Garder pour future auth |
| `checkVideoInAnonymousX10s()` | `checkItemInAnonymousCollections()` | |

### Interfaces

| Ancien | Nouveau |
|--------|---------|
| `X10` | `Collection` |
| `X10WithVideos` | `CollectionWithItems` |
| `Video` | `Item` |
| `PreExtractedContent` | `PreExtractedItem` |

### Extension (types.ts)

| Ancien | Nouveau |
|--------|---------|
| `X10Collection` | `Collection` |
| `X10Item` | `Item` |
| `X10Collection.videos` | `Collection.items` |

---

## Plan de migration

### Phase 1 : Setup Supabase

1. Créer un projet sur https://supabase.com
2. Aller dans **SQL Editor** et exécuter le schéma ci-dessus
3. Récupérer les credentials dans **Settings → API** :
   - `SUPABASE_URL` : Project URL
   - `SUPABASE_PUBLISHABLE_KEY` : Publishable API Key
   - `SUPABASE_SECRET_KEY` : Secret Key (cliquer "Reveal")

4. Ajouter au fichier `.env` (racine du projet) :
   ```bash
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

### Phase 2 : Client Supabase

1. Installer le SDK :
   ```bash
   cd server && npm install @supabase/supabase-js
   ```

2. Mettre à jour `server/src/config.ts` :
   ```typescript
   export const config = {
     // ... existing
     supabaseUrl: process.env.SUPABASE_URL,
     supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
     supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
   };
   ```

3. Créer `server/src/supabase.ts` :
   ```typescript
   import { createClient } from '@supabase/supabase-js';
   import { config } from './config.js';

   if (!config.supabaseUrl || !config.supabaseSecretKey) {
     throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env');
   }

   export const supabase = createClient(
     config.supabaseUrl,
     config.supabaseSecretKey,
     { auth: { persistSession: false } }
   );
   ```

### Phase 3 : Migrer les services

Créer `server/src/services/collection.ts` (remplace `x10.ts`) :

```typescript
import { nanoid } from 'nanoid';
import { supabase } from '../supabase.js';

// ============================================
// Types
// ============================================

export interface Collection {
  id: string;
  user_id: string | null;      // Pour future auth
  anonymous_id: string | null;
  title: string | null;
  pre_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  collection_id: string;
  url: string;
  type: 'youtube' | 'webpage';
  youtube_id: string | null;
  title: string | null;
  channel: string | null;
  duration: string | null;
  transcript: string | null;
  added_at: string;
}

export interface CollectionWithItems extends Collection {
  items: Item[];
  tokenCount: number;
}

export interface PreExtractedItem {
  url: string;
  title: string;
  type: 'youtube' | 'webpage';
  content: string;
  youtube_id?: string;
  channel?: string;
  duration?: number;  // en secondes
}

// ============================================
// Helpers
// ============================================

function generateId(): string {
  return nanoid(8);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function calculateTokenCount(items: Item[]): number {
  return items.reduce((sum, item) => {
    return sum + estimateTokens(item.transcript || '');
  }, 0);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// CRUD Functions
// ============================================

export async function getCollectionById(id: string): Promise<CollectionWithItems | null> {
  const { data, error } = await supabase
    .from('collections')
    .select('*, items(*)')
    .eq('id', id)
    .order('added_at', { referencedTable: 'items', ascending: false })
    .single();

  if (error || !data) return null;

  return { ...data, tokenCount: calculateTokenCount(data.items) };
}

export async function getCollectionsForAnonymous(anonymousId: string): Promise<CollectionWithItems[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*, items(*)')
    .eq('anonymous_id', anonymousId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map(c => ({ ...c, tokenCount: calculateTokenCount(c.items) }));
}

export async function getCollectionsForUser(userId: string): Promise<CollectionWithItems[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*, items(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map(c => ({ ...c, tokenCount: calculateTokenCount(c.items) }));
}

export async function createCollectionWithPreExtractedItem(
  content: PreExtractedItem,
  anonymousId: string
): Promise<CollectionWithItems> {
  const collectionId = generateId();
  const itemId = generateId();
  const now = new Date().toISOString();
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  // Insert collection
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

  // Insert item
  const { error: itemError } = await supabase
    .from('items')
    .insert({
      id: itemId,
      collection_id: collectionId,
      url: content.url,
      type: content.type,
      youtube_id: content.youtube_id || null,
      title: content.title,
      channel: content.channel || null,
      duration: durationStr,
      transcript: content.content,
      added_at: now
    });

  if (itemError) throw new Error(itemError.message);

  const item: Item = {
    id: itemId,
    collection_id: collectionId,
    url: content.url,
    type: content.type,
    youtube_id: content.youtube_id || null,
    title: content.title,
    channel: content.channel || null,
    duration: durationStr,
    transcript: content.content,
    added_at: now
  };

  return {
    id: collectionId,
    user_id: null,
    anonymous_id: anonymousId,
    title: content.title,
    pre_prompt: null,
    created_at: now,
    updated_at: now,
    items: [item],
    tokenCount: estimateTokens(content.content)
  };
}

export async function addPreExtractedItemToCollection(
  collectionId: string,
  content: PreExtractedItem
): Promise<Item> {
  const itemId = generateId();
  const now = new Date().toISOString();
  const durationStr = content.duration ? formatDuration(content.duration) : null;

  const { data, error } = await supabase
    .from('items')
    .insert({
      id: itemId,
      collection_id: collectionId,
      url: content.url,
      type: content.type,
      youtube_id: content.youtube_id || null,
      title: content.title,
      channel: content.channel || null,
      duration: durationStr,
      transcript: content.content,
      added_at: now
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Update collection's updated_at
  await supabase
    .from('collections')
    .update({ updated_at: now })
    .eq('id', collectionId);

  return data;
}

export async function removeItemFromCollection(collectionId: string, itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', itemId)
    .eq('collection_id', collectionId);

  if (error) return false;

  await supabase
    .from('collections')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', collectionId);

  return true;
}

export async function updateCollectionTitle(id: string, title: string): Promise<boolean> {
  const { error } = await supabase
    .from('collections')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

export async function updateCollectionPrePrompt(id: string, prePrompt: string | null): Promise<boolean> {
  const { error } = await supabase
    .from('collections')
    .update({ pre_prompt: prePrompt, updated_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

export async function deleteCollection(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', id);

  return !error;
}

export async function checkItemInAnonymousCollections(anonymousId: string, youtubeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, items!inner(youtube_id)')
    .eq('anonymous_id', anonymousId)
    .eq('items.youtube_id', youtubeId);

  if (error || !data) return [];
  return data.map(c => c.id);
}

// Pour future auth
export async function checkItemInUserCollections(userId: string, youtubeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, items!inner(youtube_id)')
    .eq('user_id', userId)
    .eq('items.youtube_id', youtubeId);

  if (error || !data) return [];
  return data.map(c => c.id);
}

export async function forkCollection(originalId: string, newUserId: string): Promise<CollectionWithItems | null> {
  const original = await getCollectionById(originalId);
  if (!original) return null;

  const newId = generateId();
  const now = new Date().toISOString();

  // Copy collection
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

  // Copy items
  for (const item of original.items) {
    await supabase.from('items').insert({
      id: generateId(),
      collection_id: newId,
      url: item.url,
      type: item.type,
      youtube_id: item.youtube_id,
      title: item.title,
      channel: item.channel,
      duration: item.duration,
      transcript: item.transcript,
      added_at: now
    });
  }

  return getCollectionById(newId);
}

export async function claimCollection(id: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('collections')
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('user_id', null)
    .select();

  return !error && data && data.length > 0;
}
```

Migrer aussi `server/src/services/settings.ts` :

```typescript
import { supabase } from '../supabase.js';

export interface UserSettings {
  user_code: string;
  default_pre_prompt: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_PRE_PROMPT = 'Summarize the content. What do we learn?';

export function getDefaultPrePromptText(): string {
  return DEFAULT_PRE_PROMPT;
}

export async function getUserSettings(userCode: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_code', userCode)
    .single();

  if (data) return data;

  // Create if not exists
  const now = new Date().toISOString();
  const newSettings: UserSettings = {
    user_code: userCode,
    default_pre_prompt: DEFAULT_PRE_PROMPT,
    created_at: now,
    updated_at: now
  };

  await supabase.from('user_settings').insert(newSettings);
  return newSettings;
}

export async function updateDefaultPrePrompt(userCode: string, prePrompt: string): Promise<UserSettings> {
  const now = new Date().toISOString();

  await supabase
    .from('user_settings')
    .upsert({
      user_code: userCode,
      default_pre_prompt: prePrompt,
      created_at: now,
      updated_at: now
    });

  return getUserSettings(userCode);
}
```

### Phase 4 : Adapter les routes

Toutes les fonctions deviennent **async** :

```typescript
// AVANT
router.get('/:id', (req, res) => {
  const collection = getCollectionById(req.params.id);
  // ...
});

// APRÈS
router.get('/:id', async (req, res) => {
  const collection = await getCollectionById(req.params.id);
  // ...
});
```

### Phase 5 : Script de migration des données

Créer `scripts/migrate-to-supabase.ts` :

```typescript
import 'dotenv/config';
import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set');
}

const sqlite = new Database('x10tube.db');
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

async function migrate() {
  console.log('Starting migration...');

  // 1. Migrer user_settings
  const settings = sqlite.prepare('SELECT * FROM user_settings').all();
  if (settings.length > 0) {
    const { error } = await supabase.from('user_settings').insert(settings);
    if (error) console.error('user_settings error:', error);
    else console.log(`Migrated ${settings.length} user_settings`);
  }

  // 2. Migrer collections (anciennement x10s)
  const x10s = sqlite.prepare('SELECT * FROM x10s').all();
  if (x10s.length > 0) {
    const collections = x10s.map(x => ({
      id: x.id,
      user_id: x.user_id,        // Garder pour future auth
      anonymous_id: x.anonymous_id,
      title: x.title,
      pre_prompt: x.pre_prompt,
      created_at: x.created_at,
      updated_at: x.updated_at
    }));

    const { error } = await supabase.from('collections').insert(collections);
    if (error) console.error('collections error:', error);
    else console.log(`Migrated ${collections.length} collections`);
  }

  // 3. Migrer items (anciennement videos)
  const videos = sqlite.prepare('SELECT * FROM videos').all();
  if (videos.length > 0) {
    const items = videos.map(v => ({
      id: v.id,
      collection_id: v.x10_id,  // Renommé
      url: v.url,
      type: v.type,
      youtube_id: v.youtube_id,
      title: v.title,
      channel: v.channel,
      duration: v.duration,
      transcript: v.transcript,
      added_at: v.added_at
    }));

    // Batch insert (Supabase limite à ~1000 rows)
    for (let i = 0; i < items.length; i += 500) {
      const batch = items.slice(i, i + 500);
      const { error } = await supabase.from('items').insert(batch);
      if (error) console.error(`items batch ${i} error:`, error);
      else console.log(`Migrated items ${i} to ${i + batch.length}`);
    }
  }

  console.log('Migration complete!');
  process.exit(0);
}

migrate().catch(console.error);
```

Exécuter avec :
```bash
npx tsx scripts/migrate-to-supabase.ts
```

### Phase 6 : Nettoyage

1. Supprimer `server/src/db.ts`
2. Supprimer `server/src/services/x10.ts`
3. Supprimer la dépendance `better-sqlite3`
4. Mettre à jour les imports partout

---

## Checklist des fichiers

### Serveur

| Fichier | Action |
|---------|--------|
| `.env` | Ajouter SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY |
| `server/src/config.ts` | Ajouter 3 variables Supabase |
| `server/src/supabase.ts` | **Créer** - client Supabase |
| `server/src/services/collection.ts` | **Créer** - remplace x10.ts (toutes les fonctions) |
| `server/src/services/x10.ts` | **Supprimer** |
| `server/src/services/settings.ts` | Migrer vers Supabase (2 fonctions) |
| `server/src/services/content.ts` | **Garder** - pas de DB, juste extraction |
| `server/src/services/transcript.ts` | **Garder** - pas de DB, juste extraction |
| `server/src/db.ts` | **Supprimer** |
| `server/src/routes/api.ts` | async/await + renommer x10→collection |
| `server/src/routes/x10.ts` | async/await (garder le nom de fichier, routes /s/) |
| `server/src/routes/index.ts` | async/await + renommer x10→collection |
| `server/package.json` | Ajouter @supabase/supabase-js, retirer better-sqlite3 |

### Extension

| Fichier | Action |
|---------|--------|
| `extension/src/lib/types.ts` | X10Collection→Collection, X10Item→Item, videos→items |
| `extension/src/lib/api.ts` | Mettre à jour noms de types |
| `extension/src/content.ts` | Vérifier si utilise les types renommés |

### Scripts

| Fichier | Action |
|---------|--------|
| `scripts/migrate-to-supabase.ts` | **Créer** - migration one-shot des données |

---

## Future : Messaging in-app

```sql
-- À ajouter plus tard
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'feature', 'maintenance')),
  target_anonymous_ids TEXT[],  -- NULL = broadcast à tous
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE message_dismissals (
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  anonymous_id TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, anonymous_id)
);
```

---

## Prochaines étapes

1. **Toi** : Créer le projet Supabase + exécuter le schéma SQL
2. **Toi** : Ajouter les credentials au `.env`
3. **Moi** : Migrer le code quand tu donnes le feu vert
