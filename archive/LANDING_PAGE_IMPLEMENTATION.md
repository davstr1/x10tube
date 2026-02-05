# Plan d'implémentation - Landing page toyour.ai

Ce document décrit les modifications à apporter à la landing page basées sur l'analyse concurrentielle et les recommandations du document `LANDING_PAGE_ANALYSIS.md`.

---

## Fichiers concernés

| Fichier | Modifications |
|---------|---------------|
| `server/src/views/landing.pug` | Restructuration complète du contenu |
| `server/src/public/styles.css` | Nouveaux styles si nécessaire |
| Assets à créer | GIF de démo de l'extension (optionnel) |

---

## Structure actuelle vs nouvelle structure

### Structure actuelle

```
1. Formulaire (textarea + bouton)
2. Lien extension (petit texte)
3. Tagline
4. Section "Why?" (3 points)
5. Section "How it works" (3 étapes)
6. FAQ (4 questions)
```

### Nouvelle structure proposée

```
1. Hero avec nouvelle tagline + badge FREE
2. CTA extension proéminent
3. Séparateur "or paste URLs below"
4. Formulaire (textarea + bouton)
5. Logos LLMs supportés
6. [GIF démo - optionnel]
7. Section "Use cases" (4 exemples)
8. Section "Why toyour.ai?" (5 points avec comparaison)
9. Section "How it works" (2 colonnes: extension + website)
10. FAQ révisée (5 questions)
```

---

## Détail des modifications

### 1. Hero section (nouvelle)

**Avant :**
```pug
section.py-8.border-t.border-border-strong
  p.text-lg.text-text-secondary.mb-2
    | A page, a video, a document... or dozens. In one click, to your AI.
  p.text-text-muted
    | Summarize, discuss, do your thing, in your favorite assistant.
```

**Après :**
```pug
section.mb-8.text-center
  //- Badge FREE
  span.inline-block.bg-green-600.text-white.text-xs.font-bold.px-2.py-1.rounded-full.mb-4
    | 100% FREE

  //- Tagline principale
  h1.text-2xl.md_text-3xl.font-bold.text-text-primary.mb-3
    | Combine videos, pages, and articles.
    br
    | Send to your AI.

  //- Sous-tagline
  p.text-lg.text-text-secondary.mb-2
    | Research faster. One document, one conversation.
  p.text-sm.text-text-muted
    | No quotas, no signup, no catch.
```

---

### 2. CTA Extension (nouveau, proéminent)

**Nouveau bloc à ajouter après le hero :**
```pug
section.mb-6.text-center
  a.inline-flex.items-center.gap-2.bg-red-600.hover_bg-red-700.text-white.px-6.py-3.rounded-lg.text-base.font-medium(
    href="[CHROME_EXTENSION_URL]"
    target="_blank"
  )
    //- Icône Chrome ou puzzle
    svg.w-5.h-5(fill="currentColor" viewBox="0 0 24 24")
      //- Icon SVG ici
    | Install Chrome Extension

  p.mt-2.text-xs.text-text-muted
    | Works on YouTube, articles, web pages
```

---

### 3. Séparateur "or paste URLs"

**Nouveau :**
```pug
.flex.items-center.gap-4.my-6
  .flex-1.border-t.border-border-default
  span.text-sm.text-text-muted or paste URLs below
  .flex-1.border-t.border-border-default
```

---

### 4. Formulaire (inchangé mais repositionné)

Le formulaire reste identique mais vient après le CTA extension.

---

### 5. Logos LLMs supportés (nouveau)

**Après le formulaire :**
```pug
.mt-6.text-center
  p.text-xs.text-text-muted.mb-2 Works with
  .flex.justify-center.gap-4.flex-wrap
    span.text-sm.text-text-secondary Claude
    span.text-sm.text-text-secondary ChatGPT
    span.text-sm.text-text-secondary Gemini
    span.text-sm.text-text-secondary Perplexity
    span.text-sm.text-text-secondary Grok
    span.text-sm.text-text-secondary Copilot
```

---

### 6. Section Use Cases (nouvelle)

**Nouveau bloc :**
```pug
section.py-8.border-t.border-border-strong
  h2.text-xl.font-semibold.mb-6 What can you do?

  .grid.grid-cols-1.md_grid-cols-2.gap-4
    .flex.gap-3
      span.text-2xl 📺
      div
        p.font-medium.text-text-primary Summarize a 2-hour podcast
        p.text-sm.text-text-muted Get key points in 30 seconds

    .flex.gap-3
      span.text-2xl 🔬
      div
        p.font-medium.text-text-primary Research a topic
        p.text-sm.text-text-muted Combine 5 videos into one briefing

    .flex.gap-3
      span.text-2xl 🛒
      div
        p.font-medium.text-text-primary Compare products
        p.text-sm.text-text-muted Aggregate reviews before buying

    .flex.gap-3
      span.text-2xl 📝
      div
        p.font-medium.text-text-primary Turn recordings into notes
        p.text-sm.text-text-muted Meeting summaries, actionable items
```

