# Migration de Domaine pour Extension Chrome

## Contexte

L'application est actuellement sur un sous-domaine (ex: `app.example.com`) et pourrait migrer vers un domaine dédié (ex: `straighttoyour.ai`). L'objectif est de permettre cette migration **sans que les utilisateurs aient à désactiver/réinstaller l'extension**.

---

## TL;DR - Verdict

| Aspect | Impact |
|--------|--------|
| **Prompt utilisateur** | Non - `externally_connectable` n'est PAS une "warning permission" |
| **Désactivation extension** | Non - pas de désactivation lors de la mise à jour |
| **Review Chrome Web Store** | Risque modéré - justification requise pour chaque domaine |
| **Sécurité** | **DANGER** - un domaine que tu ne possèdes pas peut envoyer des messages à ton extension |
| **Politique Google** | Contre les règles de "future-proof" les permissions |

**Recommandation finale** : Ajoute uniquement les domaines que tu **possèdes déjà** ou que tu es **certain** d'acquérir.

---

---

## Risques Identifiés

### 1. Risque de Sécurité (CRITIQUE)

Si tu ajoutes un domaine dans `externally_connectable` que tu **ne possèdes pas**, le propriétaire actuel de ce domaine peut :
- Envoyer des messages à ton extension via `chrome.runtime.sendMessage()`
- Potentiellement exploiter des failles dans ton code de gestion des messages

**Exemple dangereux :**
```json
"externally_connectable": {
  "matches": [
    "https://straighttoyour.ai/*"  // Tu ne possèdes pas encore ce domaine !
  ]
}
```
→ Quiconque possède `straighttoyour.ai` aujourd'hui peut communiquer avec ton extension.

### 2. Politique Chrome Web Store

> "Don't attempt to 'future proof' your Product by requesting a permission that might benefit services or features that have not yet been implemented."

**Plus de 60% des extensions sont rejetées** pour justification insuffisante des permissions. Si tu listes des domaines non utilisés, tu devras expliquer pourquoi.

### 3. Bonne nouvelle : Pas de prompt utilisateur

`externally_connectable` n'est **PAS** une "warning permission". Ajouter ou modifier cette clé :
- Ne désactive pas l'extension
- Ne déclenche pas de popup d'approbation utilisateur
- Ne nécessite pas de réinstallation

---

## Problématique

Une extension Chrome déclare ses permissions dans `manifest.json`. Ces permissions incluent :

1. **`host_permissions`** : URLs où l'extension peut faire des requêtes fetch, injecter des scripts, etc.
2. **`externally_connectable`** : URLs qui peuvent communiquer avec l'extension via `chrome.runtime.sendMessage()`
3. **`content_scripts.matches`** : URLs où les content scripts sont injectés

Si ces domaines changent, l'extension doit être mise à jour. Certains changements déclenchent une **désactivation automatique** de l'extension et demandent une nouvelle approbation de l'utilisateur.

---

## Stratégies de Migration

### Option 1 : Déclarer les deux domaines dès le départ (Recommandé)

La solution la plus simple : inclure **les deux domaines** (sous-domaine actuel + futur domaine) dans le manifest dès maintenant.

```json
{
  "host_permissions": [
    "https://app.example.com/*",
    "https://straighttoyour.ai/*"
  ],
  "externally_connectable": {
    "matches": [
      "https://app.example.com/*",
      "https://straighttoyour.ai/*"
    ]
  }
}
```

**Avantages :**
- Aucune action utilisateur lors de la migration
- L'extension fonctionne immédiatement sur le nouveau domaine
- Pas de mise à jour de l'extension nécessaire

**Inconvénients :**
- Le futur domaine doit être connu à l'avance
- Légère augmentation des permissions affichées à l'installation

---

### Option 2 : Utiliser `optional_host_permissions`

Déclarer le nouveau domaine comme permission optionnelle et la demander au runtime quand nécessaire.

