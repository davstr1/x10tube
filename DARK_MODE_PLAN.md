# X10Tube - Plan d'implémentation Dark Mode

## Analyse de l'existant

### Stack actuelle
- **Tailwind CSS** avec séparateur `_` (pour compatibilité Pug)
- **Pug templates** avec classes Tailwind inline
- Couleurs hardcodées : `bg-white`, `bg-gray-50`, `text-gray-800`, `border-gray-100`, etc.
- Aucune variable CSS actuellement

### Fichiers concernés
- `server/tailwind.config.js` - Config Tailwind
- `server/src/styles/input.css` - CSS source
- `server/src/views/layout.pug` - Layout principal
- `server/src/views/*.pug` - Toutes les vues (7 fichiers, ~110 occurrences de couleurs)

---

## Approche recommandée : CSS Variables + Toggle

### Pourquoi pas les variantes `dark:` de Tailwind ?

Ajouter `dark:` à chaque classe Tailwind dans les templates doublerait la verbosité :
```pug
// Avant
.bg-white.text-gray-800

// Après (trop verbeux)
.bg-white.dark_bg-gray-900.text-gray-800.dark_text-gray-100
```

### Pourquoi les CSS Variables ?

1. **Une seule modification par élément** - Pas de doublon de classes
2. **Facilité de maintenance** - Couleurs centralisées
3. **Performance** - Le toggle change une classe, tout s'adapte
4. **Flexibilité** - Facile d'ajuster les couleurs plus tard

---

## Palette de couleurs

