# Stratégie de Gestion des Erreurs Jina Reader

## Le Problème

Jina Reader retourne **HTTP 200 même quand la page est inaccessible**. Le contenu retourné contient alors des lignes `Warning:` et du contenu inutile (page de CAPTCHA, page de login, page 404 du site).

### Exemple réel (instructions.md)

L'utilisateur a ajouté `https://claude.ai/chat/...` (page privée). Jina a retourné HTTP 200 avec:

```
Title: Just a moment...

Warning: Target URL returned error 403: Forbidden
Warning: This page maybe not yet fully loaded, consider explicitly specify a timeout.
Warning: This page maybe requiring CAPTCHA, please make sure you are authorized to access this page.

Markdown Content:
Verifying you are human. This may take a few seconds.
```

**Résultat:** X10Tube a accepté ce contenu comme valide et l'a stocké.

## Code Actuel (content.ts)

```typescript
// Seuls checks actuels:
if (!response.ok) { ... }                          // ← Jina retourne 200!
if (!markdown || markdown.trim().length === 0) { }  // ← Le contenu n'est pas vide
if (markdown.includes('Error:') && markdown.length < 500) { } // ← C'est "Warning:", pas "Error:"
```

**Aucun de ces checks ne détecte le problème.**

---

## Comportement de Jina Reader par Scénario

| Scénario | HTTP Status | Warning dans le body | Contenu utile? |
|----------|-------------|---------------------|----------------|
| Page publique normale | 200 | Aucun | Oui |
| Page 403/Forbidden | **200** | `Target URL returned error 403: Forbidden` | Non |
| Page 404 | **200** | `Target URL returned error 404: Not Found` | Non |
| Page CAPTCHA/Cloudflare | **200** | `This page maybe requiring CAPTCHA` | Non |
| Page pas chargée | **200** | `This page maybe not yet fully loaded` | Partiel |
| Cache utilisé | 200 | `This is a cached snapshot` | Oui (probablement) |
| Domaine invalide | 400 | - | Non |
| Erreur réseau | 422 | - | Non |
| Domaine bloqué par Jina | 451 | - | Non |

**Conclusion:** Les erreurs HTTP (400, 422, 451) sont déjà gérées. Le problème ce sont les **HTTP 200 avec Warnings**.

---

## Stratégie Proposée

### 1. Passer en mode JSON

Actuellement on utilise `Accept: text/plain`. En passant à `Accept: application/json`, on obtient une réponse structurée:

```json
{
  "code": 200,
  "status": 20000,
  "data": {
    "title": "Just a moment...",
    "content": "...",
    "warning": "Target URL returned error 403: Forbidden\nThis page maybe requiring CAPTCHA...",
    "usage": { "tokens": 29 }
  }
}
```

**Avantage:** Le champ `warning` est isolé et facilement analysable. Pas besoin de parser du texte brut.

### 2. Classifier les Warnings

Trois catégories:

#### Bloquants (= erreur, on refuse le contenu)
- `Target URL returned error 403` → Page interdite
- `Target URL returned error 404` → Page inexistante
- `Target URL returned error 5xx` → Erreur serveur
- `This page maybe requiring CAPTCHA` → Page bloquée par anti-bot

#### Informatifs (= on accepte mais on prévient)
- `This is a cached snapshot` → Contenu potentiellement pas à jour
- `This page maybe not yet fully loaded` → Contenu partiel possible

#### Ignorés
- Tout autre warning non reconnu → On accepte le contenu

### 3. Vérification du Contenu

Même sans warning, vérifier que le contenu est substantiel:

- **Titre suspect:** Si le titre est générique (`"Just a moment..."`, `"Access Denied"`, `"Attention Required"`, `"Please verify"`) → probablement une page anti-bot
- **Contenu trop court:** Si le markdown fait moins de ~200 caractères → probablement pas du vrai contenu
- **Ratio contenu/warnings:** Si le contenu est plus court que les warnings → suspect

### 4. Token count comme indicateur

