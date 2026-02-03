# Investigation : "[STYA] Init failed, no cached userCode"

## Problème observé

L'extension Chrome affiche **de manière intermittente** "Could not connect to server" dans le dropdown contextuel YouTube, alors que le serveur tourne.

```
Stack trace: content.js:820 (loadX10sForDropdown)
console.error('[STYA] Init failed, no cached userCode');
```

Parfois ça marche, parfois non. Le serveur est toujours actif.

---

## Le flux qui échoue

```
Clic sur bouton STYA
  └─ showDropdownForVideo()
      └─ loadX10sForDropdown()
          └─ api.init()
              ├─ isExtensionContextValid() ?
              │   └─ Si false → return false immédiatement (pas de fetch)
              └─ syncFromServer()
                  └─ fetch('/api/whoami') → ÉCHEC (catch)
                      └─ isExtensionContextValid() ?
                      │   └─ Si false → ne lit pas le cache → return false
                      └─ Si true → lit le cache
                          └─ Pas de cache → return false
```

---

## Cause racine : invalidation du contexte d'extension

### Le mécanisme

Le content script (`content.js`) est injecté dans YouTube au chargement de la page. L'objet `api` est créé en mémoire une seule fois (ligne 178) et reste en vie aussi longtemps que la page existe.

Mais YouTube est une **SPA (Single Page Application)** : l'utilisateur navigue entre les pages sans rechargement. Le content script survit à ces navigations.

Pendant ce temps, Chrome peut **décharger et recharger le service worker** de l'extension (comportement normal en Manifest V3). Quand cela arrive :

1. `chrome.runtime.id` peut temporairement retourner `undefined`
2. `chrome.storage.local` peut temporairement échouer
3. `chrome.runtime.sendMessage` peut échouer

La fonction `isExtensionContextValid()` vérifie exactement ça :

```javascript
function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;   // ← false si le runtime est invalide
  } catch {
    return false;
  }
}
```

### Pourquoi c'est intermittent

```
[Temps 0]  Page YouTube chargée, content script injecté, runtime OK
[Temps 1]  Utilisateur clique → api.init() → fetch OK ✅
[Temps 2]  Chrome met le service worker en veille (Manifest V3)
[Temps 3]  Utilisateur navigue dans YouTube (SPA, pas de rechargement)
[Temps 4]  Utilisateur clique → api.init()
            ├─ isExtensionContextValid() → false (runtime dormant)
            └─ return false → "Init failed" ❌
[Temps 5]  Chrome réveille le service worker
[Temps 6]  Utilisateur clique → api.init() → fetch OK ✅
```

Le fenêtre de temps où le contexte est invalide est courte et imprévisible, d'où l'intermittence.

### Preuve dans le code

Deux endroits où `isExtensionContextValid()` bloque silencieusement :

1. **Ligne 62** — `init()` abandonne immédiatement :
   ```javascript
   async init() {
     if (!isExtensionContextValid()) {
       console.log('[STYA] Extension context invalidated');
       return false;   // ← pas de fetch, pas de cache, rien
     }
   ```

2. **Ligne 100** — Le fallback cache ne s'exécute pas :
   ```javascript
   catch (error) {
     if (isExtensionContextValid()) {      // ← false = pas de lecture cache
       const cached = await chrome.storage.local.get(['styaUserCode']);
       ...
     }
     return false;   // ← échec silencieux
   }
   ```

Si le runtime est invalide au moment du clic, **même le cache est inaccessible** → échec garanti.

---

## Facteur aggravant : `api.init()` est appelé à CHAQUE clic

```javascript
async function loadX10sForDropdown(videoId) {
  const initOk = await api.init();    // ← refait tout à chaque ouverture
```

L'API n'est **jamais initialisée proactivement**. Le `init()` global (ligne 1340) injecte les styles et les boutons, mais ne fait pas `api.init()`. Tout repose sur le moment du clic.

Si le clic tombe pendant une fenêtre d'invalidation du runtime → échec.

