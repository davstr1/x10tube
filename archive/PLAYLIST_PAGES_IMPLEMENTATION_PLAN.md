# Plan d'implémentation - Boutons sur les pages de playlists YouTube

## Contexte

L'extension x10tube injecte actuellement des boutons à côté des titres de vidéos sur YouTube (homepage, recherche, sidebar, page de lecture). Cependant, elle ne couvre pas les pages de playlists comme "Watch Later" et "Liked Videos".

---

## Analyse des structures HTML

### 1. Page "Watch Later" / Playlists personnalisées (`/playlist?list=WL` ou `/playlist?list=LL`)

**Composant**: `ytd-playlist-video-renderer`

```html
<ytd-playlist-video-renderer>
  <yt-formatted-string id="index">1</yt-formatted-string>
  <div id="content">
    <div id="container">
      <ytd-thumbnail id="thumbnail" href="/watch?v=VIDEO_ID&list=WL&index=1">
        <!-- Thumbnail -->
      </ytd-thumbnail>
      <div id="meta">
        <h3 class="style-scope ytd-playlist-video-renderer" aria-label="Titre de la vidéo ...">
          <ytd-badge-supported-renderer id="top-standalone-badge">...</ytd-badge-supported-renderer>
          <a id="video-title"
             class="yt-simple-endpoint style-scope ytd-playlist-video-renderer"
             title="Titre de la vidéo"
             href="/watch?v=VIDEO_ID&list=WL&index=1">
            <yt-formatted-string>Titre de la vidéo</yt-formatted-string>
          </a>
        </h3>
        <ytd-video-meta-block class="playlist style-scope ytd-playlist-video-renderer">
          <!-- Channel, views, etc. -->
        </ytd-video-meta-block>
      </div>
    </div>
  </div>
</ytd-playlist-video-renderer>
```

**Point d'injection**: À l'intérieur de `<h3>`, **avant** le lien `<a id="video-title">`

**Sélecteur cible**:
- Conteneur: `ytd-playlist-video-renderer:not([data-x10-processed])`
- Titre: `#meta h3 > a#video-title`

**Extraction du videoId**: Depuis `href` du lien → `/watch?v=VIDEO_ID&list=...`

---

### 2. Page "Liked Videos" (`/playlist?list=LL`)

La page "Liked Videos" utilise **deux formats différents**:

#### a) Section Shorts (horizontal scroll)
**Composant**: `ytm-shorts-lockup-view-model` dans `ytd-reel-shelf-renderer`

```html
<ytd-reel-shelf-renderer>
  <div id="title-container">
    <yt-formatted-string id="title">Shorts</yt-formatted-string>
  </div>
  <yt-horizontal-list-renderer>
    <ytm-shorts-lockup-view-model>
      <a href="/shorts/VIDEO_ID" class="shortsLockupViewModelHostEndpoint">
        <!-- Thumbnail -->
      </a>
      <div class="shortsLockupViewModelHostOutsideMetadata">
        <h3 class="shortsLockupViewModelHostMetadataTitle shortsLockupViewModelHostOutsideMetadataTitle">
          <a href="/shorts/VIDEO_ID" title="Titre du short">
            <span class="yt-core-attributed-string">Titre du short</span>
          </a>
        </h3>
      </div>
    </ytm-shorts-lockup-view-model>
  </yt-horizontal-list-renderer>
</ytd-reel-shelf-renderer>
```

**Recommandation**: Ne **pas** ajouter de boutons sur les Shorts car:
- Les shorts ne sont généralement pas transcrits (pas de sous-titres)
- L'espace est limité sur les cards de shorts
- Le ratio coût/bénéfice est faible

#### b) Vidéos normales (liste verticale)
**Composant**: `yt-lockup-view-model` (même format que la homepage)

```html
<yt-lockup-view-model class="ytd-item-section-renderer lockup yt-lockup-view-model--wrapper">
  <div class="yt-lockup-view-model yt-lockup-view-model--horizontal content-id-VIDEO_ID">
    <a href="/watch?v=VIDEO_ID" class="yt-lockup-view-model__content-image">
      <!-- Thumbnail -->
    </a>
    <div class="yt-lockup-view-model__metadata">
      <yt-lockup-metadata-view-model class="yt-lockup-metadata-view-model yt-lockup-metadata-view-model--horizontal">
        <div class="yt-lockup-metadata-view-model__avatar">...</div>
        <div class="yt-lockup-metadata-view-model__text-container">
          <h3 class="yt-lockup-metadata-view-model__heading-reset" title="Titre de la vidéo">
            <a href="/watch?v=VIDEO_ID" class="yt-lockup-metadata-view-model__title">
              <span class="yt-core-attributed-string">Titre de la vidéo</span>
            </a>
          </h3>
        </div>
      </yt-lockup-metadata-view-model>
    </div>
  </div>
</yt-lockup-view-model>
```

