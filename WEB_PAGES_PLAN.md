# X10Tube - Support des Pages Web (en plus de YouTube)

## Objectif

Étendre X10Tube pour accepter **n'importe quelle page web** en plus des vidéos YouTube, permettant de discuter avec son LLM favori à partir de n'importe quel ensemble de documents.

---

## Test de faisabilité : Jina Reader ✅

```javascript
fetch('https://r.jina.ai/https%3A%2F%2Flammily.com%2Fmagazine%2Fmale-body-ideals-through-time%2F')
```

**Résultat** : Status 200, Content-Type: text/plain, markdown propre avec titre et contenu.

---

## Analyse du Codebase Actuel

### 1. Base de données (`server/src/db.ts`)

**Table `videos` actuelle** :
```sql
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  x10_id TEXT NOT NULL,
  url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,  -- ⚠️ Spécifique YouTube
  title TEXT,
  channel TEXT,              -- ⚠️ Spécifique YouTube
  duration TEXT,             -- ⚠️ Spécifique YouTube
  transcript TEXT,
  added_at TEXT
);
```

**Problème** : La table est conçue uniquement pour les vidéos YouTube.

### 2. Service Transcript (`server/src/services/transcript.ts`)

- `extractVideoId()` - Extrait l'ID YouTube d'une URL
- `extractVideoInfo()` - Utilise l'API InnerTube de YouTube
- `fetchPlayerData()` - Récupère les métadonnées YouTube
- `fetchCaptions()` - Récupère les sous-titres YouTube

**Problème** : Tout est spécifique à YouTube.

### 3. Service X10 (`server/src/services/x10.ts`)

- `createX10()` - Appelle `extractVideoInfo()` pour chaque URL
- `addVideoToX10()` - Idem
- Toutes les fonctions attendent des `VideoInfo`

### 4. Routes (`server/src/routes/`)

- `/s/:id.md` - Génère le markdown avec des champs YouTube (channel, duration)
- `/s/:id` - Affiche la page avec thumbnails YouTube

### 5. Vues (`server/src/views/`)

- `x10.pug` - Affiche `video.channel`, `video.duration`, thumbnail YouTube
- `myx10s.pug` - Idem

### 6. Extension Chrome (`extension/`)

- `content.js` - Injecte des boutons sur YouTube uniquement
- `api.js` - Envoie des URLs YouTube au serveur
- `manifest.json` - Permissions limitées à YouTube

---

## Plan d'Implémentation

### Phase 1 : Refactoring de la Base de Données

**Renommer la table et généraliser les champs** :

```sql
-- Option A: Nouvelle table générique
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  x10_id TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'youtube' | 'webpage'
  source_id TEXT,               -- youtube_id pour videos, null pour pages
  title TEXT,
  source_name TEXT,             -- channel pour YouTube, domain pour pages
  metadata TEXT,                -- JSON: {duration, author, publishDate, ...}
  content TEXT,                 -- transcript ou contenu markdown
  added_at TEXT
);
```

**Migration** : Renommer `videos` → `items`, adapter les champs.

### Phase 2 : Service de Contenu Unifié

**Créer `server/src/services/content.ts`** :

```typescript
interface ContentInfo {
  url: string;
  type: 'youtube' | 'webpage';
  sourceId: string | null;      // youtube_id ou null
  title: string;
  sourceName: string;           // channel ou domain
  metadata: {
    duration?: string;          // YouTube only
    author?: string;            // Page web
    publishDate?: string;
    imageUrl?: string;
  };
  content: string;              // transcript ou markdown
}

// Détecte le type et extrait le contenu
async function extractContent(url: string): Promise<ContentInfo>

// Extraction YouTube (existant)
async function extractYouTubeContent(url: string): Promise<ContentInfo>

// Extraction page web via Jina
async function extractWebPageContent(url: string): Promise<ContentInfo>
```

**Logique de détection** :
```typescript
function detectUrlType(url: string): 'youtube' | 'webpage' {
  if (url.match(/youtube\.com|youtu\.be/)) return 'youtube';
  return 'webpage';
}
```

### Phase 3 : Intégration Jina Reader

**Fonction `extractWebPageContent()`** :

```typescript
async function extractWebPageContent(url: string): Promise<ContentInfo> {
  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  const response = await fetch(jinaUrl);

  if (!response.ok) {
    throw new Error(`Jina Reader error: ${response.status}`);
  }

  const markdown = await response.text();

  // Parser le markdown pour extraire titre, etc.
  const title = extractTitleFromMarkdown(markdown);
  const domain = new URL(url).hostname;

  return {
    url,
    type: 'webpage',
    sourceId: null,
    title,
    sourceName: domain,
    metadata: {},
    content: markdown
  };
}
```

### Phase 4 : Adapter les Vues

**`x10.pug` et `myx10s.pug`** :

