# Extension Context Invalidated — Analyse et Plan d'Implémentation

## Le Problème

```
[STYA] getMyX10s error: Error: Extension context invalidated.
[STYA] _fetch error: Extension context invalidated.
[STYA] checkVideoInX10s error: Error: Extension context invalidated.
```

## Cause Racine

L'architecture actuelle fait passer les appels API par le service worker :

```
Content Script → chrome.runtime.sendMessage → Service Worker → fetch() → Server
```

Quand l'extension est mise à jour ou rechargée, `chrome.runtime.sendMessage` échoue car le contexte est invalidé.

## La Vraie Solution

Les content scripts peuvent faire des `fetch()` directement. Pas besoin du service worker.

```
Content Script → fetch() directement → Server
```

**Pourquoi ça marche :**
- Le serveur CORS accepte déjà `chrome-extension://` (voir `api.ts` ligne 31)
- Le cookie `x10_anon` est `SameSite=None; Secure`, donc envoyé avec `credentials: 'include'`
- L'extension a `host_permissions: ["<all_urls>"]`

---

## Plan d'Implémentation

### Phase 1 : Remplacer la méthode `_fetch` dans content.ts

**Fichier** : `extension/src/content.ts`

**Supprimer** : La méthode `_fetch` qui utilise `chrome.runtime.sendMessage` (lignes ~74-103)

**Remplacer par** :

```typescript
async _fetch(endpoint: string, options: {
  method?: string;
  body?: unknown;
} = {}): Promise<Record<string, unknown> & { _ok: boolean; _status: number }> {
  const url = this.baseUrl + endpoint;

  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    credentials: 'include',
  };

  if (options.body) {
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    return { ...data, _ok: response.ok, _status: response.status };
  } catch (error) {
    // Network error ou JSON parse error
    return {
      _ok: false,
      _status: 0,
      _error: true,
      message: error instanceof Error ? error.message : 'Network error'
    };
  }
}
```

**Note** : Le code appelant utilise déjà `data._ok` et `data._status`, donc pas de changement nécessaire ailleurs.

### Phase 2 : Supprimer l'import des types inutilisés

**Fichier** : `extension/src/content.ts`

**Ligne ~5** : Changer l'import

```typescript
// AVANT
import type { ApiFetchMessage, ApiFetchResponse, AddContentPayload } from './lib/types';

// APRÈS
import type { AddContentPayload } from './lib/types';
```

### Phase 3 : Protéger les accès à chrome.storage

Créer trois helpers au début du fichier (après les imports) :

```typescript
// Pour les appels async/await
function safeStorageSet(data: Record<string, unknown>): void {
  try {
    chrome.storage?.local?.set(data);
  } catch {
    // Context invalidé - pas grave, c'est juste du cache
  }
}

async function safeStorageGet(keys: string[]): Promise<Record<string, unknown>> {
  try {
    return await chrome.storage?.local?.get(keys) ?? {};
  } catch {
    return {};
  }
}

// Pour les appels avec callback (ligne 1381)
function safeStorageGetCallback(keys: string[], callback: (data: Record<string, unknown>) => void): void {
  try {
    chrome.storage?.local?.get(keys, callback);
  } catch {
    callback({});
  }
}
```

**Remplacer les usages** :

| Ligne | Style | Avant | Après |
|-------|-------|-------|-------|
| ~111 | async | `await chrome.storage.local.get([...])` | `await safeStorageGet([...])` |
| ~141 | sync | `await chrome.storage.local.set({...})` | `safeStorageSet({...})` |
| ~220 | sync | `await chrome.storage.local.set({...})` | `safeStorageSet({...})` |
| ~765 | async | `await chrome.storage.local.get([...])` | `await safeStorageGet([...])` |
| ~791 | sync | `chrome.storage.local.set({...})` | `safeStorageSet({...})` |
| ~901 | async | `await chrome.storage.local.get([...])` | `await safeStorageGet([...])` |
| ~1381 | callback | `chrome.storage.local.get([...], (data) => {...})` | `safeStorageGetCallback([...], (data) => {...})` |
| ~1401 | sync | `chrome.storage.local.set({...})` | `safeStorageSet({...})` |

### Phase 4 : Nettoyer le service worker

**Fichier** : `extension/src/background.ts`

Supprimer le proxy API mais **GARDER** `onInstalled` :

```typescript
// GARDER
import { config } from './lib/config';

console.log('[STYA] Background service worker loaded');

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[STYA] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[STYA] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// SUPPRIMER tout le reste (getBaseUrl, cachedBaseUrl, onMessage handler, handleApiFetch)
```

### Phase 5 : Nettoyer les types

**Fichier** : `extension/src/lib/types.ts`

Supprimer les interfaces `ApiFetchMessage` et `ApiFetchResponse` (lignes ~58-75).

### Ce qu'on NE TOUCHE PAS

- `chrome.runtime.onMessage.addListener` dans content.ts (ligne ~33) → utilisé pour la communication popup ↔ content script
- `isExtensionContextValid()` → utile pour le message listener
- `chrome.runtime?.id` → check de validité

---

## Fichiers à Modifier

| Fichier | Action |
|---------|--------|
| `extension/src/content.ts` | Remplacer `_fetch`, ajouter helpers, nettoyer imports |
| `extension/src/background.ts` | Supprimer proxy API, garder onInstalled |
| `extension/src/lib/types.ts` | Supprimer ApiFetchMessage/ApiFetchResponse |

---

## Vérification CORS (déjà OK)

Le serveur accepte déjà les extensions Chrome (`api.ts` lignes 28-33) :

```typescript
const isAllowed = origin && (
  origin.includes('youtube.com') ||
  origin.includes(new URL(config.baseUrl).host) ||
  origin.startsWith('chrome-extension://') ||  // ✅
  origin.startsWith('moz-extension://')
);
```

---

## Résultat Attendu

| Scénario | Avant | Après |
|----------|-------|-------|
| Extension rechargée | ❌ "Extension context invalidated" | ✅ Fonctionne |
| Extension mise à jour | ❌ Erreur jusqu'au refresh | ✅ Fonctionne |
| Storage échoue | ❌ Erreur | ✅ Continue sans cache |

---

## Tests à Effectuer

1. **Test normal** : Ajouter une vidéo depuis YouTube
2. **Test reload** : Recharger l'extension (chrome://extensions), retourner sur YouTube SANS refresh, utiliser le menu
3. **Test collections** : Vérifier que la liste des collections se charge
4. **Test check video** : Vérifier que le ✓ apparaît sur les vidéos déjà ajoutées
