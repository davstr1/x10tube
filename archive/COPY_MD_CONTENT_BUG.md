# Bug Report: Copy MD Content copie le contenu d'une vidéo antérieure

## Description du problème
Quand l'utilisateur clique sur "Copy MD Content", le contenu copié dans le presse-papier correspond à une vidéo précédemment traitée, pas à la vidéo actuelle.

---

## BUG PRINCIPAL IDENTIFIÉ

### Les boutons ne sont pas supprimés lors de la navigation SPA

**Localisation:** `content.js` - fonction `onUrlChange()` (ligne ~1181)

**Problème:** Lors de la navigation SPA sur YouTube, `onUrlChange()` supprime les marqueurs `data-x10-processed` mais **ne supprime PAS les boutons `.x10tube-title-btn` existants**.

**Code actuel:**
```javascript
function onUrlChange() {
  closeDropdown();
  videoInX10s = [];

  // Reset processed markers and re-inject
  document.querySelectorAll('[data-x10-processed]').forEach(el => {
    el.removeAttribute('data-x10-processed');
  });

  // Re-inject after a short delay
  setTimeout(injectTitleButtons, 500);
}
```

**Conséquence:** Dans `injectTitleButtons()`, la vérification empêche la création de nouveaux boutons:
```javascript
if (titleContainer && !titleContainer.querySelector('.x10tube-title-btn')) {
  const btn = createTitleButton(videoId);  // ← NE S'EXÉCUTE JAMAIS
}
```

**Résultat:** L'ancien bouton persiste avec son `videoId` capturé dans la closure:
```javascript
function createTitleButton(videoId) {
  btn.addEventListener('click', (e) => {
    showDropdownForVideo(videoId, btn);  // ← videoId de l'ANCIENNE vidéo!
  });
}
```

### Scénario de reproduction:
1. Aller sur vidéo A → bouton créé avec `videoId = "A"`
2. Naviguer vers vidéo B (clic sur suggestion, navigation SPA)
3. `onUrlChange()` s'exécute, supprime `data-x10-processed`
4. `injectTitleButtons()` trouve l'ancien bouton → skip
5. Cliquer sur le bouton "+" → `showDropdownForVideo("A", btn)` avec l'ANCIEN ID!
6. "Copy MD Content" utilise `videoId = "A"` au lieu de "B"

### Solution:

```javascript
function onUrlChange() {
  closeDropdown();
  videoInX10s = [];

  // AJOUT: Supprimer TOUS les boutons X10Tube existants
  document.querySelectorAll('.x10tube-title-btn').forEach(btn => btn.remove());

  // Reset processed markers
  document.querySelectorAll('[data-x10-processed]').forEach(el => {
    el.removeAttribute('data-x10-processed');
  });

  // Re-inject after a short delay
  setTimeout(injectTitleButtons, 500);
}
```

---

## Analyse du flux (détails supplémentaires)

### Flux dans content.js (dropdown YouTube)