---

### 7. Section "Why toyour.ai?" (réécrite)

**Avant :**
```pug
section.py-8.border-t.border-border-strong
  h2.text-xl.font-semibold.mb-4 Why?
  ul.space-y-2.text-text-secondary
    li No awkward integrated chat — just use your tools
    li Works with any assistant
    li Easy to share
```

**Après :**
```pug
section.py-8.border-t.border-border-strong
  h2.text-xl.font-semibold.mb-6 Why toyour.ai?

  .space-y-4
    .flex.gap-3
      span.text-green-500.font-bold ✓
      div
        p.font-medium.text-text-primary Combine up to 10 sources into one document
        p.text-sm.text-text-muted Others let you process one video at a time.

    .flex.gap-3
      span.text-green-500.font-bold ✓
      div
        p.font-medium.text-text-primary Opens directly in YOUR assistant
        p.text-sm.text-text-muted No integrated chat. No copy-paste. Just Claude, ChatGPT, or any AI.

    .flex.gap-3
      span.text-green-500.font-bold ✓
      div
        p.font-medium.text-text-primary Works with any AI
        p.text-sm.text-text-muted Claude, ChatGPT, Gemini, Perplexity, Grok, Copilot — or copy anywhere.

    .flex.gap-3
      span.text-green-500.font-bold ✓
      div
        p.font-medium.text-text-primary 100% free, no quotas
        p.text-sm.text-text-muted No "10 messages per day" limit. No monthly quota. No catch.

    .flex.gap-3
      span.text-green-500.font-bold ✓
      div
        p.font-medium.text-text-primary Shareable collections
        p.text-sm.text-text-muted Send a link to share your research with anyone.
```

---

### 8. Section "How it works" (2 colonnes)

**Avant :**
```pug
section.py-8.border-t.border-border-strong
  h2.text-xl.font-semibold.mb-4 How it works
  ol.space-y-2.text-text-secondary.list-decimal.list-inside
    li Paste URLs (pages, videos, articles)
    li Get a clean markdown compilation
    li Open it in your AI
```

**Après :**
```pug
section.py-8.border-t.border-border-strong
  h2.text-xl.font-semibold.mb-6 How it works

  .grid.grid-cols-1.md_grid-cols-2.gap-8
    //- Extension flow
    div
      h3.font-medium.text-text-primary.mb-3
        span.text-red-600 ⬤
        |  With the extension
        span.text-xs.ml-2.text-text-muted (recommended)
      ol.space-y-2.text-text-secondary.list-decimal.list-inside
        li Browse YouTube or any website
        li Click the toyour.ai button
        li Choose "Open in Claude" (or ChatGPT, Gemini...)
      p.mt-2.text-sm.text-green-600 → Your AI receives the content instantly

    //- Website flow
    div
      h3.font-medium.text-text-primary.mb-3
        span.text-text-muted ⬤
        |  From this page
      ol.space-y-2.text-text-secondary.list-decimal.list-inside
        li Paste up to 10 URLs (videos, articles, pages)
        li Click "Extract & Combine"
        li Open the result in your favorite AI
      p.mt-2.text-sm.text-green-600 → Research multiple sources in one conversation
```

---

### 9. FAQ (révisée)

**Avant (4 questions) → Après (5 questions) :**

```pug
section.py-8.border-t.border-border-strong
  h2.text-xl.font-semibold.mb-4 FAQ

  .space-y-4
    div
      h3.font-medium Is it really free?
      p.text-text-secondary
        | Yes. No trial, no freemium, no "10 messages per day" limit. Just free.

    div
      h3.font-medium Does it work with my AI?
      p.text-text-secondary
        | Yes. Claude, ChatGPT, Gemini, Perplexity, Grok, Copilot — or copy the content anywhere.

    div
      h3.font-medium Can I combine multiple videos?
      p.text-text-secondary
        | Yes! Up to 10 videos, articles, or web pages in one document. That's what makes us different.

    div
      h3.font-medium Is my data private?
      p.text-text-secondary
        | Collections are accessible via their unique URL — only people with the link can see them. We don't store your AI conversations. Only you can edit or delete your collections.

    div
      h3.font-medium How does it work technically?
      p.text-text-secondary
        | We extract transcripts and content, combine them into clean markdown, and give you a URL. When you click "Open in Claude", your AI fetches that URL directly.
```