**Bonne nouvelle**: Ce format est **déjà géré** par le code actuel (Format 2 dans `injectTitleButtons()`).

---

## Formats actuellement supportés (content.ts)

| # | Format | Sélecteur | Pages |
|---|--------|-----------|-------|
| 1 | `ytd-video-renderer` | `a#video-title` dans `h3` | Recherche, Sidebar classique |
| 2 | `yt-lockup-metadata-view-model` | `h3.yt-lockup-metadata-view-model__heading-reset` | Homepage, Sidebar 2024+, Liked Videos (vidéos normales) |
| 3 | `ytd-rich-item-renderer` | `a#video-title-link` | Homepage alternative |
| 4 | `ytd-watch-metadata` | `#title h1` | Page de lecture |

---

## Format à ajouter

| # | Format | Sélecteur | Pages |
|---|--------|-----------|-------|
| 5 | `ytd-playlist-video-renderer` | `#meta h3 > a#video-title` | Watch Later, Playlists, Liked Videos (parfois) |

---

## Plan d'implémentation

### Étape 1: Ajouter le support pour `ytd-playlist-video-renderer`

Dans la fonction `injectTitleButtons()` du fichier `extension/src/content.ts`, ajouter un nouveau bloc après le Format 4:

```typescript
// Format 5: Playlist items (ytd-playlist-video-renderer) - Watch Later, Liked Videos, Custom Playlists
const playlistItems = document.querySelectorAll('ytd-playlist-video-renderer:not([data-x10-processed]) a#video-title');

playlistItems.forEach(titleLink => {
  try {
    const renderer = titleLink.closest('ytd-playlist-video-renderer');
    if (!renderer) return;

    renderer.setAttribute('data-x10-processed', 'true');

    const videoId = extractVideoIdFromUrl((titleLink as HTMLAnchorElement).href);
    if (!videoId) return;

    const h3 = titleLink.closest('h3');
    if (!h3 || h3.querySelector('.stya-title-btn')) return;

    const btn = createTitleButton(videoId);
    h3.insertBefore(btn, titleLink);
    count++;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.log('[STYA] Error injecting playlist button:', errorMessage);
  }
});
```

### Étape 2: CSS ajustements (optionnel)

Les styles CSS existants devraient fonctionner. Si besoin d'ajustements spécifiques:

```css
/* Playlist video renderer - bouton inline avec le titre */
ytd-playlist-video-renderer #meta h3:has(.stya-title-btn) {
  display: flex !important;
  align-items: flex-start !important;
  flex-direction: row !important;
}
ytd-playlist-video-renderer #meta h3:has(.stya-title-btn) > a#video-title {
  flex: 1;
}
```

### Étape 3: Test

Pages à tester:
1. `/playlist?list=WL` - Watch Later
2. `/playlist?list=LL` - Liked Videos
3. `/playlist?list=PLxxxxxx` - Playlist personnalisée
4. `/feed/history` - Historique (vérifier si même format)

---

## Considérations

### Pourquoi ne pas gérer les Shorts dans les playlists?

1. **Transcription impossible**: Les Shorts n'ont généralement pas de sous-titres
2. **UX**: L'espace est limité sur les cartes horizontales de Shorts
3. **Valeur ajoutée**: Faible pour l'utilisateur final

### Performance

- Le sélecteur `ytd-playlist-video-renderer:not([data-x10-processed])` est efficace
- L'intervalle de 2 secondes existant suffit pour le scroll infini des playlists
- Le marquage `data-x10-processed` évite les doublons

### Compatibilité

- Les playlists "Liked Videos" utilisent parfois `yt-lockup-view-model` (déjà supporté)
- Les playlists "Watch Later" utilisent toujours `ytd-playlist-video-renderer`
- La solution couvre les deux cas

---

## Résumé des modifications

| Fichier | Modification |
|---------|--------------|
| `extension/src/content.ts` | Ajouter Format 5 dans `injectTitleButtons()` |
| `extension/src/content.ts` | (Optionnel) Ajouter styles CSS pour `ytd-playlist-video-renderer` |

**Lignes de code estimées**: ~20 lignes

---

## Prochaines étapes

1. ✅ Documenter le plan (ce fichier)
2. ⬜ Implémenter le Format 5 dans `content.ts`
3. ⬜ Tester sur les pages mentionnées
4. ⬜ Ajuster les styles CSS si nécessaire
5. ⬜ Commit et déploiement
