# Plan: Ajouter des icônes au popover

**Date**: 2026-02-06
**Status**: Planification

---

## Objectif

Améliorer l'expérience utilisateur desktop en ajoutant des éléments visuels au popover:
1. **Icônes des assistants IA** à gauche des options "Open in..."
2. **Vignettes des collections** à gauche de chaque collection existante

---

## État actuel

### Dimensions
- Largeur overlay: **280px** (fixe)
- Hauteur max: 90vh
- Liste collections: max 200px avec scroll

### Structure LLM actuelle
```html
<button class="x10-submenu-item" data-llm="claude">Claude</button>
```
→ Texte seul, pas d'icône

### Structure collection actuelle
```html
<button class="x10-item" data-x10-id="xxx">
  <span class="x10-item-check">✓</span>
  <span class="x10-item-name">Nom collection</span>
  <span class="x10-item-count">42</span>
</button>
```
→ Pas de vignette, données collection = `{ id, title, videoCount }` seulement

---

## Partie 1: Icônes des assistants IA

### 1.1 Icônes disponibles

| Assistant | Source icône | Couleur principale |
|-----------|--------------|-------------------|
| Claude | [LobeHub](https://lobehub.com/icons/claude) / [Wikimedia](https://commons.wikimedia.org/wiki/File:Claude_AI_logo.svg) | Orange #D97706 |
| ChatGPT | [Free AI Logos](https://ailogocollection.netlify.app/) | Vert #10A37F |
| Gemini | Google brand | Bleu/Multicolore |
| Perplexity | [LobeHub](https://lobehub.com/icons/perplexity) | Turquoise #20B2AA |
| Grok | X/Twitter | Blanc sur noir |
| Copilot | Microsoft | Bleu/Vert gradient |

### 1.2 Approche recommandée: SVG inline

**Pourquoi SVG inline:**
- Pas de requêtes réseau supplémentaires
- Colorable via CSS
- Petite taille (< 1KB par icône)
- Déjà utilisé dans l'extension (checkmarks, arrows)

**Alternative rejetée:** Images externes
- Requêtes réseau
- Dépendance à des serveurs tiers
- Plus lourd

### 1.3 Nouvelle structure HTML

```html
<button class="x10-submenu-item" data-llm="claude">
  <span class="x10-llm-icon">
    <svg><!-- Claude icon --></svg>
  </span>
  <span class="x10-llm-name">Claude</span>
</button>
```

### 1.4 CSS nécessaire

```css
.x10-submenu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
}

.x10-llm-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.x10-llm-icon svg {
  width: 100%;
  height: 100%;
}

.x10-llm-name {
  flex: 1;
}
```

### 1.5 Tâches

- [ ] Collecter les SVGs des 6 assistants (versions simplifiées/monochrome OK)
- [ ] Créer un objet `LLM_ICONS` avec les SVG strings
- [ ] Modifier le HTML du submenu pour inclure les icônes
- [ ] Ajouter le CSS flexbox

---

## Partie 2: Vignettes des collections

### 2.1 Problème: pas de données de vignette

Actuellement, l'API retourne:
```typescript
interface X10Collection {
  id: string;
  title: string;
  videoCount: number;
}
```

**Aucune information sur le contenu** (premier item, thumbnail, etc.)

### 2.2 Solutions possibles

#### Option A: Ajouter `thumbnail` côté serveur (Recommandée)

**Modification serveur:**
1. Ajouter colonne `thumbnail_url` à la table `collections`
2. Lors de l'ajout du premier item, stocker son thumbnail:
   - YouTube: `https://img.youtube.com/vi/{videoId}/mqdefault.jpg`
   - Web: `https://www.google.com/s2/favicons?domain={domain}&sz=64`
3. Retourner `thumbnail` dans l'API `/api/x10s/by-code/{code}`

**Avantages:**
- Une seule source de vérité
- Pas de requêtes supplémentaires côté client
- Fonctionne pour collections vides (null = icône par défaut)

**Inconvénients:**
- Migration de données nécessaire
- Modification de l'API

#### Option B: Calculer côté client (Alternative simple)

**Approche:**
1. Modifier l'API pour retourner le `first_item` de chaque collection
2. Générer l'URL de thumbnail côté extension

**Inconvénients:**
- Plus de données transférées
- Logique dupliquée

#### Option C: Icône générique par type (Fallback)

Si pas de thumbnail disponible:
- Icône "dossier" ou "collection" générique
- Différencier YouTube vs Web par une icône de type

### 2.3 Structure HTML proposée

```html
<button class="x10-item" data-x10-id="xxx">
  <span class="x10-item-thumb">
    <img src="https://img.youtube.com/vi/xxx/mqdefault.jpg" alt="">
    <!-- OU fallback -->
    <svg><!-- folder icon --></svg>
  </span>
  <span class="x10-item-info">
    <span class="x10-item-name">Nom collection</span>
    <span class="x10-item-count">42 items</span>
  </span>
  <span class="x10-item-check">✓</span>
</button>
```

### 2.4 CSS nécessaire

```css
.x10-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}

.x10-item-thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--surface-alt);
}

.x10-item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.x10-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0; /* Pour text-overflow */
}

.x10-item-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.x10-item-count {
  font-size: 12px;
  color: var(--text-muted);
}
```

### 2.5 Tâches

- [ ] **Serveur**: Ajouter `thumbnail_url` à la table `collections`
- [ ] **Serveur**: Mettre à jour `addItemToCollection` pour stocker le thumbnail du premier item
- [ ] **Serveur**: Modifier `/api/x10s/by-code` pour retourner `thumbnail`
- [ ] **Extension**: Mettre à jour le type `X10Collection` avec `thumbnail?: string`
- [ ] **Extension**: Modifier le HTML des items collection
- [ ] **Extension**: Ajouter CSS pour les thumbnails
- [ ] **Extension**: Prévoir fallback SVG si pas de thumbnail

---

## Partie 3: Ajustement de la largeur

### 3.1 Nouvelle largeur recommandée

| Élément | Avant | Après |
|---------|-------|-------|
| Overlay width | 280px | **320px** |
| Thumbnail | - | 40px |
| Gap | - | 12px |
| Icône LLM | - | 20px |
| Gap LLM | - | 10px |

**Justification:**
- 40px thumbnail + 12px gap = 52px supplémentaires
- 280 + 40 = 320px reste raisonnable pour desktop

### 3.2 Responsive

Pas de changement nécessaire - l'extension est desktop-only et 320px reste bien en dessous de la largeur minimale d'écran desktop (1024px).

---

## Ordre d'implémentation suggéré

### Phase 1: Icônes LLM (indépendant du serveur)
1. Collecter/créer les SVG des 6 assistants
2. Ajouter l'objet `LLM_ICONS` dans content.ts
3. Modifier le HTML du submenu
4. Ajouter le CSS
5. Tester

### Phase 2: Thumbnails collections (nécessite serveur)
1. Migration DB: ajouter colonne `thumbnail_url`
2. Modifier le service collection pour stocker le thumbnail
3. Modifier l'API pour retourner le thumbnail
4. Modifier le type TypeScript côté extension
5. Modifier le HTML des items collection
6. Ajouter le CSS
7. Ajouter le fallback SVG
8. Tester

### Phase 3: Polish
1. Ajuster la largeur à 320px
2. Tester l'ensemble
3. Vérifier les performances (pas de requêtes bloquantes)

---

## Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| SVG trop gros | Bundle size | Utiliser des versions simplifiées/monochrome |
| Images thumbnails cassées | UX dégradée | Fallback SVG générique + onerror handler |
| Largeur trop grande | Overlay déborde | Tester sur écrans 1024px minimum |
| API plus lente avec thumbnails | UX lente | Thumbnail est juste une string URL, négligeable |

---

## Ressources

- [LobeHub Icons](https://lobehub.com/icons/claude) - SVGs gratuits pour LLMs
- [Free AI Logo Collection](https://ailogocollection.netlify.app/) - 500+ logos AI
- [Figma AI Logos](https://www.figma.com/community/file/1408473122429615761) - Pack complet

---

## Décision requise

Avant d'implémenter, confirmer:

1. **Largeur 320px** acceptable?
2. **Phase 1 seule** (icônes LLM) ou **Phase 1+2** (+ thumbnails collections)?
3. **Style icônes**: couleur originale ou monochrome blanc?
