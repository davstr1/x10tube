# X10Tube - Bouton à gauche des titres de vidéos

## Contexte du problème

L'intégration actuelle de X10Tube dans les menus contextuels (⋮) de YouTube est instable. Google modifie constamment son markup HTML, rendant impossible une intégration fiable. Les sélecteurs changent d'un rechargement à l'autre.

## Nouvelle approche

Placer un bouton rouge "+" **à gauche des titres de vidéos** sur toutes les pages YouTube. Cette approche est plus simple et potentiellement plus stable car les titres de vidéos sont un élément fondamental de l'interface.

---

## Analyse du HTML YouTube (Janvier 2026)

### 1. Page de Recherche (`/results?search_query=...`)

**Format : `ytd-video-renderer`**

```html
<ytd-video-renderer>
  <div class="text-wrapper">
    <div id="meta">
      <div id="title-wrapper">
        <h3 class="title-and-badge">
          <ytd-badge-supported-renderer hidden></ytd-badge-supported-renderer>
          <a id="video-title"
             class="yt-simple-endpoint"
             href="/watch?v=..."
             title="Titre de la vidéo">
            Titre de la vidéo
          </a>
        </h3>
      </div>
    </div>
  </div>
</ytd-video-renderer>
```

**Point d'injection** : Avant `<a id="video-title">` ou en premier enfant de `<h3 class="title-and-badge">`

**Sélecteur** : `ytd-video-renderer #title-wrapper h3.title-and-badge`

---

### 2. Page Vidéo - Sidebar (Format classique)

**Format : `ytd-video-renderer` dans `ytd-watch-next-secondary-results-renderer`**

Même structure que la page de recherche.

---

### 3. Page Vidéo - Sidebar (Nouveau format 2024+)

**Format : `yt-lockup-view-model`**

```html
<yt-lockup-view-model class="yt-lockup-view-model--wrapper">
  <div class="yt-lockup-view-model yt-lockup-view-model--horizontal content-id-VIDEOID">
    <a href="/watch?v=..." class="yt-lockup-view-model__content-image">
      <!-- Thumbnail -->
    </a>
    <yt-lockup-metadata-view-model class="yt-lockup-metadata-view-model">
      <a class="yt-lockup-metadata-view-model__title" href="/watch?v=...">
        <span class="yt-core-attributed-string">Titre de la vidéo</span>
      </a>
      <!-- Metadata (channel, views, etc.) -->
    </yt-lockup-metadata-view-model>
  </div>
</yt-lockup-view-model>
```

**Point d'injection** : Avant `<a class="yt-lockup-metadata-view-model__title">` ou en premier enfant de `yt-lockup-metadata-view-model`

**Sélecteur** : `yt-lockup-view-model .yt-lockup-metadata-view-model`

---

### 4. Homepage (Format nouveau)

La homepage utilise également le format `yt-lockup-view-model` avec `yt-lockup-metadata-view-model__title` pour les titres.

---

## Sélecteurs unifiés

| Contexte | Sélecteur du conteneur | Sélecteur du titre |
|----------|------------------------|-------------------|
| Format classique | `ytd-video-renderer #title-wrapper h3` | `a#video-title` |
| Format nouveau | `.yt-lockup-metadata-view-model` | `a.yt-lockup-metadata-view-model__title` |

---

## Plan d'implémentation

### Phase 1 : Nettoyage

1. **Supprimer** l'intégration actuelle dans les menus ⋮ (fonctions `setupYouTubeMenuIntegration`, `injectX10MenuItemIntoPopup`, etc.)
2. **Conserver** le dropdown X10Tube existant (sera réutilisé)
3. **Conserver** les mini-boutons sur les thumbnails (optionnels)

### Phase 2 : Injection des boutons sur les titres

1. **Créer** une fonction `injectTitleButtons()` qui :
   - Recherche tous les titres de vidéos (les 2 formats)
   - Injecte un bouton "+" rouge avant chaque titre
   - Marque les éléments traités pour éviter les doublons

2. **Structure du bouton** :
   ```html
   <button class="x10tube-title-btn" data-video-id="VIDEOID">+</button>
   ```

3. **Styles CSS** :
   ```css
   .x10tube-title-btn {
     display: inline-flex;
     align-items: center;
     justify-content: center;
     width: 20px;
     height: 20px;
     margin-right: 6px;
     background: #dc2626;
     color: white;
     border: none;
     border-radius: 50%;
     font-size: 14px;
     font-weight: bold;
     cursor: pointer;
     vertical-align: middle;
     flex-shrink: 0;
   }
   .x10tube-title-btn:hover {
     background: #b91c1c;
   }
   .x10tube-title-btn.added {
     background: #22c55e;
   }
   ```

### Phase 3 : Toggle global (bouton principal)

1. **Ajouter** un bouton flottant dans un coin de l'écran (ex: en bas à droite)
2. **Fonction** : Active/désactive la visibilité de tous les boutons "+"
3. **Apparence** : Cercle rouge avec "+" quand actif, gris quand désactivé
4. **Persistance** : Sauvegarder l'état dans `chrome.storage.local`

```html
<button id="x10tube-master-toggle" class="active">+</button>
```

```css
#x10tube-master-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 48px;
  height: 48px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 50%;
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  z-index: 9999;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
}
#x10tube-master-toggle:not(.active) {
  background: #666;
}
#x10tube-master-toggle:not(.active) ~ .x10tube-title-btn {
  display: none;
}
```

### Phase 4 : Interaction

1. **Clic sur bouton titre** → Ouvre le dropdown X10Tube à côté du bouton
2. **Dropdown** : Utilise le même dropdown existant avec la liste des X10s
3. **Extraction du videoId** :
   - Format classique : depuis `href` du lien `a#video-title`
   - Format nouveau : depuis la classe `content-id-VIDEOID` du conteneur ou depuis le `href`

---

## Extraction du videoId

### Format classique
```javascript
const link = renderer.querySelector('a#video-title');
const href = link?.href;
const videoId = href?.match(/[?&]v=([^&]+)/)?.[1];
```

### Format nouveau
```javascript
// Option 1: depuis la classe du conteneur
const container = element.closest('.yt-lockup-view-model');
const contentClass = [...container.classList].find(c => c.startsWith('content-id-'));
const videoId = contentClass?.replace('content-id-', '');

// Option 2: depuis le href
const link = element.closest('yt-lockup-view-model').querySelector('a[href*="/watch?v="]');
const videoId = link?.href?.match(/[?&]v=([^&]+)/)?.[1];
```

---

## Avantages de cette approche

1. **Stabilité** : Les titres sont essentiels à YouTube, moins susceptibles de changer radicalement
2. **Simplicité** : Un seul type de bouton à gérer
3. **Visibilité** : Le bouton est toujours visible sans hover
4. **UX** : Toggle global pour ne pas encombrer l'interface si non désiré
5. **Performance** : Moins de MutationObservers complexes

---

## Risques

1. **Conflits de style** : Le bouton pourrait perturber le layout du titre (à tester)
2. **Changements de markup** : Toujours possible mais les titres sont fondamentaux
3. **Performance** : Beaucoup de boutons sur les pages avec beaucoup de vidéos

---

## Fichiers à modifier

- `extension/content.js` : Logique principale
- Potentiellement créer `extension/title-buttons.js` pour séparer le code

---

## Prochaines étapes

1. Valider ce plan
2. Implémenter Phase 1 (nettoyage)
3. Implémenter Phase 2 (injection boutons)
4. Tester sur les 3 types de pages
5. Implémenter Phase 3 (toggle global)
6. Tests finaux et ajustements CSS
