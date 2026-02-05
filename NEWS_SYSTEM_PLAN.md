# News System Implementation Plan

## Objectif

Système de news simple pour informer les utilisateurs des nouveautés de l'extension via :
1. Une bannière dans la popup de l'extension
2. Une page /news sur le site web

## Design de la bannière (d'après maquette)

```
┌─────────────────────────────────────────────────────────────┐
│  ●  v1.3 — Multi-tab support is here!    [ Read ]    ×     │
└─────────────────────────────────────────────────────────────┘
```

- **Position** : entre la section video-info et les quick-actions
- **Fond** : bleu foncé (#1e3a5f ou similaire)
- **Point** : indicateur bleu clair (#4a90d9)
- **Texte** : blanc (#ffffff)
- **Bouton "Read"** : corail/rouge (#e85d4c)
- **Bouton "×"** : blanc/gris clair

## Architecture

### Fichiers côté serveur

```
server/
├── public/
│   └── news.json          # Métadonnées de la dernière news
└── src/
    ├── views/
    │   └── news.pug       # Page de toutes les news
    └── routes/
        └── index.ts       # Route GET /news
```

### Fichier markdown des news (racine du projet)

```
NEWS.md
```

### Structure de NEWS.md

```markdown
# v1.3 — Multi-tab support is here!

2024-02-05

You can now use StraightToYourAI across multiple tabs...

# v1.2 — New collections UI

2024-01-15

We've redesigned the collections interface...
```

Chaque `# Titre` délimite une news. La première ligne après le titre est la date.

### Structure de news.json

```json
{
  "id": "v1.3",
  "title": "v1.3 — Multi-tab support is here!",
  "date": "2024-02-05",
  "url": "/news#v1.3"
}
```

Ce fichier est minimaliste. Il contient uniquement la **dernière news** à afficher.

## Flux de données

### Ouverture de la popup (zero latency)

1. Extension stocke `lastSeenNewsId` dans `chrome.storage.local`
2. Au build de la popup, on injecte `news.json` en dur dans le JS (via fetch au démarrage de l'extension, pas à chaque ouverture)
3. Comparaison instantanée : si `newsData.id !== lastSeenNewsId` → afficher bannière

**Stratégie de cache** :
- L'extension fetch `news.json` **une seule fois** au démarrage (service worker)
- Le résultat est stocké en mémoire et dans `chrome.storage.local`
- TTL de 24h avant re-fetch (ou manuel via refresh)

### Workflow

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  User opens      │     │  Compare IDs    │     │  Show banner     │
│  popup           │────►│  (sync, local)  │────►│  if different    │
└──────────────────┘     └─────────────────┘     └──────────────────┘
                                                          │
                         ┌─────────────────┐              │
                         │  User clicks    │◄─────────────┘
                         │  "Read" or "×"  │
                         └────────┬────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
          ┌─────────────────┐         ┌─────────────────┐
          │  Click "Read"   │         │  Click "×"      │
          │  → Open /news   │         │  → Dismiss only │
          │  → Mark as seen │         │  → Mark as seen │
          └─────────────────┘         └─────────────────┘
```

## Implémentation détaillée

### 1. Fichier `server/public/news.json`

Créé manuellement quand on veut pusher une news. Statique, servi directement.

### 2. Route `/news` (server/src/routes/index.ts)

```typescript
indexRouter.get('/news', (req: Request, res: Response) => {
  res.render('news', {
    title: `News - ${config.brandName}`
  });
});
```

### 3. Template `news.pug`

Lit et parse `NEWS.md`, affiche toutes les news avec ancres `#id`.

### 4. Extension - Service Worker (background.ts)

```typescript
// Au démarrage et toutes les 24h
async function fetchLatestNews() {
  try {
    const response = await fetch(`${API_BASE_URL}/news.json`);
    const news = await response.json();
    await chrome.storage.local.set({
      cachedNews: news,
      newsFetchedAt: Date.now()
    });
  } catch (e) {
    // Silently fail - news is non-critical
  }
}

// Initialisation
chrome.runtime.onInstalled.addListener(() => fetchLatestNews());
chrome.runtime.onStartup.addListener(() => fetchLatestNews());
```

### 5. Extension - Content Script (content.ts)

Dans `createOverlayElement()`, après `infoSection` :

```typescript
// News banner (inserted dynamically)
const newsBanner = `
  <div class="x10-news-banner" id="x10-news-banner" style="display:none;">
    <span class="x10-news-dot"></span>
    <span class="x10-news-text" id="x10-news-text"></span>
    <button class="x10-news-read" id="x10-news-read">Read</button>
    <button class="x10-news-close" id="x10-news-close">&times;</button>
  </div>
`;
```

### 6. CSS de la bannière

```css
.x10-news-banner {
  display: flex;
  align-items: center;
  background: #1e3a5f;
  padding: 10px 12px;
  margin: 0 -12px;   /* full width */
  gap: 8px;
}

.x10-news-dot {
  width: 8px;
  height: 8px;
  background: #4a90d9;
  border-radius: 50%;
  flex-shrink: 0;
}

.x10-news-text {
  flex: 1;
  color: #fff;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.x10-news-read {
  background: #e85d4c;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.x10-news-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.6);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}
```

### 7. Logique d'affichage (dans content.ts)

```typescript
async function checkAndShowNewsBanner() {
  const data = await chrome.storage.local.get(['cachedNews', 'lastSeenNewsId']);
  const news = data.cachedNews;

  if (!news || news.id === data.lastSeenNewsId) {
    return; // Pas de news ou déjà vue
  }

  const banner = document.getElementById('x10-news-banner');
  const text = document.getElementById('x10-news-text');
  if (banner && text) {
    text.textContent = news.title;
    banner.style.display = 'flex';
    banner.dataset.newsId = news.id;
    banner.dataset.newsUrl = news.url;
  }
}

// Event handlers
function setupNewsHandlers(overlay: HTMLElement) {
  overlay.querySelector('#x10-news-read')?.addEventListener('click', async () => {
    const banner = document.getElementById('x10-news-banner');
    const newsId = banner?.dataset.newsId;
    const newsUrl = banner?.dataset.newsUrl;

    if (newsId) {
      await chrome.storage.local.set({ lastSeenNewsId: newsId });
    }
    if (newsUrl) {
      window.open(`${api.baseUrl}${newsUrl}`, '_blank');
    }
    banner?.remove();
  });

  overlay.querySelector('#x10-news-close')?.addEventListener('click', async () => {
    const banner = document.getElementById('x10-news-banner');
    const newsId = banner?.dataset.newsId;

    if (newsId) {
      await chrome.storage.local.set({ lastSeenNewsId: newsId });
    }
    banner?.remove();
  });
}
```

## Workflow pour publier une news

1. Éditer `NEWS.md` en ajoutant une nouvelle section `# Titre` en haut
2. Éditer `server/public/news.json` avec le nouvel ID et titre
3. Commit & deploy

C'est tout. Pas besoin d'outil d'admin.

## Performance

- **Zéro impact sur l'ouverture de la popup** : les données sont déjà en cache local
- **Fetch asynchrone** : le service worker fetch en background, jamais bloquant
- **Fichier minimaliste** : `news.json` fait ~150 bytes

## Questions ouvertes

1. **Faut-il une option "Ne plus afficher les news" dans les settings ?**
   - Probablement non pour l'instant, le × suffit.

2. **Fréquence de refresh du cache ?**
   - 24h semble raisonnable. L'utilisateur aura la news au plus tard le lendemain.

## Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `NEWS.md` | Créer (racine) |
| `server/public/news.json` | Créer |
| `server/src/views/news.pug` | Créer |
| `server/src/routes/index.ts` | Ajouter route /news |
| `extension/src/content.ts` | Ajouter bannière + logique |
| `extension/src/background.ts` | Ajouter fetch news |
