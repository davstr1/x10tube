# One-Click LLM Feature

## Objectif

Ajouter des options dans l'extension pour aller **directement** d'une page web/vidéo vers un LLM, en un seul clic.

### Actions souhaitées

Dans le dropdown de l'extension (quand on clique sur un bouton +), ajouter :
- **Open in...** → Claude, ChatGPT, Gemini, Perplexity, Grok, Copilot
- **Copy MD Link** - Copie le lien vers le MD
- **Copy MD Content** - Copie le contenu markdown

### Comportement sous le capot

1. Créer automatiquement un nouveau x10 avec uniquement cet item (`forceNew: true`)
2. Récupérer l'URL MD : `${baseUrl}/s/${x10Id}.md`
3. Effectuer l'action demandée (ouvrir dans LLM ou copier)

**Résultat** : Opération en un clic pour dialoguer avec son LLM favori à partir de n'importe quel contenu.

---

## Analyse du code existant

### Extension - `content.js`

**Structure du dropdown actuel** (lignes 502-526):
```javascript
function createDropdown() {
  // Header avec logo + close button
  // Section "Add to..."
  // Liste des x10s existants
  // Footer avec "My x10s"
}
```

**`renderX10List()`** (lignes 617-644):
- Affiche "Create a new X10" en premier
- Puis liste les x10s existants

### API - `/api/x10/add`

**Endpoint existant** (lignes 255-329 de api.ts):
- Accepte `{ url, userCode, forceNew }`
- Si `forceNew: true` → crée un nouveau x10
- Retourne `{ success, x10Id, x10Url, userCode }`

**C'est parfait !** L'API retourne déjà `x10Id`, on peut construire l'URL MD.

### URLs des LLMs (depuis x10.pug)

```javascript
const mdUrl = `${baseUrl}/s/${x10Id}.md`;
const prompt = `Fetch ${mdUrl}\n\n${prePrompt}`;
const encodedPrompt = encodeURIComponent(prompt);

// URLs:
`https://claude.ai/new?q=${encodedPrompt}`
`https://chat.openai.com/?q=${encodedPrompt}`
`https://www.google.com/search?udm=50&aep=11&q=${encodedPrompt}` // Gemini
`https://www.perplexity.ai/search/?q=${encodedPrompt}`
`https://x.com/i/grok?text=${encodedPrompt}`
`https://copilot.microsoft.com/` // Pas de query param, juste ouvrir
```

---

## Plan d'implémentation

### Phase 1 : Restructurer le dropdown

**Nouveau layout du dropdown** :

```
┌─────────────────────────────┐
│ X10Tube                   × │
├─────────────────────────────┤
│ ▸ Open in...                │  ← Nouveau (submenu)
│   Copy MD Link              │  ← Nouveau
│   Copy MD Content           │  ← Nouveau
├─────────────────────────────┤
│ Add to...                   │  ← Section label
│ + Create a new X10          │
│   My recent x10 (3)         │
│   Another x10 (5)           │
├─────────────────────────────┤
│        My x10s              │
└─────────────────────────────┘
```

### Phase 2 : Ajouter les handlers

**Nouveau flow pour "Open in Claude" par exemple** :

```javascript
async function handleOpenInLLM(url, llmType) {
  // 1. Afficher loading
  showToast('Creating x10...', '');

  // 2. Créer le x10
  const result = await api.createX10(url, true); // forceNew = true

  if (!result.success) {
    showToast(`Error: ${result.error}`, 'error');
    return;
  }

  // 3. Construire l'URL MD
  const mdUrl = `${api.baseUrl}/s/${result.x10.x10Id}.md`;
  const prompt = `Fetch ${mdUrl}`;
  const encoded = encodeURIComponent(prompt);

  // 4. Ouvrir dans le LLM
  const llmUrls = {
    claude: `https://claude.ai/new?q=${encoded}`,
    chatgpt: `https://chat.openai.com/?q=${encoded}`,
    gemini: `https://www.google.com/search?udm=50&aep=11&q=${encoded}`,
    perplexity: `https://www.perplexity.ai/search/?q=${encoded}`,
    grok: `https://x.com/i/grok?text=${encoded}`,
    copilot: `https://copilot.microsoft.com/`
  };

  window.open(llmUrls[llmType], '_blank');
  closeDropdown();
  showToast('Opened in ' + llmType, 'success');
}
```

**Pour "Copy MD Link"** :

```javascript
async function handleCopyMDLink(url) {
  showToast('Creating x10...', '');

  const result = await api.createX10(url, true);
  if (!result.success) {
    showToast(`Error: ${result.error}`, 'error');
    return;
  }

  const mdUrl = `${api.baseUrl}/s/${result.x10.x10Id}.md`;
  await navigator.clipboard.writeText(mdUrl);

  closeDropdown();
  showToast('MD link copied!', 'success');
}
```

**Pour "Copy MD Content"** :

```javascript
async function handleCopyMDContent(url) {
  showToast('Creating x10...', '');

  const result = await api.createX10(url, true);
  if (!result.success) {
    showToast(`Error: ${result.error}`, 'error');
    return;
  }

  // Fetch le contenu MD
  const mdUrl = `${api.baseUrl}/s/${result.x10.x10Id}.md`;
  const response = await fetch(mdUrl);
  const mdContent = await response.text();

  await navigator.clipboard.writeText(mdContent);

  closeDropdown();
  showToast('MD content copied!', 'success');
}
```

### Phase 3 : Styles pour le submenu

Ajouter des styles CSS pour :
- Submenu "Open in..." qui s'ouvre au hover/click
- Items du submenu (Claude, ChatGPT, etc.)

### Phase 4 : Appliquer aussi à la popup

Répliquer les mêmes actions dans `popup/popup.js` pour que ça marche aussi quand on clique sur l'icône de l'extension.

---

## Fichiers à modifier

1. **`extension/content.js`**
   - `createDropdown()` - Ajouter les nouvelles options
   - `renderX10List()` - Restructurer le layout
   - Nouveaux handlers : `handleOpenInLLM()`, `handleCopyMDLink()`, `handleCopyMDContent()`
   - Nouveaux styles pour submenu

2. **`extension/popup/popup.html`**
   - Ajouter section "Quick actions" avec Open in.../Copy...

3. **`extension/popup/popup.js`**
   - Mêmes handlers que content.js

4. **`extension/api.js`**
   - Peut-être ajouter `getBaseUrl()` pour accéder à `baseUrl` depuis les handlers

---

## UX Considerations

1. **Feedback visuel** : Toast "Creating x10..." pendant la création
2. **Temps d'attente** : La création peut prendre quelques secondes (fetch Jina pour web pages)
3. **Erreurs** : Afficher clairement si ça échoue (page bloquée, timeout, etc.)

---

## Estimation

| Phase | Complexité |
|-------|------------|
| Phase 1 (Restructurer dropdown) | Moyenne |
| Phase 2 (Handlers) | Facile |
| Phase 3 (Styles submenu) | Facile |
| Phase 4 (Popup) | Facile (copier/coller) |

**Total** : ~1-2h de travail

---

## Questions résolues

1. **Faut-il créer un x10 "temporaire" ?**
   → Non, on crée un vrai x10. L'utilisateur peut le retrouver dans "My x10s".

2. **L'API retourne-t-elle l'ID ?**
   → Oui ! `result.x10.x10Id`

3. **Temps de création ?**
   → Variable (YouTube rapide, web pages plus lent). Feedback visuel nécessaire.