---

## Facteur aggravant : `chrome.storage.local.clear()` à chaque update

```javascript
// background.js, ligne 13
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update') {
    await chrome.storage.local.clear();   // ← efface TOUT le cache
  }
});
```

En développement, chaque rechargement de l'extension est un "update". Le cache `styaUserCode` est vidé. Le content script sur YouTube a toujours l'ancien runtime en mémoire → `isExtensionContextValid()` retourne `false` → pas de fallback possible.

---

## Résumé

| Facteur | Rôle |
|---------|------|
| **Service worker qui dort** (Manifest V3) | `chrome.runtime.id` temporairement `undefined` → init abandonne |
| **Content script longue durée** sur YouTube SPA | Le script survit au cycle de vie du service worker |
| **`api.init()` à chaque clic** | Chaque ouverture retente au lieu de réutiliser un état valide |
| **Pas d'init proactive** | L'API ne se connecte qu'au moment du clic |
| **`storage.clear()` en dev** | Le cache de fallback est vidé à chaque rechargement |
| **Double check `isExtensionContextValid()`** | Même le fallback cache est bloqué si le runtime est invalide |

---

## Implémentation : proxy API via le background script

### Principe

Tous les appels `fetch()` du content script passent par le background script via `chrome.runtime.sendMessage`. Le message réveille automatiquement le service worker, éliminant les fenêtres d'invalidation du runtime. Le content script n'a plus besoin de `isExtensionContextValid()` pour les appels API.

