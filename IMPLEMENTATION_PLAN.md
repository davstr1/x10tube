# Plan d'Implémentation — Production Readiness

## Vue d'ensemble

| Phase | Description | Temps estimé |
|-------|-------------|--------------|
| 1 | Gestion d'erreurs serveur | 30 min |
| 2 | Health check Supabase | 15 min |
| 3 | Fix sécurité DELETE collection | 10 min |
| 4 | Validation des inputs | 20 min |
| 5 | Timeout extraction YouTube | 20 min |
| **Total** | | **~1h35** |

---

## Phase 1 : Gestion d'erreurs serveur

### 1.1 Créer un wrapper async pour les routes

**Dossier** : Créer `server/src/lib/` s'il n'existe pas

**Fichier** : `server/src/lib/asyncHandler.ts` (nouveau)

```typescript
import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap async route handlers to catch errors automatically
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### 1.2 Ajouter le middleware d'erreur global

**Fichier** : `server/src/index.ts`

**Modifier l'import existant** :
```typescript
// AVANT
import express from 'express';

// APRÈS
import express, { Request, Response, NextFunction } from 'express';
```

**Ajouter après les routes, avant le 404 handler** :
```typescript
// Global error handler (must be after routes)
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);
  console.error(err.stack);

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';

  if (req.path.startsWith('/api/')) {
    res.status(500).json({
      error: isDev ? err.message : 'Internal server error'
    });
  } else {
    res.status(500).render('error', {
      title: 'Erreur',
      message: isDev ? err.message : 'Une erreur est survenue'
    });
  }
});
```

### 1.3 Ajouter handlers pour unhandledRejection

**Fichier** : `server/src/index.ts`

**Ajouter au début du fichier, après les imports** :
```typescript
// Handle uncaught errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  process.exit(1);
});
```

### 1.4 Wrapper les routes async dans x10.ts

**Fichier** : `server/src/routes/x10.ts`

**Ajouter import** :
```typescript
import { asyncHandler } from '../lib/asyncHandler.js';
```

**Wrapper chaque route async** :

```typescript
// AVANT
x10Router.get('/:id.md', async (req: Request, res: Response) => {
  // ...
});

// APRÈS
x10Router.get('/:id.md', asyncHandler(async (req: Request, res: Response) => {
  // ...
}));
```

Routes à wrapper dans x10.ts :
- `GET /:id.md` (ligne 24)
- `GET /:id/v/:itemId.md` (ligne 89)
- `GET /:id` (ligne 141)
- `POST /:id/remove/:videoId` (ligne 208)
- `POST /:id/title` (ligne 230)
- `POST /:id/preprompt` (ligne 253)

### 1.5 Wrapper les routes async dans api.ts

**Fichier** : `server/src/routes/api.ts`

**Ajouter import** :
```typescript
import { asyncHandler } from '../lib/asyncHandler.js';
```

Routes à wrapper :
- `GET /x10s` (ligne 29)
- `GET /x10s/by-code/:userCode` (ligne 51)
- `DELETE /x10/:id/video/:videoId` (ligne 89)
- `GET /check-video` (ligne 112)
- `POST /x10/:id/fork` (ligne 143)
- `DELETE /x10/:id` (ligne 163)
- `POST /x10/add-content` (ligne 197)
- `GET /settings` (ligne 333)
- `PATCH /settings/pre-prompt` (ligne 340)
- `PATCH /x10/:id/pre-prompt` (ligne 353)

### 1.6 Wrapper les routes async dans index.ts (routes)

**Fichier** : `server/src/routes/index.ts`

**Ajouter import** :
```typescript
import { asyncHandler } from '../lib/asyncHandler.js';
```

Routes à wrapper (seulement les routes async) :
- `GET /collections` (ligne 76)
- `POST /x10/:id/delete` (ligne 92)

**Note** : Les routes `/sync` (GET ligne 33, POST ligne 41) ne sont PAS async, elles n'ont pas besoin d'asyncHandler.

---

## Phase 2 : Health check Supabase au démarrage

### 2.1 Ajouter fonction de health check

**Fichier** : `server/src/supabase.ts`

**Ajouter à la fin du fichier** :
```typescript
/**
 * Verify Supabase connection is working
 * Call this at startup to fail fast if DB is unreachable
 */
export async function checkSupabaseConnection(): Promise<void> {
  const { error } = await supabase.from('collections').select('id').limit(1);
  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }
}
```

### 2.2 Modifier le démarrage du serveur

**Fichier** : `server/src/index.ts`

**Ajouter import** :
```typescript
import { checkSupabaseConnection } from './supabase.js';
```

**Remplacer le bloc app.listen** :
```typescript
// AVANT
app.listen(PORT, () => {
  console.log(`X10Tube server running at ${config.baseUrl}`);
});

