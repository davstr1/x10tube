# Projet x10tube — Document complet

> **Nom de code** : x10tube  
> **Domaine** : x10tube.com  
> **Date** : Janvier 2026  
> **Statut** : Pré-développement

---

## 1. Concept

x10tube est un agrégateur de transcripts YouTube. L'utilisateur colle des URLs de vidéos, x10tube extrait les transcripts et les met en forme sur une page publique consultable par humains (HTML) et par LLM (Markdown).

**Pitch** : Summarize and discuss multiple YouTube videos in ChatGPT, Claude, or your favorite LLM.

**Tagline** : 10 videos. 10 minutes. Instead of 10 hours.

---

## 2. Problème résolu

- Regarder 10 vidéos sur un sujet = 10+ heures
- Les transcripts YouTube sont mal formatés et inaccessibles
- Impossible de "chatter" avec plusieurs vidéos à la fois

**x10tube permet** :
- Comprendre un sujet sans regarder les vidéos
- Interroger le contenu via son LLM préféré (Claude, ChatGPT)
- Garder une référence structurée et partageable

---

## 3. Positionnement

x10tube n'est **pas** :
- Un outil pour créateurs YouTube (≠ VidIQ, TubeBuddy)
- Un lecteur RSS (≠ Feedly)
- Un player alternatif (≠ NewPipe)
- Un gestionnaire d'abonnements (≠ PocketTube)

x10tube **est** :
- Un préprocesseur de contenu YouTube
- Un pont entre vidéos et LLM
- Une page de référence partageable

---

## 4. Philosophie produit

```
Créer un x10 = toujours possible sans compte
Modifier un x10 = requiert un compte + propriété
La page publique EST la page d'édition (actions adaptées selon les droits)
```

---

## 5. Analyse concurrentielle

### Outils existants