```
1. User clique sur bouton "+" → showDropdownForVideo(videoId, btn)
2. dropdown.dataset.currentVideoId = videoId
3. User clique "Copy MD Content"
4. Handler récupère: const videoId = dropdown.dataset.currentVideoId
5. url = `https://www.youtube.com/watch?v=${videoId}`
6. handleCopyMDContent(url) appelé
7. api.createX10(url, true) → crée nouveau x10
8. fetch(`${api.baseUrl}/s/${result.x10Id}.md`)
9. Copie le contenu dans le presse-papier
```

### Flux dans popup.js (popup extension)

```
1. Popup s'ouvre → checkCurrentTab()
2. currentItem.url = tab.url (URL actuelle de l'onglet)
3. User clique "Copy MD Content"
4. handleCopyMDContent(currentItem.url) appelé
5. api.createX10(url, true) → crée nouveau x10
6. fetch(`${api.baseUrl}/s/${result.x10.x10Id}.md`)
7. Copie le contenu dans le presse-papier
```

## Causes potentielles identifiées

### 1. Différence de structure de réponse API (PROBABLE)

**Dans content.js API (X10API class):**
```javascript
async createX10(videoUrl, forceNew = false) {
  const data = await response.json();
  return data;  // Retourne directement { success, x10Id, x10Url, userCode }
}
```

Usage: `result.x10Id`

**Dans api.js (popup API - X10TubeAPI class):**
```javascript
async createX10(videoUrl, forceNew = false) {
  const data = await response.json();
  return { success: true, x10: data };  // Enveloppe dans { x10: ... }
}
```

Usage: `result.x10.x10Id`

**Problème:** Si on utilise `result.x10Id` dans popup.js, on obtient `undefined` car la structure est `result.x10.x10Id`.

Vérification du code popup.js ligne ~420:
```javascript
const mdUrl = `${api.baseUrl}/s/${result.x10.x10Id}.md`;
```
→ Correct pour popup.js

Vérification du code content.js ligne ~940:
```javascript
const mdUrl = `${api.baseUrl}/s/${result.x10Id}.md`;
```
→ Correct pour content.js

**Conclusion:** Les deux sont cohérents avec leur API respective. Ce n'est pas le bug.

### 2. Cache navigateur sur le fetch MD (POSSIBLE)

```javascript
const response = await fetch(mdUrl);
const mdContent = await response.text();
```

Le fetch n'a aucune directive de cache-busting. Si le navigateur a une politique de cache agressive, il pourrait retourner du contenu mis en cache.

**Solution proposée:**
```javascript
const response = await fetch(mdUrl, { cache: 'no-store' });
// ou
const response = await fetch(`${mdUrl}?t=${Date.now()}`);
```

### 3. dropdown.dataset.currentVideoId pas mis à jour (POSSIBLE)

Si l'utilisateur navigue sur YouTube (SPA) vers une autre vidéo, puis ouvre le dropdown sans cliquer sur un bouton "+" spécifique, `currentVideoId` pourrait être stale.

**Scénario:**
1. User sur vidéo A, ouvre dropdown → currentVideoId = "A"
2. User ferme dropdown
3. User navigue vers vidéo B (navigation SPA)
4. `onUrlChange()` ferme le dropdown mais NE RESET PAS `currentVideoId`
5. User rouvre dropdown d'une autre manière → currentVideoId encore = "A"

**Code actuel de onUrlChange:**
```javascript
function onUrlChange() {
  closeDropdown();
  videoInX10s = [];
  // Reset processed markers...
}
```

**Problème:** `dropdown.dataset.currentVideoId` n'est jamais réinitialisé!

**Solution proposée:**
```javascript
function onUrlChange() {
  closeDropdown();
  videoInX10s = [];

  // Reset dropdown video ID
  const dropdown = document.getElementById('x10tube-dropdown');
  if (dropdown) {
    delete dropdown.dataset.currentVideoId;
    delete dropdown.dataset.currentUrl;
  }

  // Reset processed markers...
}
```

### 4. dropdown.dataset.currentUrl jamais défini (BUG CONFIRMÉ)

Dans le code des quick actions:
```javascript
const videoId = dropdown.dataset.currentVideoId;
const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : dropdown.dataset.currentUrl;
```

**Problème:** `dropdown.dataset.currentUrl` n'est JAMAIS défini nulle part dans le code!

C'est utilisé comme fallback pour les pages non-YouTube, mais:
- content.js ne s'exécute QUE sur YouTube (voir manifest.json)
- Donc currentUrl ne sera jamais nécessaire dans content.js
- Mais c'est quand même un bug de design

### 5. Race condition si double-clic (FAIBLE PROBABILITÉ)

Si l'utilisateur double-clique rapidement, deux requêtes pourraient être envoyées et la deuxième pourrait finir avant la première.

**Solution:** Désactiver le bouton pendant le traitement (déjà fait avec `disableQuickActions()`).

## Bug le plus probable

### Hypothèse principale: Cache du navigateur

Le fetch vers `/s/{x10Id}.md` n'a pas de cache-busting.

Même si l'ID est différent, certains navigateurs pourraient avoir des comportements de cache étranges, surtout si:
- Les requêtes sont faites très rapidement l'une après l'autre
- Il y a un service worker qui intercepte les requêtes
- Une extension de cache est active

### Hypothèse secondaire: État stale du dropdown

Si l'utilisateur a ouvert le dropdown pour une vidéo, navigué vers une autre, puis cliqué sur "Copy MD Content" sans re-cliquer sur un bouton "+", le `currentVideoId` serait celui de l'ancienne vidéo.

## Solutions recommandées

### Fix 1: Ajouter cache-busting au fetch MD

```javascript
// Dans content.js handleCopyMDContent
const response = await fetch(mdUrl, {
  cache: 'no-store',
  headers: { 'Cache-Control': 'no-cache' }
});

// Dans popup.js handleCopyMDContent
const response = await fetch(mdUrl, {
  cache: 'no-store',
  headers: { 'Cache-Control': 'no-cache' }
});
```

### Fix 2: Reset currentVideoId sur navigation

```javascript
// Dans content.js onUrlChange
function onUrlChange() {
  const newUrl = location.href;
  if (newUrl === lastUrl) return;

  lastUrl = newUrl;
  closeDropdown();
  videoInX10s = [];

  // AJOUT: Reset le videoId du dropdown
  const dropdown = document.getElementById('x10tube-dropdown');
  if (dropdown) {
    dropdown.dataset.currentVideoId = '';
  }

  // Reset processed markers...
}
```

### Fix 3: Vérifier l'URL actuelle avant de copier

```javascript
// Dans content.js, avant d'utiliser currentVideoId
dropdown.querySelector('#x10-copy-content').addEventListener('click', () => {
  // Toujours récupérer l'ID de la vidéo actuelle depuis l'URL
  const urlParams = new URLSearchParams(window.location.search);
  const currentUrlVideoId = urlParams.get('v');

  const videoId = currentUrlVideoId || dropdown.dataset.currentVideoId;
  const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : window.location.href;
  handleCopyMDContent(url);
});
```

## Recommandation

Implémenter les trois fixes:
1. **Cache-busting** - Garantit qu'on récupère toujours le contenu frais
2. **Reset sur navigation** - Évite les états stale
3. **Vérification URL actuelle** - Double sécurité pour toujours utiliser la bonne vidéo

Le fix 3 est le plus robuste car il ne fait pas confiance à l'état du dropdown et récupère toujours l'ID depuis l'URL actuelle.