```json
{
  "host_permissions": [
    "https://app.example.com/*"
  ],
  "optional_host_permissions": [
    "https://straighttoyour.ai/*",
    "https://*/*"
  ]
}
```

Puis dans le code :

```javascript
// Quand l'utilisateur visite le nouveau domaine
const granted = await chrome.permissions.request({
  origins: ['https://straighttoyour.ai/*']
});

if (granted) {
  console.log('Permission accordée pour le nouveau domaine');
}
```

**Avantages :**
- Permissions minimales à l'installation
- Flexibilité pour ajouter des domaines plus tard
- L'utilisateur comprend pourquoi la permission est demandée

**Inconvénients :**
- Nécessite une action utilisateur (clic pour approuver)
- Doit être déclenché depuis un "user gesture" (clic)
- Plus complexe à implémenter

**Note importante :** Ajouter des `optional_permissions` dans une mise à jour ne désactive **jamais** l'extension.

---

### Option 3 : Wildcard large `https://*/*`

Demander l'accès à tous les domaines HTTPS.

```json
{
  "optional_host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

**Avantages :**
- Flexibilité totale pour tout domaine futur
- Aucune mise à jour nécessaire

**Inconvénients :**
- Chrome affiche un avertissement effrayant ("Lire et modifier toutes vos données sur tous les sites")
- Mauvais pour la confiance utilisateur
- Peut être refusé par le Chrome Web Store

---

## Contraintes de `externally_connectable`

Cette clé a des **restrictions spécifiques** :

```json
{
  "externally_connectable": {
    "matches": [
      "https://*.example.com/*",     // OK - sous-domaines de example.com
      "https://straighttoyour.ai/*"  // OK - domaine spécifique
    ]
  }
}
```

**Patterns NON autorisés :**
- `<all_urls>` - interdit
- `https://*/*` - interdit
- `*://*.com/*` - interdit (TLD trop large)
- `https://*.appspot.com/*` - interdit (domaine partagé)

**Conséquence :** Pour `externally_connectable`, vous **devez** connaître les domaines à l'avance. Pas de wildcard universel possible.

---

## Comportement lors des mises à jour

### Ce qui NE désactive PAS l'extension :
- Ajouter des `optional_permissions` ou `optional_host_permissions`
- Ajouter/modifier `externally_connectable`
- Ajouter des permissions "sans message" (ex: `storage`, `contextMenus`)

### Ce qui PEUT désactiver l'extension :
- Ajouter des `host_permissions` non optionnelles qui génèrent un nouveau message de permission
- Ajouter des permissions sensibles (ex: `tabs`, `history`, `bookmarks`)

### Astuce : Permissions déjà accordées

Si une permission était présente dans la v1, retirée dans la v2, puis rajoutée dans la v3 :
- Les utilisateurs qui ont installé la v1 ne seront **pas** désactivés (permission déjà accordée)
- Les utilisateurs qui ont installé la v2 seront désactivés (nouvelle permission)

---

## Recommandation pour straighttoyour.ai

### Manifest recommandé

```json
{
  "manifest_version": 3,
  "name": "Straight To Your AI",

  "host_permissions": [
    "*://*.youtube.com/*"
  ],

  "optional_host_permissions": [
    "https://*/*"
  ],

  "externally_connectable": {
    "matches": [
      "http://localhost:*/*",
      "https://*.straighttoyour.ai/*",
      "https://straighttoyour.ai/*"
    ]
  },

  "content_scripts": [
    {
      "matches": ["*://*.youtube.com/*"],
      "js": ["config.js", "content.js"]
    }
  ]
}
```

### Pourquoi cette configuration ?

