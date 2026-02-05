# Open in LLM: Auto-Submit du Prompt

## État Actuel

Quand on clique "Open in Claude" (ou autre LLM), l'extension:
1. Crée un x10 avec la vidéo courante
2. Ouvre l'URL du LLM avec le prompt en query parameter
3. Le comportement dépend du LLM (voir tableau ci-dessous)

```javascript
const LLM_URLS = {
  claude: (prompt) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
  chatgpt: (prompt) => `https://chat.openai.com/?q=${encodeURIComponent(prompt)}`,
  gemini: (prompt) => `https://www.google.com/search?udm=50&aep=11&q=${encodeURIComponent(prompt)}`,
  perplexity: (prompt) => `https://www.perplexity.ai/search/?q=${encodeURIComponent(prompt)}`,
  grok: (prompt) => `https://x.com/i/grok?text=${encodeURIComponent(prompt)}`,
  copilot: () => `https://copilot.microsoft.com/`
};
```

## État par LLM (testé en production)

### Claude — ✅ Fonctionne
- `?q=` pré-remplit le prompt
- Fonctionne correctement
- **Rien à changer**

### ChatGPT — ✅ Fonctionne
- `?q=` passe le prompt correctement
- **Rien à changer**

### Gemini — ✅ Fonctionne + Auto-submit
- L'URL Google Search avec `udm=50` redirige vers Gemini
- Le prompt est envoyé automatiquement
- **Rien à changer**

### Perplexity — ✅ Auto-submit natif
- `?q=` lance la recherche immédiatement
- **Rien à changer**

### Grok — ✅ Fonctionne + Auto-submit
- `?text=` passe le prompt et l'envoie
- **Rien à changer**

### Copilot — ❌ BUG: paramètre manquant
- `?q=` auto-submit fonctionne chez Copilot
- **BUG ACTUEL:** Notre code ne passe pas le prompt !
  ```javascript
  copilot: () => `https://copilot.microsoft.com/`  // ← Pas de prompt!
  ```
- **Fix:** Ajouter `(prompt)` et `?q=${encodeURIComponent(prompt)}`

---

## Résumé

| LLM | État actuel | Auto-submit? | Action requise |
|-----|-------------|-------------|----------------|
| Claude | ✅ Fonctionne | Pré-rempli | Aucune |
| ChatGPT | ✅ Fonctionne | Oui | Aucune |
| Gemini | ✅ Fonctionne | Oui | Aucune |
| Perplexity | ✅ Fonctionne | Oui | Aucune |
| Grok | ✅ Fonctionne | Oui | Aucune |
| Copilot | ❌ Bug | Non (pas de prompt) | Ajouter `?q=` |

## Seul fix nécessaire

```javascript
// Avant (bug):
copilot: () => `https://copilot.microsoft.com/`

// Après (fix):
copilot: (prompt) => `https://copilot.microsoft.com/?q=${encodeURIComponent(prompt)}`
```

C'est le seul changement à faire. Tous les autres LLMs fonctionnent correctement avec les URLs actuelles.
