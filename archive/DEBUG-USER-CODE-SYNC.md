# Problème de synchronisation du User Code

## Symptôme
Trois valeurs différentes apparaissent :
- Extension storage : `eUC-sGfH20-AoU21`
- Cookie lu par extension : `ophUk2rxTAKyi0Nt`
- Dashboard affiché : `UFT87xtvsfkmwIgB`

## Architecture actuelle (problématique)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Site Web       │     │  Extension      │     │  Extension      │
│  (Express)      │     │  (Storage)      │     │  (Background)   │
│                 │     │                 │     │                 │
│  Cookie:        │     │  x10UserCode:   │     │  chrome.cookies │
│  x10_anon       │     │  (local)        │     │  .get/.set      │
│  httpOnly:true  │     │                 │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │   DÉSYNCHRONISÉ !     │    DÉSYNCHRONISÉ !    │
         └───────────────────────┴───────────────────────┘
```

## Sources d'écriture du userCode

### 1. Serveur Express (middleware/anonymous.ts)
- Crée un nouveau code si pas de cookie
- Set cookie `x10_anon` avec `httpOnly: true, sameSite: 'strict'`

### 2. Extension content-sync.js (sur pages x10tube)
- Lit `data-x10-user-code` du HTML
- Écrit dans `chrome.storage.local`
- **NE TOUCHE PAS au cookie**

### 3. Extension content.js (sur YouTube)
- Lit depuis storage ET cookie
- Si pas de cookie → écrit le storage dans le cookie
- Si cookie trouvé → écrit le cookie dans storage

### 4. API (quand création x10)
- Retourne un userCode
- Extension le stocke si elle n'en avait pas

## LE PROBLÈME FONDAMENTAL

**Trop de sources de vérité !**

1. Le serveur a son cookie
2. L'extension a son storage
3. L'extension lit/écrit les cookies via background script
4. content-sync.js écrit dans storage mais pas dans cookie

Quand l'utilisateur :
1. Va sur le dashboard → serveur crée cookie A, page affiche A, content-sync écrit A dans storage
2. Va sur YouTube → content.js lit storage (A), lit cookie via background...

**MAIS** le background lit le cookie et obtient une valeur différente !

## HYPOTHÈSE DU BUG

Le `chrome.cookies.get()` ne lit peut-être pas le même cookie que le navigateur envoie au serveur.

Différences possibles :
- **Domain** : `localhost` vs `.localhost` vs vide
- **Path** : `/` vs pas de path
- **Secure** : le serveur set `secure: false` en dev, mais l'extension ?

## SOLUTION PROPOSÉE

### Option A : UNE SEULE SOURCE DE VÉRITÉ = LE COOKIE

Supprimer complètement `chrome.storage.local` pour le userCode.

```
┌─────────────────┐
│  Cookie         │
│  x10_anon       │
│  (httpOnly)     │
└────────┬────────┘
         │
         ├──► Serveur lit via req.cookies
         │
         └──► Extension lit via chrome.cookies.get()
              (background script)
```

L'extension ne stocke RIEN localement. Elle demande TOUJOURS le cookie au background.

### Option B : SYNC UNIDIRECTIONNEL SERVEUR → EXTENSION

Le serveur est la seule source qui CRÉE des codes.
L'extension lit UNIQUEMENT depuis le serveur (via API, pas cookie).

```
┌─────────────────┐
│  Serveur        │
│  (cookie)       │
└────────┬────────┘
         │
         ▼ API /api/whoami
         │
┌────────┴────────┐
│  Extension      │
│  (cache local)  │
└─────────────────┘
```

Nouveau endpoint : `GET /api/whoami` → retourne le userCode du cookie actuel.

## IMPLÉMENTATION RECOMMANDÉE : Option B

### 1. Nouveau endpoint serveur

```typescript
// GET /api/whoami
apiRouter.get('/whoami', (req: Request, res: Response) => {
  res.json({ userCode: req.anonymousId });
});
```

### 2. Extension init simplifié

```javascript
async init() {
  // TOUJOURS demander au serveur
  const response = await fetch(`${this.baseUrl}/api/whoami`, {
    credentials: 'include' // Envoie les cookies !
  });
  const data = await response.json();
  this.userCode = data.userCode;

  // Cache local optionnel (mais le serveur fait foi)
  await chrome.storage.local.set({ x10UserCode: this.userCode });
}
```

### 3. Supprimer toute la logique de sync cookie

- Supprimer `syncFromCookie()`
- Supprimer `setCookieOnWebsite()`
- Supprimer `content-sync.js`
- Le cookie est géré UNIQUEMENT par le serveur

### 4. Avantage

- UNE seule source de vérité : le serveur
- Pas de désync possible
- `credentials: 'include'` envoie automatiquement le cookie httpOnly
- Le serveur répond avec le userCode correspondant à CE cookie

## ÉTAPES D'IMPLÉMENTATION

1. Créer endpoint `/api/whoami`
2. Modifier `api.js` et `content.js` pour utiliser cet endpoint
3. Supprimer `content-sync.js`
4. Supprimer la permission `cookies` du manifest (plus besoin)
5. Supprimer la logique cookie du background script
6. Tester

## IMPORTANT : `credentials: 'include'`

Pour que `fetch()` envoie les cookies cross-origin (YouTube → localhost), il faut :

1. `credentials: 'include'` dans le fetch
2. Le serveur doit avoir les bons headers CORS :
   - `Access-Control-Allow-Origin: <origin spécifique>` (pas `*`)
   - `Access-Control-Allow-Credentials: true`