| Outil | Ce qu'il fait | Limite |
|-------|---------------|--------|
| **NoteGPT** | Résumé batch (jusqu'à 20 vidéos) | Chat dans leur app, pas de page partageable |
| **Glasp** | Extension Chrome, résumé | Une vidéo à la fois |
| **Skimming AI** | Chat avec plusieurs fichiers/vidéos | Leur propre chat intégré, pas de page publique |
| **YouTubeToTranscript** | Extraction transcript | Une vidéo, copier-coller manuel |
| **Tactiq** | Transcript YouTube | Une vidéo à la fois |

### Différenciation x10tube

| Feature | Concurrents | x10tube |
|---------|-------------|---------|
| Page publique partageable | ❌ | ✅ |
| Format .md pour LLM | ❌ | ✅ |
| BYOLLM (utilise ton Claude/GPT) | ❌ | ✅ |
| Collection éditable | ❌ | ✅ |
| Pas de chat intégré à payer | ❌ | ✅ |

**Positionnement** : x10tube ne vend pas un chat IA de plus. Il crée une page de référence que tu exploites avec ton LLM préféré.

---

## 6. Routes

| Route | Description |
|-------|-------------|
| `/` | Landing + champ pour coller URLs |
| `/login` | Auth (magic link ou OAuth Google) |
| `/dashboard` | Liste de mes x10s |
| `/s/:id` | Page x10 (publique + édition) |
| `/s/:id.md` | Vue Markdown pour LLM |

---

## 7. User Flows

### 7.1 Quand faut-il un compte ?

| Action | Compte requis ? |
|--------|-----------------|
| Créer un x10 (landing) | ❌ Non |
| Créer un x10 (extension) | ❌ Non |
| Consulter un x10 | ❌ Non |
| Utiliser le .md avec un LLM | ❌ Non |
| Ajouter à un x10 existant (extension) | ✅ Oui |
| Modifier un x10 (ajouter/supprimer vidéos) | ✅ Oui |
| Réclamer un x10 orphelin | ✅ Oui |
| Copier un x10 dans son compte | ✅ Oui |
| Supprimer un x10 | ✅ Oui |
| Voir son dashboard | ✅ Oui |

### 7.2 Flow landing (sans compte)

```
1. User arrive sur x10tube.com
2. Colle 1-10 URLs YouTube
3. Clic "Create my x10"
4. x10tube extrait les transcripts
5. Génère une page publique /s/abc123
6. User clique "Open in Claude" → ouvre Claude avec l'URL du .md
7. Pour modifier → doit se connecter
```

### 7.3 Système de copie (fork)

- Chaque x10 est public
- N'importe qui peut le voir
- Bouton "Copy to my account" → duplique le x10
- Chaque copie est indépendante

**Avantage** : partage viral ("regarde ce x10, copie-le et modifie-le")

### 7.4 Logique de réclamation d'un x10 orphelin

```
Si x10.user_id == null (orphelin)
ET user est connecté
ET user tente une action d'édition
→ x10.user_id = user.id (réclamation automatique)
→ user devient propriétaire
→ action d'édition s'exécute
```

Premier arrivé, premier servi. Une fois réclamé, le x10 n'est plus orphelin.

---

## 8. Extension Chrome

### 8.1 Deux points d'entrée

L'extension offre **deux façons** d'ajouter une vidéo :

1. **Bouton intégré à YouTube** (principal) — dropdown injecté dans l'interface vidéo
2. **Icône dans la barre Chrome** (fallback) — popover, toujours accessible

Le fallback est utile si :
- YouTube change son interface et casse l'injection
- L'utilisateur ne trouve pas le bouton intégré
- L'utilisateur préfère utiliser la barre d'extensions

Les deux affichent le **même contenu**, mais sous forme différente (dropdown vs popover).

### 8.2 Bouton intégré à YouTube (dropdown)

```
┌─────────────────────────────────────────────────────────────┐
│  ▶ Video title                                             │
│                                                             │
│  [👍 12K] [👎] [Share] [Download] [x10 ▾]                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Clic sur "x10 ▾" → dropdown :

```
┌─────────────────────────────────┐
│ Add to...                       │
├─────────────────────────────────┤
│ Startup Strategies              │
│ Learn Piano                     │
│ Crypto Explained                │
│ (Untitled)                      │
├─────────────────────────────────┤
│ + Create a new x10              │
├─────────────────────────────────┤
│ → My dashboard                  │
└─────────────────────────────────┘
```

### 8.3 Icône dans la barre Chrome (popover)

```
┌─────────────────────────────────────┐
│ x10tube                             │
├─────────────────────────────────────┤
│                                     │
│ How to Pitch Investors              │
│ Y Combinator · 15:23                │
│                                     │
├─────────────────────────────────────┤
│ Add to...                           │
│                                     │
│ Startup Strategies                  │
│ Learn Piano                         │
│ Crypto Explained                    │
│ (Untitled)                          │
│                                     │
├─────────────────────────────────────┤
│ + Create a new x10                  │
├─────────────────────────────────────┤
│ → My dashboard                      │
└─────────────────────────────────────┘
```

**Différence avec le dropdown** : la popover affiche aussi un aperçu de la vidéo courante en haut.

### 8.4 Popover — si pas sur une page vidéo YouTube

```
┌─────────────────────────────────────┐
│ x10tube                             │
├─────────────────────────────────────┤
│                                     │
│ No video detected                   │
│ Open a YouTube video                │
│                                     │
├─────────────────────────────────────┤
│ → My dashboard                      │
└─────────────────────────────────────┘
```

### 8.5 Ordre de la liste des x10

Les x10 sont triés par **dernière vidéo ajoutée** (le plus récemment modifié en haut).

### 8.6 Actions du dropdown/popover

| Action | Comportement |
|--------|--------------|
| Clic sur un x10 | Ajoute la vidéo → toast "Added to [name]" |
| + Create a new x10 | Crée un x10 avec cette vidéo → ouvre la page |
| → My dashboard | Ouvre x10tube.com/dashboard |

### 8.7 États

| État | Affichage |
|------|-----------|
| Non connecté | Liste vide, seulement "+ Create a new x10" et "→ Log in" |
| Connecté, 0 x10 | Seulement "+ Create a new x10" et "→ My dashboard" |
| Connecté, avec x10s | Liste complète |
| Vidéo déjà dans un x10 | Coche ✓ à côté du x10 concerné |

### 8.8 Flow utilisateur connecté

```
1. User navigue sur YouTube, trouve une vidéo intéressante
2. Clic sur le bouton "x10 ▾"
3. Dropdown s'ouvre avec ses x10 existants
4. Clic sur "Startup Strategies"
5. Toast : "Added to Startup Strategies ✓"
6. (optionnel) Clic sur le toast → ouvre le x10
```

### 8.9 Flow utilisateur non connecté

```
1. User navigue sur YouTube
2. Clic sur "x10 ▾"
3. Dropdown :
   ┌─────────────────────────────────┐
   │ + Create a new x10              │
   ├─────────────────────────────────┤
   │ → Log in                        │
   │   to add to your x10s           │
   └─────────────────────────────────┘
4. Clic "+ Create" → crée un x10 anonyme avec cette vidéo → ouvre la page
```

### 8.10 Scope technique extension

- Manifest V3
- Stockage : chrome.storage.local (pour le token d'auth)
- Content script pour injecter le bouton dans YouTube
- Popup pour la popover
- Appel API x10tube pour créer/modifier les x10

### 8.11 Priorité

v1.1 — Après le MVP web. Le site doit fonctionner d'abord.

---

## 9. Page x10 /s/:id

**Une seule page** qui s'adapte selon les droits de l'utilisateur.

### 9.1 Maquette

```
┌───────────────────────────────────────────────────────────┐
│  x10tube                                         log in   │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  Startup Strategies                                       │
│  6 videos · ~45K tokens · Jan 12, 2026                   │
│                                                           │
│  [ Open in Claude ]  [ Open in ChatGPT ]                 │
│  [ Copy .md link ]                                       │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  1. How to Pitch Investors                           [x] │
│     Y Combinator · 15:23                                 │
│     > Show transcript                                    │
│                                                           │
│  2. The Art of the Pivot                             [x] │
│     a16z · 22:45                                         │
│     > Show transcript                                    │
│                                                           │
│  3. How to Get Your First Customers                  [x] │
│     First Round Capital · 18:02                          │
│     > Show transcript                                    │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  Add a video                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Paste a YouTube URL...                              │ │
│  └─────────────────────────────────────────────────────┘ │
│  [ Add ]                                                 │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  [ Copy to my account ]                                  │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 9.2 Comportement des actions d'édition

| Action | Propriétaire | Non propriétaire | Non connecté |
|--------|--------------|------------------|--------------|
| Modifier titre | ✅ Direct | ❌ Caché | ❌ Caché |
| Supprimer vidéo [x] | ✅ Direct | ❌ Caché | 🔒 → Login |
| Ajouter vidéo | ✅ Direct | ❌ Caché | 🔒 → Login |
| Copy to my account | ❌ Caché | ✅ Visible | 🔒 → Login |

**Légende :**
- ✅ Direct = fonctionne immédiatement
- ❌ Caché = élément non affiché
- 🔒 → Login = clic redirige vers login puis retour

### 9.3 Cas "Non connecté qui veut modifier"

```
1. User non connecté voit les [x] sur chaque vidéo
2. Clic sur [x]
3. Modal : "Log in to edit this x10"
           [Log in]  [Cancel]
4. Login → retour sur la page
5. Comme le x10 est orphelin → l'utilisateur le "réclame" automatiquement
6. Il peut maintenant modifier
```

### 9.4 Cas "Connecté mais pas propriétaire"

```
1. User connecté consulte un x10 qui ne lui appartient pas
2. Les [x] et "Add" sont cachés
3. Seul "Copy to my account" est visible
4. Clic → fork → redirect vers sa copie
```

---

## 10. Dashboard /dashboard

### 10.1 Maquette

```
┌───────────────────────────────────────────────────────────┐
│  x10tube                                   + New   Account│
├───────────────────────────────────────────────────────────┤
│                                                           │
│  My x10s                                                  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Startup Strategies                         Jan 12   │ │
│  │ 6 videos · 45K tokens                               │ │
│  │                                                     │ │
│  │ Open · Claude · ChatGPT · Copy link · Delete        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Learn Piano                                Jan 10   │ │
│  │ 10 videos · 82K tokens                              │ │
│  │                                                     │ │
│  │ Open · Claude · ChatGPT · Copy link · Delete        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Untitled                                   Jan 8    │ │
│  │ 3 videos · 18K tokens                               │ │
│  │                                                     │ │
│  │ Open · Claude · ChatGPT · Copy link · Delete        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 10.2 Actions par x10

| Action | Comportement |
|--------|--------------|
| Open | Ouvre /s/:id (page x10) |
| Claude | Ouvre Claude avec prompt + URL .md |
| ChatGPT | Ouvre ChatGPT avec prompt + URL .md |
| Copy link | Copie l'URL publique |
| Delete | Confirmation → suppression définitive |

### 10.3 Dashboard vide

```
┌───────────────────────────────────────────────────────────┐
│  x10tube                                   + New   Account│
├───────────────────────────────────────────────────────────┤
│                                                           │
│                                                           │
│             You don't have any x10s yet                  │
│                                                           │
│               [ Create my first x10 ]                    │
│                                                           │
│                          or                               │
│                                                           │
│            Install the Chrome extension                  │
│         Add videos in one click from YouTube              │
│                                                           │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 10.4 Modal "+ New" depuis dashboard

```
┌─────────────────────────────────────────────────────────┐
│ Create a x10                                       [x]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Paste YouTube URLs (one per line)                      │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │                                                     │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [ Create ]                                             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Tip: install the Chrome extension to add videos        │
│ directly from YouTube                                  │
│ [Install extension]                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 11. Landing page

### 11.1 Maquette complète

```
┌─────────────────────────────────────────────────────────┐
│  x10tube                                       log in   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ https://youtube.com/watch?v=...                     ││
│  │ https://youtube.com/watch?v=...                     ││
│  │ (one URL per line, up to 10)                        ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  [ Create my x10 ]                                     │
│                                                         │
│  or install the Chrome extension                        │
│  Collect videos as you browse                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Summarize and discuss multiple YouTube videos         │
│  in ChatGPT, Claude, or your favorite LLM.             │
│                                                         │
│  10 videos. 10 minutes. Instead of 10 hours.           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Why x10tube?                                          │
│                                                         │
│  - No built-in chat to pay for                         │
│  - Your LLM already knows you                          │
│  - Shareable page with others                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  How it works                                          │
│                                                         │
│  1. Paste your URLs                                    │
│  2. We extract the transcripts                         │
│  3. Open the result in your LLM                        │
│  4. Ask your questions                                 │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Examples                                              │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ Shark Tank  │ │ Startup     │ │ Learn       │       │
│  │ Best Pitches│ │ Funding     │ │ Piano       │       │
│  │             │ │ Strategies  │ │             │       │
│  │ 8 videos    │ │ 6 videos    │ │ 10 videos   │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ Crypto      │ │ Weightlift- │ │ Portrait    │       │
│  │ Explained   │ │ ing Basics  │ │ Photography │       │
│  │             │ │             │ │             │       │
│  │ 5 videos    │ │ 7 videos    │ │ 4 videos    │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│  These x10s are public. Click, explore,                │
│  copy to your account.                                 │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  FAQ                                                   │
│                                                         │
│  Is it free?                                           │
│  Yes.                                                  │
│                                                         │
│  Does it work with Claude/ChatGPT?                     │
│  Yes, and with any LLM that can read a URL.            │
│                                                         │
│  How many videos max?                                  │
│  We suggest 10, but it's a soft limit. The real        │
│  limit depends on your LLM's capacity. Claude can      │
│  read ~100K tokens, roughly 10-15 average videos.      │
│  We show an estimate on each x10.                      │
│                                                         │
│  Is my data stored?                                    │
│  x10s are public. Log in to edit or delete.            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  x10tube                                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 12. Prompt généré pour LLM

```
Read https://x10tube.com/s/abc123.md 
which contains transcripts from multiple YouTube videos.
Then answer my questions about this content.
```

---

## 13. Structure du .md généré

```markdown
# [Title]

## Videos included

1. [Video title 1] — [Channel] — [Duration]
2. [Video title 2] — [Channel] — [Duration]
...

---

## Transcripts

### 1. [Video title 1]

**Channel**: [name]  
**Duration**: [duration]  
**URL**: [YouTube link]

[Full transcript]

---

### 2. [Video title 2]

**Channel**: [name]  
**Duration**: [duration]  
**URL**: [YouTube link]

[Full transcript]

---

*Generated by x10tube — [date]*
```

---

## 14. Schema DB

```
users
├── id
├── email
└── created_at

x10s
├── id (abc123)
├── user_id (nullable — peut être orphelin)
├── title (nullable)
├── created_at
└── updated_at

videos
├── id
├── x10_id
├── url
├── youtube_id
├── title
├── channel
├── duration
├── transcript (text)
└── added_at
```

---

## 15. Stack technique

| Composant | Choix |
|-----------|-------|
| Backend | Node.js + Hono |
| Language | TypeScript (strict) |
| Auth | Magic link (simple) ou OAuth Google |
| DB | SQLite (MVP) → Postgres (si besoin de scaler) |
| Hosting | Railway |
| Transcript extraction | YouTube timedtext API |
| Frontend | Pug + Tailwind CSS |
| Extension | Manifest V3, chrome.storage |

### Base de données

**SQLite pour le MVP** — simple, portable, zéro config.

```bash
npm i better-sqlite3
npm i -D @types/better-sqlite3
```

```typescript
// src/db.ts
import Database from 'better-sqlite3';

const db = new Database('x10tube.db');

// Init tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS x10s (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    x10_id TEXT NOT NULL,
    url TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    title TEXT,
    channel TEXT,
    duration TEXT,
    transcript TEXT,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (x10_id) REFERENCES x10s(id) ON DELETE CASCADE
  );
`);