---

## Ordre final des sections dans landing.pug

```pug
extends layout

block content
  //- 1. Hero avec badge FREE + tagline
  section.mb-8.text-center
    //- Badge + H1 + sous-taglines (voir détail ci-dessus)

  //- 2. CTA Extension proéminent
  section.mb-6.text-center
    //- Bouton Install + texte (voir détail ci-dessus)

  //- 3. Séparateur
  .flex.items-center.gap-4.my-6
    //- "or paste URLs below"

  //- 4. Formulaire (existant)
  section.mb-8
    if error
      //- Gestion erreur existante
    form(action="/create" method="POST")
      //- textarea + bouton (existant)

  //- 5. Logos LLMs
  .text-center.mb-8
    //- Works with: Claude, ChatGPT... (voir détail)

  //- 6. Use cases
  section.py-8.border-t.border-border-strong
    //- 4 use cases avec emojis (voir détail)

  //- 7. Why toyour.ai?
  section.py-8.border-t.border-border-strong
    //- 5 points avec check marks (voir détail)

  //- 8. How it works (2 colonnes)
  section.py-8.border-t.border-border-strong
    //- Extension flow + Website flow (voir détail)

  //- 9. FAQ révisée
  section.py-8.border-t.border-border-strong
    //- 5 questions (voir détail)

  //- 10. Script popup (existant, inchangé)
  script.
    (function() { ... })();
```

---

## CSS additionnel potentiel

Si les classes Tailwind ne suffisent pas, ajouter dans `styles.css` :

```css
/* Badge gratuit animé (optionnel) */
.badge-free {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

/* Hover sur les use cases */
.use-case-card:hover {
  background: var(--color-surface-hover);
  border-radius: 0.5rem;
  transition: background 0.15s;
}
```

---

## Éléments optionnels à considérer

### GIF de démonstration

Si on veut ajouter un GIF de l'extension en action :

1. Créer le GIF (capture d'écran de YouTube → clic bouton → popup → Open in Claude)
2. L'héberger dans `server/src/public/` ou un CDN
3. L'insérer entre les logos LLMs et les use cases :

```pug
section.py-8.text-center
  img.mx-auto.rounded-lg.shadow-lg.max-w-md(
    src="/demo.gif"
    alt="toyour.ai extension demo"
  )
  p.text-sm.text-text-muted.mt-2 Click. Choose your AI. Done.
```

### Comparaison visuelle avec concurrents

Si on veut être plus agressif sur la différenciation :

```pug
section.py-8.border-t.border-border-strong
  h2.text-xl.font-semibold.mb-6 toyour.ai vs others

  .overflow-x-auto
    table.w-full.text-sm
      thead
        tr.text-left.text-text-muted
          th.pb-2.pr-4 Feature
          th.pb-2.pr-4 toyour.ai
          th.pb-2.pr-4 Others
      tbody.text-text-secondary
        tr
          td.py-2.pr-4 Multi-sources
          td.py-2.pr-4.text-green-500 ✓ Up to 10
          td.py-2.pr-4.text-red-400 ✗ 1 at a time
        tr
          td.py-2.pr-4 Your own AI
          td.py-2.pr-4.text-green-500 ✓ Opens directly
          td.py-2.pr-4.text-red-400 ✗ Integrated chat
        tr
          td.py-2.pr-4 Price
          td.py-2.pr-4.text-green-500 ✓ 100% free
          td.py-2.pr-4.text-red-400 ✗ Freemium / quotas
```

---

## Checklist d'implémentation

- [ ] Modifier `landing.pug` avec la nouvelle structure
- [ ] Tester le formulaire (popup doit toujours fonctionner)
- [ ] Tester sur mobile (responsive)
- [ ] Vérifier l'URL de l'extension Chrome
- [ ] (Optionnel) Créer le GIF de démo
- [ ] (Optionnel) Ajouter tableau comparatif
- [ ] Commit et déployer

---

## Résumé des changements de messaging

| Avant | Après |
|-------|-------|
| "A page, a video, a document... or dozens" | "Combine videos, pages, and articles. Send to your AI." |
| "Is it free? Yes." (FAQ cachée) | Badge "100% FREE" visible + "No quotas, no signup, no catch" |
| "Why?" (3 points génériques) | "Why toyour.ai?" (5 points avec comparaison concurrence) |
| Lien extension en petit | CTA extension proéminent |
| Pas de use cases | 4 use cases concrets avec emojis |
| "How it works" (1 flow) | "How it works" (2 colonnes: extension + website) |

---

*Document généré le 28/01/2026*
