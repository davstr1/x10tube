# Bug: Le menu "Open in..." ne s'ouvre pas dans le popover YouTube

## Le Problème

Quand on clique sur "Open in..." dans le dropdown (content.js, popover YouTube), le sous-menu avec les LLMs (Claude, ChatGPT, etc.) ne s'affiche pas.

## Cause

**`overflow: hidden` sur le dropdown parent.**

```css
/* content.js ligne 324 */
#x10tube-dropdown {
  position: fixed;
  width: 280px;
  overflow: hidden;       /* ← LE COUPABLE */
  /* ... */
}
```

Le sous-menu est positionné en `position: absolute; left: 100%` (à droite du parent):

```css
/* content.js ligne 404 */
.x10-submenu {
  display: none;
  position: absolute;
  left: 100%;             /* ← Sort du dropdown de 140px à droite */
  top: 0;
  min-width: 140px;
}
```

**Le sous-menu dépasse du dropdown → `overflow: hidden` le rend invisible.**

Le hover CSS fonctionne (`.x10-has-submenu:hover .x10-submenu { display: block }`), mais le sous-menu est clippé par le conteneur parent.

## Pourquoi le popup n'a pas ce bug

Dans `popup.js`, le sous-menu est géré **différemment**:

```javascript
// popup.js ligne 102
elements.openInBtn.addEventListener('click', () => {
  elements.llmSubmenu.classList.toggle('hidden');
});
```

```html
<!-- popup.html - le submenu est INLINE, pas positionné en absolute -->
<div class="quick-submenu hidden" id="llm-submenu">
  <button class="submenu-item" data-llm="claude">Claude</button>
  ...
</div>
```

Le popup utilise:
- **Click** pour toggle (pas hover)
- **Inline** dans le flow du document (pas `position: absolute; left: 100%`)
- Le popup n'a pas `overflow: hidden`

## Solutions Possibles

### Option A: Changer overflow sur le dropdown

```css
#x10tube-dropdown {
  overflow: visible;
}
```

**Problème:** La liste d'x10s (`.x10-list`) a `max-height: 200px; overflow-y: auto`. Si le dropdown a `overflow: visible`, le border-radius ne s'applique plus proprement et le scroll de la liste peut déborder visuellement.

### Option B: Sous-menu inline (comme le popup) — RECOMMANDÉE

Passer le sous-menu en inline avec toggle JavaScript au lieu de hover + position absolute:

```html
<!-- Remplacer la div x10-has-submenu par un bouton + sous-menu inline -->
<button class="x10-quick-item" id="x10-open-in">
  <span class="x10-quick-icon">▸</span>
  <span>Open in...</span>
</button>
<div class="x10-submenu-inline" style="display:none">
  <button class="x10-submenu-item" data-llm="claude">Claude</button>
  ...
</div>
```

```javascript
dropdown.querySelector('#x10-open-in').addEventListener('click', () => {
  const submenu = dropdown.querySelector('.x10-submenu-inline');
  submenu.style.display = submenu.style.display === 'none' ? 'block' : 'none';
});
```

**Avantages:**
- Pas de problème d'overflow
- Cohérent avec le popup
- Marche au clic (plus fiable que hover, surtout sur écran tactile)
- Pas besoin de toucher à `overflow` du dropdown

**Style du sous-menu inline:**
```css
.x10-submenu-inline {
  background: #1f1f1f;
  padding: 4px 0;
}
.x10-submenu-inline .x10-submenu-item {
  padding-left: 42px;  /* Indent pour montrer la hiérarchie */
}
```

### Option C: Porter le sous-menu hors du dropdown

Créer le sous-menu comme un élément `position: fixed` séparé (pas enfant du dropdown), positionné dynamiquement à côté du bouton "Open in...".

**Avantages:** Pas de problème d'overflow, vrai sous-menu flottant.
**Inconvénients:** Plus complexe à implémenter et maintenir.

## Recommandation

**Option B** — sous-menu inline avec toggle JavaScript. C'est la solution la plus simple, la plus robuste, et elle aligne le comportement content.js avec popup.js.
