# Styling du Menu X10Tube - Style Natif YouTube

## Objectif

Faire en sorte que l'item "Add to X10Tube" dans les menus ⋮ de YouTube ressemble exactement aux items natifs de YouTube.

---

## Découvertes Puppeteer (Janvier 2026)

### Format Classic (ytd-menu-popup-renderer) - Page de Recherche

#### Structure HTML native

```html
<ytd-menu-service-item-renderer class="style-scope ytd-menu-popup-renderer" role="menuitem">
  <tp-yt-paper-item class="style-scope ytd-menu-service-item-renderer" role="option" tabindex="0">
    <yt-icon class="style-scope ytd-menu-service-item-renderer">
      <span class="yt-icon-shape">
        <div style="width: 100%; height: 100%; fill: currentcolor;">
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
            <path d="..."></path>
          </svg>
        </div>
      </span>
    </yt-icon>
    <yt-formatted-string class="style-scope ytd-menu-service-item-renderer">Add to queue</yt-formatted-string>
  </tp-yt-paper-item>
</ytd-menu-service-item-renderer>
```

#### Styles CSS observés - Container (tp-yt-paper-item)

| Propriété | Valeur |
|-----------|--------|
| display | flex |
| flex-direction | row |
| align-items | center |
| padding | 0px 12px 0px 16px |
| min-height | 36px |
| height | 36px |
| cursor | pointer |
| background-color | transparent |

#### Styles CSS observés - Icône (yt-icon)

| Propriété | Valeur |
|-----------|--------|
| width | 24px |
| height | 24px |
| margin-right | 12px |
| margin-left | 0px |
| color | rgb(241, 241, 241) |
| fill | currentcolor |

#### Styles CSS observés - Texte (yt-formatted-string)

| Propriété | Valeur |
|-----------|--------|
| font-size | 14px |
| font-family | Roboto, Arial, sans-serif |
| font-weight | 400 |
| color | rgb(241, 241, 241) |
| line-height | 20px |
| letter-spacing | normal |

#### Hover

```css
tp-yt-paper-item:hover {
  background-color: var(--yt-spec-10-percent-layer); /* rgba(255,255,255,0.1) */
}
```

---

### Format New (yt-list-view-model) - Homepage

Le nouveau format utilise `yt-list-item-view-model` avec une structure similaire mais des composants différents. Les styles de base restent les mêmes (mêmes variables CSS YouTube).

---

## Variables CSS YouTube

```css
--yt-spec-text-primary: #f1f1f1;
--yt-spec-text-secondary: #aaa;
--yt-spec-10-percent-layer: rgba(255,255,255,0.1);
--yt-spec-menu-background: #282828;
```

---

## Implémentation pour X10Tube

### Icône X10Tube

Pour l'icône, nous utilisons un "+" stylisé en rouge (#dc2626) pour représenter l'action "Add".

```css
.x10tube-menu-icon {
  width: 24px;
  height: 24px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  color: #dc2626; /* Rouge X10Tube */
}
```

### Container

```css
.x10tube-menu-item tp-yt-paper-item,
.x10tube-menu-item-new > div {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 12px 0 16px;
  min-height: 36px;
  height: 36px;
  cursor: pointer;
  font-family: "Roboto", "Arial", sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--yt-spec-text-primary, #f1f1f1);
  line-height: 20px;
}
```

### Hover

```css
.x10tube-menu-item tp-yt-paper-item:hover,
.x10tube-menu-item-new:hover {
  background-color: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
}
```

---

## Résumé des valeurs clés

| Élément | Propriété | Valeur |
|---------|-----------|--------|
| Container | padding-left | 16px |
| Container | padding-right | 12px |
| Container | min-height | 36px |
| Container | display | flex |
| Container | align-items | center |
| Icône | size | 24x24px |
| Icône | margin-right | 12px |
| Texte | font-size | 14px |
| Texte | font-family | Roboto, Arial, sans-serif |
| Texte | font-weight | 400 |
| Texte | line-height | 20px |
| Texte | color | #f1f1f1 |
| Hover | background | rgba(255,255,255,0.1) |

---

## Implémentation (23 Janvier 2026)

### Changements effectués dans content.js

1. **CSS mis à jour** (lignes ~500-535):
   - Padding corrigé: `0 12px 0 16px` (avant: `0 36px 0 16px`)
   - Height explicite: `36px`
   - Margin-right icône: `12px` (avant: `16px`)
   - Couleur icône: `#dc2626` (rouge X10Tube)
   - Line-height texte: `20px`

2. **createX10MenuItem()** (format classique):
   - Utilise maintenant un SVG pour l'icône (path: `M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z`)
   - Structure conforme à YouTube (tp-yt-paper-item, yt-formatted-string)

3. **createX10MenuItemNewFormat()** (nouveau format yt-list-view-model):
   - Construction DOM au lieu de innerHTML (Trusted Types)
   - Mêmes styles que le format classique
   - SVG icône identique