```pug
//- Affichage conditionnel selon le type
if item.type === 'youtube'
  img(src=`https://img.youtube.com/vi/${item.source_id}/mqdefault.jpg`)
  p #{item.source_name} · #{item.metadata.duration}
else
  //- Icône générique ou favicon
  img.favicon(src=`https://www.google.com/s2/favicons?domain=${item.source_name}&sz=64`)
  p #{item.source_name}
```

**Markdown généré (`/s/:id.md`)** :

```markdown
## Items included

1. [YouTube] Video Title — Channel — 15:23
2. [Web] Article Title — example.com

---

## Content

### 1. Video Title
**Type**: YouTube Video
**Channel**: Channel Name
**Duration**: 15:23
...

### 2. Article Title
**Type**: Web Page
**Source**: example.com
...
```

### Phase 5 : Extension Chrome

**5.1 Mise à jour du `manifest.json`** :

```json
{
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://*/*"  // Toutes les pages
  ],
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content-youtube.js"]
    },
    {
      "matches": ["https://*/*"],
      "js": ["content-web.js"],
      "exclude_matches": ["https://www.youtube.com/*"]
    }
  ]
}
```

**5.2 Nouveau script `content-web.js`** :

- Bouton flottant X10Tube sur toutes les pages
- Même dropdown que sur YouTube
- Envoie l'URL courante au serveur

**5.3 Adapter `content-youtube.js`** (renommer depuis `content.js`) :

- Garde la logique actuelle pour les boutons sur les titres vidéo

### Phase 6 : API

**Adapter `/api/x10/add`** :

```typescript
// Accepte n'importe quelle URL
apiRouter.post('/x10/add', async (req, res) => {
  const { url, userCode, forceNew } = req.body;

  // Détection automatique du type
  const type = detectUrlType(url);

  // Extraction du contenu
  const content = await extractContent(url);

  // Ajout au X10
  // ...
});
```

---

## Ordre d'Exécution Recommandé

1. **Phase 2** : Service de contenu unifié (sans casser l'existant)
2. **Phase 3** : Intégration Jina Reader
3. **Phase 1** : Migration base de données
4. **Phase 4** : Adapter les vues
5. **Phase 6** : Adapter l'API
6. **Phase 5** : Extension Chrome (pages web)

---

## Décisions Prises

1. **Jina Reader** : Pas de rate limiting à gérer côté client. Par contre, il faut **interpréter correctement toutes les réponses de Jina**, y compris les erreurs (page bloquée, timeout, 404, contenu vide, etc.)

2. **Renommage** : On garde "X10Tube" pour l'instant. Le renommage éventuel sera fait plus tard.

3. **Pages longues** : On stocke le contenu tel quel, sans tronquer. Le LLM gère.

4. **Approche** : Pour l'instant on ne fait rien de spécial, on stocke juste le contenu markdown retourné par Jina.

---

## Questions Ouvertes (restantes)

1. **Favicon/Image** : Comment afficher une vignette pour les pages web ? (favicon, og:image, screenshot ?)

2. **Extension sur toutes les pages** : Risque de conflits avec d'autres extensions ? Performance ?

---

## Gestion des Réponses Jina

Jina peut retourner différents cas qu'il faut gérer :

| Cas | Réponse Jina | Action |
|-----|--------------|--------|
| Succès | 200 + markdown | Stocker le contenu |
| Page introuvable | 404 | Erreur "Page not found" |
| Page bloquée (robots.txt, paywall) | 200 + contenu vide/erreur | Erreur "Could not access page" |
| Timeout | Timeout/502 | Erreur "Page took too long to load" |
| URL invalide | 400 | Erreur "Invalid URL" |
| Contenu vide | 200 + markdown vide | Erreur "No content found" |

**À implémenter** : Parser la réponse Jina pour détecter si le contenu est valide ou s'il s'agit d'un message d'erreur déguisé.

---

## Estimation

| Phase | Complexité |
|-------|------------|
| Phase 1 (DB) | Moyenne - Migration délicate |
| Phase 2 (Service) | Moyenne |
| Phase 3 (Jina) | Facile |
| Phase 4 (Vues) | Moyenne |
| Phase 5 (Extension) | Complexe - Nouveau script |
| Phase 6 (API) | Facile |

**Total estimé** : Significatif, plusieurs heures de travail.

---

## Risques

1. **Jina Reader down** : Dépendance externe critique
2. **Contenu mal formaté** : Certaines pages peuvent donner du markdown cassé
3. **Performance** : Fetch Jina + parsing peut être lent
4. **CORS** : Potentiels problèmes avec certains sites

---

## Alternative à Jina

Si Jina pose problème, alternatives possibles :
- **Mozilla Readability** (local, mais moins puissant)
- **Puppeteer + Turndown** (plus lourd)
- **API Diffbot** (payant)