1. **`host_permissions`** : Seulement YouTube (nécessaire pour l'extraction)

2. **`optional_host_permissions`** : Wildcard pour flexibilité future (extraction de pages web)

3. **`externally_connectable`** :
   - `localhost` pour le développement
   - `*.straighttoyour.ai` pour couvrir tout sous-domaine (app.straighttoyour.ai, www.straighttoyour.ai, etc.)
   - `straighttoyour.ai` pour le domaine apex

4. **`content_scripts`** : Injection uniquement sur YouTube

### Si le domaine final n'est pas encore connu

**Option A : Acheter les domaines d'abord (Recommandé)**

Achète les domaines candidats (~10-15€/an chacun) avant de les ajouter au manifest. C'est le seul moyen sûr.

**Option B : Ajouter uniquement après acquisition**

Garde un manifest minimal et fais une mise à jour quand tu acquiers le nouveau domaine. Comme `externally_connectable` ne déclenche pas de prompt utilisateur, la transition sera transparente.

**Option C : Lister des domaines non possédés (RISQUÉ)**

```json
"externally_connectable": {
  "matches": [
    "http://localhost:*/*",
    "https://*.straighttoyour.ai/*",
    "https://straighttoyour.ai/*",
    "https://*.x10tube.com/*",
    "https://x10tube.com/*"
  ]
}
```

⚠️ **Risques** :
- Sécurité : le propriétaire actuel peut communiquer avec ton extension
- Review : Google peut demander une justification
- Rejet potentiel pour "future-proofing"

---

## Communication Extension <-> Serveur

### Depuis le serveur vers l'extension

Le serveur ne peut pas contacter directement l'extension. C'est toujours l'extension qui initie la communication.

### Depuis l'extension vers le serveur

L'extension stocke l'URL du serveur dans `chrome.storage` :

```javascript
// Au premier lancement ou via settings
chrome.storage.sync.set({ serverUrl: 'https://straighttoyour.ai' });

// Utilisation
const { serverUrl } = await chrome.storage.sync.get('serverUrl');
fetch(`${serverUrl}/api/...`);
```

### Migration de l'URL serveur

L'extension peut vérifier automatiquement si l'ancienne URL redirige :

```javascript
async function checkServerMigration() {
  const { serverUrl } = await chrome.storage.sync.get('serverUrl');

  try {
    const response = await fetch(`${serverUrl}/api/health`, { redirect: 'manual' });

    if (response.type === 'opaqueredirect' || response.status === 301 || response.status === 302) {
      // Le serveur a migré, mettre à jour l'URL
      const newUrl = response.headers.get('Location');
      if (newUrl) {
        const newOrigin = new URL(newUrl).origin;
        await chrome.storage.sync.set({ serverUrl: newOrigin });
        console.log('Server URL updated to:', newOrigin);
      }
    }
  } catch (e) {
    console.error('Health check failed:', e);
  }
}
```

---

## Checklist Migration

- [ ] Ajouter le nouveau domaine dans `externally_connectable.matches`
- [ ] Publier la mise à jour de l'extension
- [ ] Attendre que la majorité des utilisateurs aient la mise à jour (~1-2 semaines)
- [ ] Configurer les redirects 301 de l'ancien vers le nouveau domaine
- [ ] Activer le nouveau domaine
- [ ] Mettre à jour `DEFAULT_BASE_URL` dans l'extension (ou via config dynamique)
- [ ] Vérifier que l'ancien domaine continue de fonctionner pendant la transition

---

## Sources

### Documentation officielle
- [Declare permissions | Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [chrome.permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [externally_connectable | Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
- [Message passing | Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Stay secure | Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
- [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process)

### Discussions et retours d'expérience
- [Will adding externally_connectable cause the extension to become disabled?](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/7chdyMEoCPo) - Confirmation que ce n'est pas une "warning permission"
- [Optional Host Permissions in Manifest v3](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/EnUmtHWOI9o)
- [How my Chrome extension finally got approved again](https://polymorphiclabs.io/posts-output/2020-02-17-chrome-webstore-rejection/) - Retour d'expérience sur les rejets
- [Extension Permissions - Chromium](https://chromium.googlesource.com/chromium/src/+/main/extensions/docs/permissions.md)

### Sécurité
- [Chrome Extensions Security Threats: Risk Analysis](https://deepstrike.io/blog/chrome-extensions-security-threats-risk-analysis)
