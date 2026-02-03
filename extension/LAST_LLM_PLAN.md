# Plan : Bouton direct "Open in [dernier LLM]"

## Objectif

Ajouter un bouton d'action directe au-dessus du bouton "Open in..." déroulant, qui ouvre le dernier assistant utilisé. L'extension se souvient de la dernière préférence via `chrome.storage.local`.

---

## Schéma actuel

```
┌─────────────────────────────┐
│ Header (logo + close)       │
├─────────────────────────────┤
│ Vignette + Titre vidéo      │
├─────────────────────────────┤
│ ▸ Open in...                │  ← clic pour dérouler
│   ┌───────────────────────┐ │
│   │ Claude                │ │
│   │ ChatGPT               │ │
│   │ Gemini                │ │
│   │ Perplexity            │ │
│   │ Grok                  │ │
│   │ Copilot               │ │
│   └───────────────────────┘ │
│ 🔗 Copy MD Link             │
│ 📋 Copy MD Content          │
├─────────────────────────────┤
│ Add to...                   │
│ [collections]               │
├─────────────────────────────┤
│ My collections · Sync       │
└─────────────────────────────┘
```

## Nouveau schéma

```
┌─────────────────────────────┐
│ Header (logo + close)       │
├─────────────────────────────┤
│ Vignette + Titre vidéo      │
├─────────────────────────────┤
│   Open in ChatGPT           │  ← 1 clic direct (dernier LLM utilisé, pas de ▸)
│ ▸ Open in...                │  ← déroulant (tous les LLMs, ▸ = dépliable)
│   ┌───────────────────────┐ │
│   │ Claude                │ │
│   │ ChatGPT               │ │
│   │ Gemini                │ │
│   │ ...                   │ │
│   └───────────────────────┘ │
│ 🔗 Copy MD Link             │
│ 📋 Copy MD Content          │
├─────────────────────────────┤
│ Add to...                   │
│ [collections]               │
├─────────────────────────────┤
│ My collections · Sync       │
└─────────────────────────────┘
```

**Comportement :**
- Au premier lancement (pas de préférence), le bouton direct n'apparait pas
- Dès qu'un LLM est choisi via "Open in...", il est sauvegardé dans `chrome.storage.local`
- Aux prochaines ouvertures, le bouton direct "Open in [LLM]" apparait en haut
- Le déroulant "Open in..." reste toujours disponible en dessous
- Choisir un autre LLM dans le déroulant met à jour la préférence

---

## Stockage

Nouvelle clé : `styaLastLLM`

Valeurs possibles : `"claude"`, `"chatgpt"`, `"gemini"`, `"perplexity"`, `"grok"`, `"copilot"`

---

## Changements par fichier

### 1. `content.js` (dropdown YouTube)

**HTML du dropdown** (dans `createDropdown()`) :
- Ajouter un bouton `#x10-open-direct` avant le bouton `#x10-open-in`
- Initialement masqué (`display:none`)

**Au chargement du dropdown** (dans `showDropdownForVideo()` ou `createDropdown()`) :
- Lire `chrome.storage.local.get(['styaLastLLM'])`
- Si une valeur existe, afficher le bouton direct avec le nom du LLM
- Sinon, le laisser masqué

**Au clic sur un LLM dans le déroulant** :
- Sauvegarder `chrome.storage.local.set({ styaLastLLM: llmType })`
- Mettre à jour le texte du bouton direct

**Au clic sur le bouton direct** :
- Appeler `handleOpenInLLM(url, lastLLM)` directement

**CSS** :
- Style identique à `.x10-quick-item`
- Pas de `▸` devant le bouton direct (la flèche indique un dépliable, ce bouton est une action directe)

### 2. `popup/popup.html`

- Ajouter un bouton `#open-direct-btn` avant le bouton `#open-in-btn`
- Initialement masqué (classe `hidden`)

### 3. `popup/popup.js`

**A l'initialisation** :
- Lire `chrome.storage.local.get(['styaLastLLM'])`
- Si valeur, afficher le bouton direct avec le nom

**Au clic sur un LLM** :
- Sauvegarder la préférence
- Mettre à jour le bouton direct

**Au clic sur le bouton direct** :
- Appeler `handleOpenInLLM(url, lastLLM)`

### 4. `popup/popup.css`

- Style du bouton direct (identique à `.quick-action-btn`)

---

## Noms affichés

| Clé | Nom affiché |
|-----|-------------|
| claude | Claude |
| chatgpt | ChatGPT |
| gemini | Gemini |
| perplexity | Perplexity |
| grok | Grok |
| copilot | Copilot |

Map utilitaire : `LLM_NAMES = { claude: 'Claude', chatgpt: 'ChatGPT', ... }`

---

## Vérification

- Premier usage : pas de bouton direct, seulement le déroulant
- Clic sur "Claude" dans le déroulant : sauvegarde + bouton direct "Open in Claude" apparait
- Prochaine ouverture : bouton direct visible directement
- Clic sur "ChatGPT" dans le déroulant : mise à jour du bouton direct en "Open in ChatGPT"
- Fonctionne identiquement dans la popup et le dropdown YouTube
