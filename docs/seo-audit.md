# SEO Audit — StraightToYourAI

**Date :** 7 février 2026
**Site :** toyourai.plstry.me

---

## Critique

### 1. Aucune meta description / Open Graph / Twitter Card

Aucune page n'a de `meta description`, `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`, etc. Impact direct sur :
- L'affichage dans les résultats Google (snippet généré automatiquement)
- Le rendu des liens partagés sur Twitter, Discord, Slack, etc.

**Fichier :** `layout.pug` — le `<head>` ne contient que `title`, `charset`, `viewport`, favicons et la stylesheet.

**Fix :** Ajouter dans `layout.pug` des blocs meta par défaut, surchargeables par page :
- `meta(name="description" content=description)`
- `meta(property="og:title" content=title)`
- `meta(property="og:description" content=description)`
- `meta(property="og:image" content="/og-image.png")`
- `meta(property="og:url" content=baseUrl + path)`
- `meta(name="twitter:card" content="summary_large_image")`

### 2. Pas de sitemap.xml

Le `robots.txt` référence un sitemap mais la ligne est commentée, et le fichier n'existe pas.

**Fichier :** `server/public/robots.txt` (ligne 71)

**Fix :** Créer `server/public/sitemap.xml` avec les pages publiques (`/`, `/privacy`, `/welcome`, `/news`) et décommenter la ligne dans robots.txt.

### 3. Pas de lien canonical

Aucune page n'a de `<link rel="canonical">`. Risque de duplicate content si le site est accessible via plusieurs URLs.

**Fix :** Ajouter `link(rel="canonical" href=baseUrl + path)` dans `layout.pug`.

### 4. Pas de données structurées (JSON-LD)

Aucun schema markup. Pas de rich snippets possibles dans Google.

**Fix :** Ajouter au minimum un schema `Organization` + `WebSite` dans `layout.pug`, et un schema `FAQPage` sur la landing page.

---

## Important

### 5. Images sans alt text

- Les SVG du logo (header et footer de `layout.pug`) n'ont pas d'attribut `aria-label` ou de texte alternatif
- Les images du slideshow (`landing.pug`) ont un alt générique "Slide 1", "Slide 2"...
- Les icônes SVG de la page welcome n'ont pas d'alt

**Fix :** Ajouter des `aria-label` sur les SVG du logo, des alt descriptifs sur les slides.

### 6. Liens externes sans `rel="noopener noreferrer"`

Tous les liens `target="_blank"` (Chrome Web Store, email, Supabase, PostHog) n'ont pas de `rel="noopener noreferrer"`.

**Fichiers :** `landing.pug`, `layout.pug`, `privacy.pug`, `welcome.pug`, `x10.pug`

**Fix :** Ajouter `rel="noopener noreferrer"` sur tous les liens avec `target="_blank"`.

### 7. Pas de lazy loading sur les images

Les 5 images du slideshow (slide1-5.png, ~500KB chacune) se chargent toutes immédiatement. Les thumbnails YouTube sur les pages collections aussi.

**Fix :** Ajouter `loading="lazy"` sur les slides 2-5 et sur les thumbnails de collections.

---

## Nice-to-have

### 8. Pas de `preconnect` pour les ressources externes

Le site charge des ressources depuis google.com (favicons), youtube.com (favicons), posthog.com (analytics) sans hint de préconnexion.

**Fix :** Ajouter dans `layout.pug` :
```html
link(rel="preconnect" href="https://www.google.com")
link(rel="preconnect" href="https://app.posthog.com")
```

### 9. Section FAQ sans structure sémantique

Le FAQ de la landing page utilise des `div > p` au lieu de `details/summary` ou d'un balisage sémantique. Pas de schema `FAQPage`.

**Fix :** Restructurer avec des balises sémantiques et ajouter le JSON-LD `FAQPage`.

### 10. Cross-linking limité

- La page News n'est pas liée depuis le header
- Pas de lien vers Privacy depuis les pages internes (seulement le footer)
- Settings et Sync ne se référencent pas mutuellement

### 11. Titres de pages peu différenciés

Les pages internes ont des titres du type "Settings - straighttoyour.ai". Ils pourraient être plus descriptifs pour le SEO :
- Settings → "Extension Settings - StraightToYourAI"
- Collections → "My AI Collections - StraightToYourAI"

---

## Ce qui est bien

| Aspect | Statut |
|--------|--------|
| Viewport mobile | `width=device-width, initial-scale=1.0` |
| Attribut `lang="en"` | Présent sur `<html>` |
| Charset UTF-8 | Présent |
| Favicons | Complets (ico, svg, apple-touch, 16/32/48/192/512) |
| URLs propres | `/`, `/collections`, `/s/:id`, `/privacy`, `/settings` |
| Navigation interne | Header avec logo, collections, settings, help, sync |
| Contenu indexable | Landing page riche (~1000+ mots) |
| robots.txt | Bien configuré, autorise tous les bots (y compris IA) |
| Structure sémantique | `header`, `main`, `footer`, `nav`, `article`, `section` |

---

## Priorités d'implémentation

| Priorité | Action | Impact |
|----------|--------|--------|
| 1 | Meta description + OG + Twitter Card sur toutes les pages | Apparence dans Google + partage social |
| 2 | Créer sitemap.xml | Indexation complète |
| 3 | Ajouter canonical links | Éviter le duplicate content |
| 4 | JSON-LD Organization + FAQPage | Rich snippets |
| 5 | Alt text sur images/SVG | Accessibilité + SEO images |
| 6 | `rel="noopener noreferrer"` sur liens externes | Sécurité + SEO |
| 7 | Lazy loading images | Performance |
| 8 | Preconnect hints | Performance |