La réponse JSON inclut `usage.tokens`. Un nombre très bas (< 50 tokens) pour une page web est suspect.

---

## Implémentation Proposée

### Modification de `content.ts`

```typescript
interface JinaResponse {
  code: number;
  status: number;
  data: {
    title: string;
    url: string;
    content: string;
    warning?: string;
    usage?: { tokens: number };
  } | null;
  name?: string;
  message?: string;
  readableMessage?: string;
}

// Warnings qui indiquent un contenu inutilisable
const BLOCKING_WARNINGS = [
  /Target URL returned error [45]\d\d/i,
  /requiring CAPTCHA/i,
];

// Titres qui indiquent une page de blocage/erreur
const SUSPECT_TITLES = [
  'just a moment',
  'access denied',
  'attention required',
  'please verify',
  'verify you are human',
  'page not found',
  '403 forbidden',
  '404 not found',
  'error',
  'blocked',
];

async function extractWebPageContent(url: string): Promise<ContentInfo> {
  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;

  const response = await fetch(jinaUrl, {
    headers: {
      'Accept': 'application/json',
    }
  });

  // HTTP errors (400, 422, 451)
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const message = errorData?.readableMessage || errorData?.message;

    if (response.status === 400) {
      throw new Error(message || 'Invalid URL');
    } else if (response.status === 451) {
      throw new Error(message || 'This site is blocked');
    } else if (response.status === 422) {
      throw new Error(message || 'Could not load page');
    } else {
      throw new Error(message || `Could not access page (${response.status})`);
    }
  }

  // Parse JSON response
  const json: JinaResponse = await response.json();

  if (!json.data || !json.data.content) {
    throw new Error('No content found on this page');
  }

  // Check for blocking warnings
  if (json.data.warning) {
    for (const pattern of BLOCKING_WARNINGS) {
      if (pattern.test(json.data.warning)) {
        throw new Error(`Page inaccessible: ${json.data.warning.split('\n')[0]}`);
      }
    }
  }

  // Check for suspect titles
  const titleLower = (json.data.title || '').toLowerCase();
  if (SUSPECT_TITLES.some(s => titleLower.includes(s))) {
    // Double-check: si le contenu est aussi très court, c'est une page de blocage
    if ((json.data.usage?.tokens || 0) < 100) {
      throw new Error(`Page bloquée ou inaccessible: "${json.data.title}"`);
    }
  }

  // Check for very short content
  if (json.data.content.trim().length < 100) {
    throw new Error('Page content too short - may be blocked or empty');
  }

  return {
    url,
    type: 'webpage',
    sourceId: null,
    title: json.data.title || new URL(url).pathname.split('/').pop() || 'Untitled',
    sourceName: new URL(url).hostname.replace(/^www\./, ''),
    metadata: {},
    content: json.data.content
  };
}
```

---

## Résumé des Changements

| Aspect | Avant | Après |
|--------|-------|-------|
| Format réponse | `text/plain` | `application/json` |
| Détection erreurs | Check `Error:` dans le texte | Check champ `warning` structuré |
| Pages 403/404 | Acceptées silencieusement | Rejetées avec message clair |
| Pages CAPTCHA | Acceptées silencieusement | Rejetées avec message clair |
| Titres suspects | Non vérifiés | Vérifiés + cross-check token count |
| Contenu trop court | Non vérifié | Rejeté si < 100 chars |
| Messages d'erreur HTTP | Génériques | Extraits de `readableMessage` |

---

## Ce qu'on ne peut PAS détecter

- **Pages de login:** Jina retourne le contenu de la page de login comme s'il était valide. Pas de warning. Le contenu peut être substantiel. La seule heuristique serait de chercher des mots-clés ("sign in", "log in") mais c'est fragile.
- **Pages partiellement chargées:** Si la page utilise beaucoup de JS côté client, Jina peut retourner un squelette HTML incomplet sans warning.

Ces cas sont difficiles à gérer automatiquement. On peut les documenter pour l'utilisateur mais pas les bloquer de façon fiable.
