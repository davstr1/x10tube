# Investigation: Passer le contenu directement au LLM

**Date:** 6 février 2026
**Objectif:** Évaluer la faisabilité de passer le contenu directement au LLM au lieu de demander au LLM de fetcher une URL.

---

## Contexte

Actuellement, le bouton "Open In [LLM]" génère une URL comme:
```
https://claude.ai/new?q=Fetch https://toyourai.plstry.me/s/abc123.txt
```

Le LLM doit ensuite fetcher cette URL pour accéder au contenu. Cette approche échoue parfois (Gemini hallucine, Perplexity en sandbox, ChatGPT ~10% d'échec).

**Question:** Pourrait-on passer le contenu directement ?

---

## Approche 1: Via paramètre URL GET

### Limites de longueur d'URL

### Limites navigateurs

| Navigateur | Limite technique | Limite pratique |
|------------|------------------|-----------------|
| Chrome | ~2 MB (2,097,152) | ~32,000 caractères |
| Safari | ~80,000 | ~2,000 (conflictuel) |
| Firefox | Illimité (théorique) | ~64,000 |
| Edge | ~2,083 | ~2,000 |
| **Dénominateur commun** | - | **~2,000 caractères** |

> **Note:** Pour une compatibilité maximale avec tous les navigateurs et serveurs, la limite sûre est de **2,000 caractères**.

### Sources
- [GeeksforGeeks - Maximum URL Length](https://www.geeksforgeeks.org/computer-networks/maximum-length-of-a-url-in-different-browsers/)
- [Baeldung - Max URL Length](https://www.baeldung.com/cs/max-url-length)

---

## Taille typique du contenu

### Transcription YouTube

Basé sur ~165 mots/minute (standard corporatif):

| Durée vidéo | Mots estimés | Caractères estimés |
|-------------|--------------|-------------------|
| 5 min | ~825 | ~4,500 |
| 10 min | ~1,650 | ~9,000 |
| 20 min | ~3,300 | ~18,000 |
| 60 min | ~9,900 | ~54,000 |

### Collection réelle

Test avec `https://toyourai.plstry.me/s/nLJO1gKT.txt`:
- **Taille:** ~18,500 caractères (1 vidéo de ~20 min)

### Collection typique (10 items)

- Estimation: **50,000 - 150,000+ caractères**
- Avec metadata et pré-prompt: encore plus

---

## Analyse de faisabilité

### ❌ Impossible via URL directe

| Critère | Limite URL | Contenu typique | Verdict |
|---------|-----------|-----------------|---------|
| 1 vidéo courte (5 min) | 2,000 | ~4,500 | ❌ Dépasse |
| 1 vidéo moyenne (10 min) | 2,000 | ~9,000 | ❌ Dépasse 4x |
| 1 vidéo longue (20 min) | 2,000 | ~18,000 | ❌ Dépasse 9x |
| Collection (10 items) | 2,000 | ~100,000 | ❌ Dépasse 50x |

**Conclusion:** Même une seule vidéo courte dépasse la limite URL sûre.

### Même avec limite Chrome étendue (~32KB)

Une collection de 10 items dépasserait toujours la limite.

---

---

## Approche 2: Injection via Content Script

### Concept

L'extension Chrome peut:
1. Stocker le contenu dans `chrome.storage`
2. Ouvrir un nouvel onglet vers le LLM
3. Le content script (déjà chargé sur tous les sites via `<all_urls>`) reçoit un message
4. Injecter le contenu directement dans le textarea du prompt

### Faisabilité technique

```javascript
// background.js - Ouvrir l'onglet et envoyer le message
const tab = await chrome.tabs.create({ url: 'https://claude.ai/new' });
// Attendre que la page soit chargée
chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
  if (tabId === tab.id && info.status === 'complete') {
    chrome.tabs.sendMessage(tabId, {
      action: 'injectContent',
      content: '... le contenu complet ...'
    });
    chrome.tabs.onUpdated.removeListener(listener);
  }
});

// content.js - Recevoir et injecter
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'injectContent') {
    const textarea = document.querySelector('textarea, [contenteditable]');
    if (textarea) {
      textarea.value = msg.content;
      // Simuler événement pour React
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});
```

### ✅ Avantages

| Avantage | Détail |
|----------|--------|
| Aucune limite de taille | 100K+ caractères OK |
| UX en un clic | L'utilisateur n'a rien à faire |
| Fonctionne partout | Tous les LLMs supportés |

### ❌ Problèmes majeurs

| Problème | Impact | Sévérité |
|----------|--------|----------|
| **Permissions intrusives** | Faudrait ajouter tous les domaines LLM dans `host_permissions`. L'utilisateur verra "Cette extension peut lire et modifier vos données sur claude.ai, chatgpt.com, gemini.google.com, x.com, perplexity.ai, copilot.microsoft.com" | 🔴 Critique |
| **React/Vue state** | Ces apps utilisent React. Modifier `textarea.value` directement ne met pas à jour l'état interne. Il faut simuler des événements (`input`, `change`) qui peuvent ne pas fonctionner | 🔴 Critique |
| **Sélecteurs fragiles** | Chaque LLM a un DOM différent: Claude utilise `ProseMirror`, ChatGPT un `textarea`, etc. Ces sélecteurs changent à chaque mise à jour UI | 🔴 Critique |
| **Maintenance lourde** | 6 LLMs × mises à jour fréquentes = beaucoup de travail de maintenance | 🟠 Élevé |
| **Timing issues** | Les SPAs comme Claude chargent le textarea dynamiquement. Faut attendre, mais combien de temps? | 🟠 Élevé |

### Sélecteurs requis (fragiles)

```javascript
const LLM_SELECTORS = {
  // Ces sélecteurs CHANGENT régulièrement !
  claude: '.ProseMirror[contenteditable="true"]',
  chatgpt: 'textarea[data-id="root"]', // ou #prompt-textarea
  gemini: 'rich-textarea', // Web component custom
  grok: 'textarea', // Inconnu, X change souvent
  perplexity: 'textarea[placeholder*="Ask"]',
  copilot: 'textarea#searchbox'
};
```

### Verdict Approche 2: ⚠️ FAISABLE MAIS RISQUÉ

- **Techniquement possible** avec le setup actuel (`<all_urls>` dans content_scripts)
- **Mais très fragile** et nécessite une maintenance constante
- **Privacy concern** majeur avec les permissions étendues

---

## Approches alternatives

### 1. 📋 Clipboard API (Presse-papier)

**Concept:** Copier le contenu dans le presse-papier, puis ouvrir le LLM.

```javascript
// Pseudo-code
await navigator.clipboard.writeText(content);
window.open('https://claude.ai/new');
// User doit coller manuellement (Ctrl+V)
```

**Avantages:**
- Aucune limite de taille
- Fonctionne avec tous les LLMs
- Contournement garanti

**Inconvénients:**
- Nécessite action utilisateur (coller)
- UX dégradée vs "un clic et c'est parti"
- Écrase le presse-papier existant

**Verdict:** ⚠️ Possible mais dégrade l'UX

### 2. 🔗 Data URI (base64)

**Concept:** Encoder le contenu en base64 dans l'URL.

**Problème:** Augmente la taille de ~33% (base64 overhead). Si 18KB → 24KB. Toujours trop grand.

**Verdict:** ❌ Aggrave le problème

### 3. 📤 Partage via API native

**Concept:** Utiliser `navigator.share()` pour partager vers l'app LLM.

**Problème:**
- Les LLMs n'ont pas d'apps mobiles qui acceptent le partage de texte brut
- Ne fonctionne pas sur desktop

**Verdict:** ❌ Non applicable

### 4. 💾 Stockage temporaire + URL courte

**Concept:** Stocker le contenu côté serveur, générer une URL courte.

**Réalité:** C'est exactement ce qu'on fait déjà avec `/s/{id}.txt`.

**Verdict:** ✅ Solution actuelle

---

## Paramètres URL des LLMs

| LLM | URL Pattern | Paramètre | Limite documentée |
|-----|-------------|-----------|-------------------|
| Claude | `claude.ai/new?q=` | `q` | Non documenté |
| ChatGPT | `chat.openai.com/?q=` | `q` | Non documenté |
| Gemini | `google.com/search?udm=50&q=` | `q` | Non documenté |
| Grok | `x.com/i/grok?text=` | `text` | Non documenté |
| Perplexity | `perplexity.ai/search/?q=` | `q` | Non documenté |
| Copilot | `copilot.microsoft.com/?q=` | `q` | Non documenté |

> **Note:** Aucun LLM ne documente officiellement une limite, mais tous sont limités par les contraintes URL navigateur.

---

## Recommandation finale

### Tableau récapitulatif

| Approche | Faisabilité | UX | Maintenance | Risque |
|----------|-------------|-----|-------------|--------|
| **URL GET param** | ❌ Non | - | - | - |
| **Injection Content Script** | ⚠️ Oui | ✅ 1 clic | 🔴 Lourde | 🔴 Élevé |
| **Clipboard + Coller** | ✅ Oui | ⚠️ 2 clics | ✅ Légère | 🟢 Faible |
| **URL Fetch (actuel)** | ✅ Oui | ✅ 1 clic | ✅ Légère | 🟢 Faible |

### Verdict: L'approche actuelle reste optimale

**Injection Content Script**: Techniquement possible mais **déconseillée**:
- Permissions trop intrusives (accès aux sites LLM)
- Maintenance lourde (6 LLMs × changements UI fréquents)
- Fragilité des sélecteurs DOM
- Problèmes avec React state

**Solution actuelle (URL Fetch)** reste la meilleure:
- ✅ Fonctionne pour Claude, ChatGPT, Grok, Copilot (4/6 LLMs)
- ✅ Aucune permission supplémentaire requise
- ✅ Pas de maintenance des sélecteurs
- ✅ UX en un clic
- ⚠️ Gemini et Perplexity non supportés (problème côté LLM)

### Amélioration optionnelle pour Gemini/Perplexity

**Option "Copier le contenu"** dédiée:
1. Copie le contenu dans le presse-papier
2. Affiche un toast: "Contenu copié ! Collez-le dans [LLM]"
3. Ouvre le LLM dans un nouvel onglet

Avantage: Fonctionne pour TOUS les LLMs, y compris ceux qui ne fetchent pas.
Inconvénient: Action utilisateur supplémentaire (coller).

### Conclusion

L'injection via content script est **trop coûteuse en maintenance** et **trop risquée** (permissions, fragilité) pour un gain marginal. Garder l'approche actuelle et documenter les limitations pour Gemini/Perplexity.

---

## Sources

- [GeeksforGeeks - Maximum URL Length](https://www.geeksforgeeks.org/computer-networks/maximum-length-of-a-url-in-different-browsers/)
- [Baeldung - Max URL Length](https://www.baeldung.com/cs/max-url-length)
- [Word Count Tool - YouTube Transcripts](https://www.wordcounttool.com/blog/word-count/convert-youtube-videos-into-text-that-you-can-measure)
- [OpenAI Community - Query Parameters](https://community.openai.com/t/query-parameters-in-chatgpt/1027747)
- [LLM Fetch Prompts](./llm-fetch-prompts.md) - Documentation interne
- [Chrome Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Chrome Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