### Light Mode (actuel)
| Usage | Couleur actuelle |
|-------|------------------|
| Background page | `gray-50` (#f9fafb) |
| Background cards | `white` (#ffffff) |
| Background inputs | `white` (#ffffff) |
| Text primary | `gray-800` (#1f2937) |
| Text secondary | `gray-500` (#6b7280) |
| Text muted | `gray-400` (#9ca3af) |
| Borders | `gray-100`/`gray-200` |
| Accent | `red-600` (#dc2626) |
| Accent hover | `red-700` (#b91c1c) |

### Dark Mode (proposé)
| Usage | Couleur proposée |
|-------|------------------|
| Background page | `gray-950` (#030712) |
| Background cards | `gray-900` (#111827) |
| Background inputs | `gray-800` (#1f2937) |
| Text primary | `gray-100` (#f3f4f6) |
| Text secondary | `gray-400` (#9ca3af) |
| Text muted | `gray-500` (#6b7280) |
| Borders | `gray-800`/`gray-700` |
| Accent | `red-500` (#ef4444) |
| Accent hover | `red-400` (#f87171) |

---

## Plan d'implémentation

### Phase 1 : Configuration Tailwind + CSS Variables

**1.1 Modifier `tailwind.config.js`**
```js
module.exports = {
  darkMode: 'class', // Active le mode dark par classe
  content: ["./src/views/**/*.pug"],
  separator: '_',
  theme: {
    extend: {
      colors: {
        // Couleurs sémantiques via CSS variables
        'surface': 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'border': 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
      }
    }
  },
  plugins: [],
}
```

**1.2 Modifier `input.css`**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-surface: #ffffff;
    --color-surface-alt: #f9fafb;
    --color-text-primary: #1f2937;
    --color-text-secondary: #6b7280;
    --color-text-muted: #9ca3af;
    --color-border: #f3f4f6;
    --color-border-strong: #e5e7eb;
  }

  :root.dark {
    --color-surface: #111827;
    --color-surface-alt: #030712;
    --color-text-primary: #f3f4f6;
    --color-text-secondary: #9ca3af;
    --color-text-muted: #6b7280;
    --color-border: #1f2937;
    --color-border-strong: #374151;
  }
}
```

### Phase 2 : Mise à jour des templates

**2.1 Modifier `layout.pug`**
```pug
doctype html
html(lang="en" class=darkMode ? 'dark' : '')
  head
    // ... existing head ...
    script.
      // Detect system preference or saved choice
      (function() {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (saved === 'dark' || (!saved && prefersDark)) {
          document.documentElement.classList.add('dark');
        }
      })();
  body.bg-surface-alt.text-text-primary.min-h-screen.flex.flex-col.antialiased
    // ... rest of layout ...
```

**2.2 Remplacer les classes dans tous les templates**

| Ancienne classe | Nouvelle classe |
|-----------------|-----------------|
| `bg-white` | `bg-surface` |
| `bg-gray-50` | `bg-surface-alt` |
| `text-gray-800`, `text-gray-900` | `text-text-primary` |
| `text-gray-500`, `text-gray-600` | `text-text-secondary` |
| `text-gray-400` | `text-text-muted` |
| `border-gray-100` | `border-border` |
| `border-gray-200` | `border-border-strong` |

**Note** : Garder `text-red-600`, `bg-red-600`, etc. intacts (accent colors).

### Phase 3 : Toggle UI

**3.1 Ajouter un bouton de toggle dans le header**

Position : à droite du lien "My x10s"

```pug
// Dans layout.pug, après le nav
button#theme-toggle.p-2.rounded-md.hover_bg-surface(type="button" title="Toggle dark mode")
  // Icône soleil (visible en dark mode)
  svg.w-5.h-5.hidden.dark_block(...)
  // Icône lune (visible en light mode)
  svg.w-5.h-5.block.dark_hidden(...)
```

**3.2 JavaScript pour le toggle**
```javascript
document.getElementById('theme-toggle').addEventListener('click', () => {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// Listen for system preference changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('theme')) {
    document.documentElement.classList.toggle('dark', e.matches);
  }
});
```

### Phase 4 : Ajustements spécifiques

**4.1 Dropdowns dans les vues**
Les dropdowns inline (`style.` dans les pug) utilisent des couleurs hardcodées :
```css
background: white;
border: 1px solid #e5e7eb;
```

À remplacer par :
```css
background: var(--color-surface);
border: 1px solid var(--color-border-strong);
```

**4.2 États hover**
- `hover_bg-gray-50` → `hover_bg-surface-alt` (ou créer `hover_bg-surface-hover`)
- Potentiellement ajouter une variable `--color-surface-hover`

**4.3 Focus states pour inputs**
Garder les focus rings en couleur statique pour l'accessibilité.

---

## Ordre d'exécution

1. **Phase 1** : Config Tailwind + CSS variables
2. **Build CSS** : `npm run build:css` pour générer le nouveau styles.css
3. **Phase 2** : Mettre à jour les templates un par un
   - `layout.pug` (inclut script de détection)
   - `landing.pug`
   - `x10.pug`
   - `myx10s.pug`
   - `sync.pug`
   - `login.pug`
   - `error.pug`
4. **Phase 3** : Ajouter le toggle UI
5. **Phase 4** : Ajuster les styles inline des dropdowns
6. **Test** : Vérifier sur toutes les pages

---

## Considérations supplémentaires

### Transition fluide
Ajouter une transition globale pour éviter le flash :
```css
html {
  transition: background-color 0.2s ease, color 0.2s ease;
}
```

### Éviter le flash au chargement
Le script inline dans `<head>` s'exécute avant le rendu, donc pas de flash blanc→noir.

### Cookies vs localStorage
- **localStorage** : Simple, côté client uniquement
- **Cookie** : Permettrait au serveur de connaître la préférence (SSR)

Pour X10Tube, localStorage suffit car le toggle est côté client.

### Extension Chrome
L'extension utilise déjà des couleurs sombres (#282828, #212121). Pas de changement nécessaire.

---

## Estimation

- Phase 1 : ~10 min
- Phase 2 : ~30 min (7 fichiers à modifier)
- Phase 3 : ~15 min
- Phase 4 : ~15 min
- Tests : ~15 min

**Total : ~1h30**

---

## Mockup mental

### Light Mode (actuel)
- Background : Gris très clair
- Cards : Blanches
- Texte : Gris foncé
- Accent : Rouge

### Dark Mode
- Background : Quasi noir (#030712)
- Cards : Gris très foncé (#111827)
- Texte : Gris clair
- Accent : Rouge légèrement plus vif