Le popup (`popup.js`) continue à utiliser `api.js` en direct (il n'a pas ce problème de contexte).

### Architecture

```
AVANT (fragile) :
  content.js → fetch('http://localhost:3000/api/...') ← échoue si runtime invalide

APRÈS (robuste) :
  content.js → chrome.runtime.sendMessage({ action: 'apiFetch', ... })
            → background.js reçoit le message (se réveille si dormant)
            → background.js fait le fetch()
            → background.js renvoie la réponse au content script
```

---

### Fichier 1 : `background.js` — Le proxy API

Remplacer entièrement le contenu par :

```javascript
// StraightToYourAI Background Service Worker
// Proxies API calls for the content script (avoids context invalidation)

const DEFAULT_BASE_URL = 'http://localhost:3000';

console.log('[STYA] Background service worker loaded');

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[STYA] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[STYA] Extension updated to version', chrome.runtime.getManifest().version);
    // Ne PAS vider le cache : on garde styaUserCode, styaBackendUrl, styaLastLLM
  }
});

// Get base URL from storage (cached in memory for perf)
let cachedBaseUrl = null;

async function getBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl;
  try {
    const data = await chrome.storage.local.get(['styaBackendUrl']);
    cachedBaseUrl = data.styaBackendUrl || DEFAULT_BASE_URL;
  } catch {
    cachedBaseUrl = DEFAULT_BASE_URL;
  }
  return cachedBaseUrl;
}

// Invalidate cached URL when storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.styaBackendUrl) {
    cachedBaseUrl = changes.styaBackendUrl.newValue || DEFAULT_BASE_URL;
  }
});

// ============================================
// Message handler — proxy API calls
// ============================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'apiFetch') {
    handleApiFetch(msg)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ _error: true, message: error.message }));
    return true; // Keep channel open for async response
  }

  // Existing: getVideoInfo from content script
  // (pas touché, c'est pour le popup)
});

async function handleApiFetch(msg) {
  const baseUrl = await getBaseUrl();
  const url = baseUrl + msg.endpoint;

  const options = {
    method: msg.method || 'GET',
    headers: msg.headers || {},
  };

  // credentials: 'include' pour envoyer les cookies httpOnly
  options.credentials = 'include';

  if (msg.body) {
    options.body = JSON.stringify(msg.body);
    if (!options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, options);

  // Pour les réponses non-JSON (texte brut, etc.)
  if (msg.responseType === 'text') {
    const text = await response.text();
    return { _ok: response.ok, _status: response.status, data: text };
  }

  const data = await response.json();
  return { _ok: response.ok, _status: response.status, ...data };
}
```

---

### Fichier 2 : `content.js` — Réécriture de la classe X10API

Remplacer la classe `X10API` (lignes 55-178) par :

```javascript
// ============================================
// API Client (via background script proxy)
// ============================================

class X10API {
  constructor() {
    this.baseUrl = DEFAULT_BASE_URL;
    this.userCode = null;
  }

  // Envoie un fetch au background script qui le proxy
  async _fetch(endpoint, options = {}) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'apiFetch',
        endpoint,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || null,
        responseType: options.responseType || 'json',
      });

      if (!response) {
        throw new Error('No response from background script');
      }
      if (response._error) {
        throw new Error(response.message);
      }
      return response;
    } catch (error) {
      // chrome.runtime.sendMessage échoue si l'extension est déchargée
      // (rare, mais possible — ex: l'extension est désinstallée pendant l'utilisation)
      console.error('[STYA] _fetch error:', error.message);
      throw error;
    }
  }

  async init() {
    // 1. Déjà initialisé en mémoire → OK
    if (this.userCode) return true;

    // 2. Essayer le cache chrome.storage
    try {
      const cached = await chrome.storage.local.get(['styaUserCode', 'styaBackendUrl']);
      if (cached.styaBackendUrl) this.baseUrl = cached.styaBackendUrl;
      if (cached.styaUserCode) {
        this.userCode = cached.styaUserCode;
        console.log('[STYA] Init from cache:', this.userCode);
        // Sync en arrière-plan (ne bloque pas)
        this.syncFromServer().catch(() => {});
        return true;
      }
    } catch (e) {
      console.log('[STYA] Cache read failed:', e.message);
    }

    // 3. Pas de cache → sync obligatoire
    return this.syncFromServer();
  }

  async syncFromServer() {
    try {
      console.log('[STYA] Syncing from server...');
      const data = await this._fetch('/api/whoami');

      if (!data._ok) {
        throw new Error(`HTTP ${data._status}`);
      }

      if (data.userCode) {
        this.userCode = data.userCode;
        try {
          await chrome.storage.local.set({ styaUserCode: data.userCode });
        } catch (e) {
          console.log('[STYA] Could not cache userCode:', e.message);
        }
      }
      console.log('[STYA] Synced, userCode:', this.userCode);
      return true;
    } catch (error) {
      console.error('[STYA] syncFromServer failed:', error.message);
      return false;
    }
  }

  async getMyX10s() {
    if (!this.userCode) return { x10s: [] };
    try {
      const data = await this._fetch(`/api/x10s/by-code/${this.userCode}`);
      if (!data._ok) throw new Error(`HTTP ${data._status}`);
      return data;
    } catch (error) {
      console.error('[STYA] getMyX10s error:', error);
      return { x10s: [] };
    }
  }

  async createX10(videoUrl, forceNew = false) {
    try {
      const data = await this._fetch('/api/x10/add', {
        method: 'POST',
        body: { url: videoUrl, userCode: this.userCode || undefined, forceNew },
      });

      if (data.success && data.userCode) {
        this.userCode = data.userCode;
        try {
          await chrome.storage.local.set({ styaUserCode: data.userCode });
        } catch {}
      }
      return data;
    } catch (error) {
      console.error('[STYA] createX10 error:', error);
      return { success: false, error: error.message };
    }
  }

  async addVideoToX10(x10Id, videoUrl) {
    try {
      const data = await this._fetch(`/api/x10/${x10Id}/add`, {
        method: 'POST',
        body: { url: videoUrl, userCode: this.userCode },
      });
      return data;
    } catch (error) {
      console.error('[STYA] addVideoToX10 error:', error);
      return { success: false, error: error.message };
    }
  }

  async checkVideoInX10s(youtubeId) {
    if (!this.userCode) return { inX10s: [] };
    try {
      const data = await this._fetch(`/api/check-video?videoId=${youtubeId}&userCode=${this.userCode}`);
      if (!data._ok) throw new Error(`HTTP ${data._status}`);
      return data;
    } catch (error) {
      console.error('[STYA] checkVideoInX10s error:', error);
      return { inX10s: [] };
    }
  }

  getDashboardUrl() {
    return `${this.baseUrl}/collections`;
  }
}

const api = new X10API();
```

**Changements clés :**
- Plus de `fetch()` direct → tout passe par `_fetch()` → `chrome.runtime.sendMessage`
- Plus de `isExtensionContextValid()` dans la classe API (le message réveille le background)
- `init()` est **cache-first** : si `userCode` est en mémoire ou en cache, on l'utilise directement et on sync en arrière-plan
- Les `try/catch` autour de `chrome.storage` sont individuels (un échec de cache ne bloque pas le sync)

---

### Fichier 3 : `content.js` — Supprimer `isExtensionContextValid()` des appels API

La fonction `isExtensionContextValid()` reste utile pour les appels à `chrome.storage.local` en dehors de la classe API (ex: `styaLastLLM`, `styaTitleButtonsEnabled`). Mais elle ne doit plus bloquer l'init.

Modifier `loadX10sForDropdown` pour ajouter un retry :

```javascript
async function loadX10sForDropdown(videoId) {
  const listEl = document.getElementById('stya-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="x10-empty">Loading...</div>';

  try {
    let initOk = await api.init();
    if (!initOk) {
      // Retry une fois après 500ms (laisse le service worker se réveiller)
      await new Promise(r => setTimeout(r, 500));
      initOk = await api.init();
    }

    if (!initOk) {
      console.error('[STYA] Init failed after retry');
      listEl.innerHTML = `<div class="x10-empty">Could not connect to server<br><small style="color:#888">${api.baseUrl}</small></div>`;
      return;
    }

    const result = await api.getMyX10s();
    currentX10s = result.x10s || [];

    if (videoId) {
      const checkResult = await api.checkVideoInX10s(videoId);
      videoInX10s = checkResult.inX10s || [];
    }

    renderX10List(videoId);
  } catch (error) {
    console.error('[STYA] loadX10sForDropdown error:', error);
    listEl.innerHTML = `<div class="x10-empty">Error: ${error.message}</div>`;
  }
}
```

---

### Fichier 4 : `api.js` (popup) — Pas de changement

Le popup n'a pas le problème d'invalidation du runtime car il s'ouvre et se ferme à chaque clic. Son contexte est toujours frais. Il garde son `fetch()` direct.

---

### Fichier 5 : `background.js` — Ne plus vider le cache

Déjà inclus dans le nouveau `background.js` ci-dessus. L'`onInstalled` ne fait plus `chrome.storage.local.clear()`.

---

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `background.js` | Réécriture complète : ajout du handler `apiFetch`, suppression du `storage.clear()` |
| `content.js` | Réécriture de `X10API` : `_fetch` via `sendMessage`, `init()` cache-first, retry dans `loadX10sForDropdown` |
| `api.js` | Aucun changement (le popup garde le fetch direct) |
| `popup/popup.js` | Aucun changement |
| `popup/popup.html` | Aucun changement |
| `manifest.json` | Aucun changement (les permissions `storage` et `<all_urls>` existent déjà) |

---

### Vérification

1. **Démarrer le serveur** et ouvrir YouTube
2. **Cliquer sur un bouton STYA** → le dropdown charge les collections ✅
3. **Attendre 5 minutes** (le service worker dort)
4. **Cliquer à nouveau** → doit toujours fonctionner ✅ (le message réveille le SW)
5. **Recharger l'extension** → les boutons sur YouTube marchent encore ✅ (cache-first + pas de storage.clear)
6. **Tester le popup** → fonctionne comme avant ✅ (inchangé)
7. **Couper le serveur** → cliquer → doit afficher les collections du cache (userCode en mémoire) ou l'erreur proprement
