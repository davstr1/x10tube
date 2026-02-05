# Plan : Popup post-création sur la landing page

## Objectif

Après soumission du formulaire sur la landing, afficher un popup avec les mêmes actions que la page x10 (Open in..., Copy MD Link, Copy MD Content), **sans dupliquer le code**.

## Flux

```
Avant : POST /create → redirect /s/:id (changement de page)
Après : POST /create (AJAX) → popup overlay sur la même page
```

## Bouton du formulaire

```
Avant : "Extract & Combine"
Après : "Extract & Combine..."
```

Les `...` indiquent qu'un menu d'actions suit.

## Réutilisation du code : Pug Mixin

Les boutons d'action (Open in..., Copy...) sont dupliqués dans **3 fichiers** :
- `x10.pug` lignes 56-111 (boutons principaux de la collection)
- `x10.pug` lignes 159-189 (boutons par item)
- `myx10s.pug` lignes 74-109 (boutons dans la liste)

**Solution : extraire un mixin Pug** dans un fichier partagé.

### Nouveau fichier : `server/src/views/mixins/actionButtons.pug`

```pug
mixin actionButtons(encodedPrompt, mdUrl, x10Url, x10Id, size)
  //- "Open in..." dropdown
  .dropdown(class=size === 'compact' ? 'text-xs' : '')
    button(...)
      | Open in...
    .dropdown-menu
      .dropdown-menu-inner
        a(href=`https://claude.ai/new?q=${encodedPrompt}` ...) Claude
        a(href=`https://chat.openai.com/?q=${encodedPrompt}` ...) ChatGPT
        //- ... les 6 LLMs

  //- "Copy..." dropdown
  .dropdown(class=size === 'compact' ? 'text-xs' : '')
    button(...)
      | Copy...
    .dropdown-menu
      .dropdown-menu-inner
        button MD Link
        button.copy-md-content-btn(data-md-url=mdUrl) MD Content
        button Share URL
```

### Utilisation dans les vues

```pug
//- x10.pug (boutons principaux)
include mixins/actionButtons
+actionButtons(claudePrompt, mdUrl, x10Url, x10.id, 'normal')

//- x10.pug (boutons par item)
+actionButtons(itemPromptEncoded, itemMdUrl, null, x10.id, 'compact')

//- myx10s.pug (boutons dans la liste)
+actionButtons(encodedPrompt, mdUrl, x10Url, x10.id, 'compact')

//- landing.pug (popup post-création, injecté en JS)
```

## Popup post-création sur la landing

### HTML du popup (dans landing.pug)

```pug
//- Overlay caché par défaut
#creation-popup.hidden
  .overlay-backdrop
  .overlay-content
    .popup-header
      h3#popup-title (titre de la collection)
      span#popup-meta (X items · ~YK tokens)
      button.close ×
    .popup-actions
      //- Mêmes boutons que x10.pug, construits en JS avec les bonnes URLs
```

### JavaScript (dans landing.pug)

1. Intercepter le `submit` du formulaire
2. `fetch('/create', { method: 'POST', headers: { 'Accept': 'application/json' } })`
3. Recevoir `{ id, title, itemCount, tokenCount, mdUrl, failed }`
4. Construire les boutons d'action avec les données reçues
5. Afficher le popup

### Route `/create` (index.ts)

Modifier pour retourner du JSON quand `Accept: application/json` :

```typescript
// Si le client demande du JSON (AJAX depuis la landing)
if (req.headers.accept?.includes('application/json')) {
  return res.json({
    success: true,
    id: x10.id,
    title: x10.title,
    itemCount: x10.videos.length,
    tokenCount: x10.tokenCount,
    mdUrl: `${baseUrl}/s/${x10.id}.md`,
    url: `/s/${x10.id}`,
    failed
  });
}
// Sinon, redirect classique (compatibilité)
res.redirect(`/s/${x10.id}`);
```

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `server/src/views/mixins/actionButtons.pug` | **Nouveau** — mixin réutilisable |
| `server/src/views/x10.pug` | Remplacer les boutons inline par `+actionButtons(...)` |
| `server/src/views/myx10s.pug` | Remplacer les boutons inline par `+actionButtons(...)` |
| `server/src/views/landing.pug` | Popup overlay + JS d'interception du form |
| `server/src/routes/index.ts` | POST `/create` retourne JSON si `Accept: application/json` |

## Styles du dropdown

Les styles CSS `.dropdown` / `.dropdown-menu` sont actuellement dupliqués dans x10.pug et myx10s.pug. On les déplace dans le CSS global (`styles.css`) ou dans le mixin via un `block` pug.

## Vérification

1. Soumettre le formulaire → popup s'affiche (pas de redirect)
2. "Open in Claude" → ouvre Claude avec le prompt dans un nouvel onglet
3. "Copy MD Link" → copie l'URL .md dans le presse-papier
4. "Copy MD Content" → fetch le .md puis copie le contenu
5. "View collection" → navigue vers `/s/:id`
6. Fermer le popup (×) → reset le formulaire, prêt pour une nouvelle soumission
7. Les boutons de x10.pug et myx10s.pug fonctionnent toujours (pas de régression)