// APRÈS
async function startServer() {
  try {
    // Verify database connection before starting
    await checkSupabaseConnection();
    console.log('[Startup] Supabase connection OK');

    app.listen(PORT, () => {
      console.log(`X10Tube server running at ${config.baseUrl}`);
    });
  } catch (error) {
    console.error('[Startup] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

---

## Phase 3 : Fix sécurité DELETE collection

### 3.1 Corriger la vérification d'ownership

**Fichier** : `server/src/routes/api.ts`

**Localiser** : `apiRouter.delete('/x10/:id', ...)` (ligne 163)

**Remplacer** :
```typescript
// AVANT
// Check ownership
if (collection.user_id !== userId) {
  return res.status(403).json({ error: 'Not authorized to delete this collection' });
}

// APRÈS
// Check ownership (user_id for authenticated users, anonymous_id for anonymous)
const isOwner = collection.user_id === userId || collection.anonymous_id === req.anonymousId;
if (!isOwner) {
  return res.status(403).json({ error: 'Not authorized to delete this collection' });
}
```

---

## Phase 4 : Validation des inputs

### 4.1 Ajouter validation des longueurs de champs

**Fichier** : `server/src/routes/api.ts`

**Dans POST /x10/add-content (ligne 197), ajouter après ligne 222 (après le check YouTube ID)** :
```typescript
  // Validate field sizes
  if (title.length > 500) {
    return res.status(400).json({ success: false, error: 'Title too long (max 500 chars)' });
  }
  if (url.length > 2000) {
    return res.status(400).json({ success: false, error: 'URL too long (max 2000 chars)' });
  }
  if (channel && channel.length > 200) {
    return res.status(400).json({ success: false, error: 'Channel name too long (max 200 chars)' });
  }
```

### 4.2 Valider le pre-prompt

**Fichier** : `server/src/routes/api.ts`

**Dans PATCH /settings/pre-prompt (ligne 340), ajouter après ligne 346** :
```typescript
  if (prePrompt.length > 10000) {
    return res.status(400).json({ error: 'prePrompt too long (max 10000 chars)' });
  }
```

**Dans PATCH /x10/:id/pre-prompt (ligne 353), ajouter après ligne 367 (après ownership check)** :
```typescript
  if (prePrompt && prePrompt.length > 10000) {
    return res.status(400).json({ error: 'prePrompt too long (max 10000 chars)' });
  }
```

---

## Phase 5 : Timeout extraction YouTube

### 5.1 Ajouter timeout aux appels InnerTube

**Fichier** : `extension/src/lib/innertube.ts`

**Modifier la fonction tryFetchPlayerData** :
```typescript
async function tryFetchPlayerData(
  videoId: string,
  context: typeof WEB_CONTEXT | typeof ANDROID_CONTEXT,
  clientName: string
): Promise<PlayerResponse | null> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`;

  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
      },
      body: JSON.stringify({
        context: context,
        videoId: videoId
      }),
      signal: controller.signal  // ADD THIS
    });

    clearTimeout(timeoutId);  // ADD THIS

    if (!response.ok) {
      console.log(`[InnerTube] ${clientName} client returned ${response.status}`);
      return null;
    }

    const data = await response.json() as PlayerResponse;
    const playability = data?.playabilityStatus?.status;

    if (playability === 'OK') {
      return data;
    }

    console.log(`[InnerTube] ${clientName} client: ${data?.playabilityStatus?.reason || 'Unknown error'}`);
    return null;
  } catch (error) {
    clearTimeout(timeoutId);  // ADD THIS
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[InnerTube] ${clientName} client timed out`);
      return null;
    }
    console.log(`[InnerTube] ${clientName} client error:`, error instanceof Error ? error.message : error);
    return null;
  }
}
```

### 5.2 Ajouter timeout au fetch des captions

**Fichier** : `extension/src/lib/innertube.ts`

**Modifier la fonction fetchCaptions** :
```typescript
async function fetchCaptions(captionUrl: string): Promise<string> {
  // Remove srv3 format if present, use default XML format
  const url = captionUrl.replace('&fmt=srv3', '');

  // Add timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Caption fetch returned ${response.status}`);
    }

    const xml = await response.text();

    // Parse XML and extract text
    const textMatches = xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
    const parts: string[] = [];

    for (const match of textMatches) {
      const text = decodeHtmlEntities(stripTags(match[1]));
      if (text.trim()) {
        parts.push(text);
      }
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Caption fetch timed out (10s)');
    }
    throw error;
  }
}
```

---

## Ordre d'implémentation recommandé

1. **Phase 1.1** : Créer `asyncHandler.ts`
2. **Phase 1.2** : Ajouter middleware d'erreur global
3. **Phase 1.3** : Ajouter handlers unhandledRejection
4. **Phase 2** : Health check Supabase (dépend de 1.2 pour le bon démarrage)
5. **Phase 3** : Fix DELETE collection (rapide, critique)
6. **Phase 1.4-1.6** : Wrapper toutes les routes async
7. **Phase 4** : Validation inputs
8. **Phase 5** : Timeout YouTube

---

## Tests à effectuer après implémentation

### Test 1 : Erreur Supabase simulée
```bash
# Modifier temporairement SUPABASE_URL dans .env avec une URL invalide
# Le serveur doit refuser de démarrer avec un message clair
```

### Test 2 : Route qui échoue
```bash
# Créer une erreur dans une route (throw new Error('test'))
# Vérifier que le serveur ne crash pas et renvoie une 500
```

### Test 3 : DELETE collection autre utilisateur
```bash
# Créer une collection avec user A
# Essayer de la supprimer avec user B
# Doit recevoir 403
```

### Test 4 : Input trop long
```bash
curl -X POST http://localhost:3000/api/x10/add-content \
  -H "Content-Type: application/json" \
  -d '{"title": "'$(python3 -c "print('a'*1000))"'", ...}'
# Doit recevoir 400 "Title too long"
```

### Test 5 : Timeout YouTube
```bash
# Bloquer youtube.com dans /etc/hosts temporairement
# L'extension doit timeout après 15s, pas freeze
```

---

## Fichiers modifiés (résumé)

| Fichier | Action |
|---------|--------|
| `server/src/lib/asyncHandler.ts` | **Nouveau** |
| `server/src/index.ts` | Middleware erreur, handlers process, startup async |
| `server/src/supabase.ts` | Fonction checkSupabaseConnection |
| `server/src/routes/api.ts` | asyncHandler wrapper, fix DELETE, validations |
| `server/src/routes/x10.ts` | asyncHandler wrapper |
| `server/src/routes/index.ts` | asyncHandler wrapper |
| `extension/src/lib/innertube.ts` | Timeouts fetch |