export default db;
```

Le fichier `x10tube.db` est créé automatiquement. Ajouter au `.gitignore`.

**Migration vers Postgres** : si le projet scale, remplacer `better-sqlite3` par `pg` et adapter les requêtes (quasi identiques).

### Setup développement

**TypeScript + Nodemon** pour le hot reload avec recompilation automatique.

```json
// package.json
{
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

```json
// nodemon.json
{
  "watch": ["src"],
  "ext": "ts,pug",
  "ignore": ["dist"],
  "exec": "ts-node src/index.ts"
}
```

Ou avec `tsx` (plus rapide que ts-node) :

```json
// nodemon.json
{
  "watch": ["src"],
  "ext": "ts,pug",
  "ignore": ["dist"],
  "exec": "tsx src/index.ts"
}
```

**Dépendances prod** :
```bash
npm i hono better-sqlite3 pug
```

**Dépendances dev** :
```bash
npm i -D typescript nodemon tsx @types/node @types/better-sqlite3 tailwindcss
```

**tsconfig.json** :
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Cela garantit que chaque modification de fichier `.ts` déclenche une recompilation automatique, évitant les erreurs de fichiers non recompilés.

---

## 16. MVP — Scope exact

### Features MVP

| Feature | Statut |
|---------|--------|
| Créer un x10 sans login | ✅ MVP |
| Coller 1-10 URLs | ✅ MVP |
| Extraction transcripts | ✅ MVP |
| Page publique HTML | ✅ MVP |
| Page publique .md | ✅ MVP |
| Bouton "Open in Claude/GPT" | ✅ MVP |
| Bouton "Copy to my account" | ✅ MVP |
| Ajouter/supprimer vidéos (si login) | ✅ MVP |
| Compte optionnel | ✅ MVP |
| Extension Chrome | ❌ v1.1 |
| Résumé auto côté serveur | ❌ v2 |
| Alertes / notifications | ❌ v2 |
| Collaboration | ❌ v2 |

---

## 17. Modèle économique

### Phase 1 : Gratuit

- Lancement 100% gratuit
- Observer l'usage réel
- Identifier les features demandées

### Limites naturelles (anti-abus)

- Max 10 vidéos par x10
- Rate limit par IP (ex: 10 x10s/jour sans compte)

### Phase 2 : Freemium (si traction)

**Gratuit**
- x10s illimités en lecture
- 5 x10s éditables max

**Premium (~3-5€/mois)**
- x10s éditables illimités
- Vidéos illimitées par x10
- Résumés IA auto
- x10s privés (si demandé)

---

## 18. Coûts d'opération

| Poste | Coût estimé |
|-------|-------------|
| Extraction transcript | 0€ (API YouTube gratuite) |
| DB SQLite | 0€ (fichier local) |
| Railway (Hobby) | ~5€/mois |
| Domaine | ~10-15€/an |
| Résumé IA (si activé) | ~0.01-0.02€ par x10 |

**Coût quasi nul** tant qu'il n'y a pas de résumé côté serveur. SQLite est embarqué, pas de DB externe à payer.

---

## 19. Capacité LLM à lire le .md

| LLM | Limite fetch web |
|-----|------------------|
| Claude (web fetch) | ~100K tokens |
| ChatGPT browsing | Variable, moins fiable |

**Calcul** :
- 10 vidéos × 15K tokens = 150K tokens max
- Cas moyen : 5 vidéos × 10K = 50K tokens → ✅ OK

Pour les gros x10s, afficher un warning si > 100K tokens estimés.

---

## 20. Complexité

**C'est un projet simple** :

| Composant | Complexité | Raison |
|-----------|------------|--------|
| Backend | Faible | Node + Hono, minimaliste |
| Auth | Faible | Optionnel, magic link simple |
| DB | Faible | 3 tables, CRUD basique |
| Chat IA | Nulle | Délégué au LLM de l'utilisateur |
| Paiement | Nul | Gratuit au lancement |
| Infra | Faible | Railway, tout intégré |

**Estimation** : MVP shippable en 1-2 semaines.

---

## 21. Prochaines étapes

1. [ ] Acheter x10tube.com
2. [ ] Setup projet Node + Hono sur Railway
3. [ ] Implémenter extraction transcript
4. [ ] Créer les pages /s/:id et /s/:id.md
5. [ ] Landing page
6. [ ] Auth magic link (optionnel)
7. [ ] Lancer et observer
8. [ ] Extension Chrome (v1.1)

---

# Direction artistique

## Style retenu : Indie web friendly

**Références** : Bear Blog, Buttondown, Plausible, Feedbin, Pinboard

---

## Principes

```
1. Simple et direct
2. Fonctionnel avant tout
3. Pas d'emoji, pas d'icônes décoratives
4. Une seule couleur d'accent
5. Typo système (rapide, familière)
6. Espacement généreux
7. Pas d'animations inutiles
8. Light mode uniquement (pour l'instant)
```

---

## Ce qu'on évite

- Gradients
- Glassmorphism / blur
- Icônes partout
- Emoji
- Animations
- Dark mode (v1)
- Illustrations
- "Powered by AI", "Revolutionary", etc.
- Témoignages
- Photos stock

---

## Stack front

- **Tailwind CSS** — utility classes
- **Pug** — templating

Note: In Pug, use `_` instead of `:` for Tailwind modifiers (e.g. `hover_bg-red-700`). See config below.

---

## Palette (Tailwind)

```
Background:       white / bg-white
Background subtle: gray-50 / bg-gray-50
Text:             gray-800 / text-gray-800
Text muted:       gray-500 / text-gray-500
Border:           gray-200 / border-gray-200
Accent:           red-600 / text-red-600, bg-red-600 (YouTube red)
Accent hover:     red-700 / hover_bg-red-700
Border radius:    rounded-md (6px)
```

Full tailwind.config.js:

```js
// tailwind.config.js
module.exports = {
  separator: '_',
  theme: {
    extend: {
      colors: {
        'youtube': '#FF0000',
        'youtube-dark': '#cc0000',
      }
    }
  }
}
```

Accent color: **YouTube red**. Used in logo. Blue for links (better affordance).

---

## Typography (Tailwind)

Body text:
```html
<body class="font-sans text-base text-gray-800 leading-relaxed">
```

Headings:
```html
<h1 class="text-2xl font-semibold text-gray-900">
<h2 class="text-xl font-semibold text-gray-900">
<h3 class="text-lg font-semibold text-gray-900">
```

Muted text:
```html
<p class="text-sm text-gray-500">
```

Monospace (URLs, tokens):
```html
<code class="font-mono text-sm">
```

No Google Fonts. System fonts = faster, more familiar.

---

## Buttons (Tailwind + Pug)

Primary button (HTML):
```html
<button class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm">
  Create my x10
</button>
```

Primary button (Pug):
```pug
button.bg-red-600.hover_bg-red-700.text-white.px-4.py-2.rounded-md.text-sm Create my x10
```

Secondary button (Pug):
```pug
button.bg-white.hover_bg-gray-50.text-gray-800.px-4.py-2.rounded-md.text-sm.border.border-gray-200 Copy link
```

Text link (Pug):
```pug
button.text-gray-600.hover_text-gray-900.text-sm.underline Delete
```

Simple buttons. No shadow, no glow.

---

## Links (Tailwind)

```html
<a href="#" class="text-blue-600 hover:text-blue-800 underline">
  Link text
</a>
```

Note: using blue for links (better affordance), red reserved for logo/branding.

Underline by default. Classic, clear.

---

## Inputs (Tailwind)

Text input:
```html
<input 
  type="text" 
  class="w-full px-3 py-2 border border-gray-200 rounded-md text-base focus:outline-none focus:border-gray-400"
  placeholder="Paste a YouTube URL..."
>
```

Textarea:
```html
<textarea 
  class="w-full px-3 py-2 border border-gray-200 rounded-md text-base focus:outline-none focus:border-gray-400 resize-none"
  rows="5"
  placeholder="https://youtube.com/watch?v=..."
></textarea>
```

---

## Layout (Tailwind + Pug)

Container (HTML):
```html
<main class="max-w-2xl mx-auto px-4 py-8">
  <!-- content -->
</main>
```

Container (Pug):
```pug
main.max-w-2xl.mx-auto.px-4.py-8
  //- content
```

Section spacing (Pug):
```pug
section.py-8.border-b.border-gray-200
  h2.text-xl.font-semibold.mb-4 Why x10tube?
  p.text-gray-600 No built-in chat to pay for.
```

Page structure example (Pug):
```pug
doctype html
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title x10tube
    link(href="/styles.css" rel="stylesheet")
  body.bg-white.text-gray-800
    header.max-w-2xl.mx-auto.px-4.py-4.flex.justify-between.items-center
      a.text-lg.font-semibold.no-underline(href="/")
        span.text-gray-800 x10
        span.text-red-600 tube
      a.text-sm.text-gray-600.hover_text-gray-900(href="/login") log in
    
    main.max-w-2xl.mx-auto.px-4.py-8
      block content
    
    footer.max-w-2xl.mx-auto.px-4.py-8.border-t.border-gray-200.text-sm.text-gray-500
      | x10tube
```

---

## Cards (Tailwind + Pug)

HTML:
```html
<div class="bg-white border border-gray-200 rounded-md p-4">
  <!-- card content -->
</div>
```

Pug:
```pug
.bg-white.border.border-gray-200.rounded-md.p-4
  h3.font-semibold Startup Strategies
  p.text-sm.text-gray-500 6 videos · 45K tokens
  .mt-3.text-sm.space-x-2
    a.text-blue-600.underline(href="#") Open
    span.text-gray-300 ·
    a.text-blue-600.underline(href="#") Claude
    span.text-gray-300 ·
    a.text-blue-600.underline(href="#") ChatGPT
```

No shadow. Just a thin border.

---

## Copywriting

**Language: English. Tone: direct, familiar, not marketing.**

| Avoid | Prefer |
|-------|--------|
| "Get started for free" | "Create my x10" |
| "Leverage AI to..." | "We extract transcripts" |
| "Join thousands of users" | (say nothing) |
| "Revolutionary" | (say nothing) |
| "Learn more" | "How it works" |

Like explaining to a friend.

---

## Logo (Tailwind + Pug)

HTML:
```html
<a href="/" class="text-lg font-semibold no-underline">
  <span class="text-gray-800">x10</span><span class="text-red-600">tube</span>
</a>
```

Pug:
```pug
a.text-lg.font-semibold.no-underline(href="/")
  span.text-gray-800 x10
  span.text-red-600 tube
```

Render: **x10**<span style="color:#FF0000">**tube**</span>

No symbol, no icon. The name is enough.

---

## Footer

Minimal for now. We'll see later.

```
─────────────────────────────────────────────────────────
x10tube
```

---

*Document généré le 21 janvier 2026*
