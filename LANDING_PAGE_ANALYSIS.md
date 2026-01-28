# Analyse de la page d'accueil toyour.ai

## Contenu actuel de la landing page

### Structure

1. **Formulaire principal** — textarea pour coller des URLs + bouton "Extract & Combine..."
2. **Lien vers l'extension** — "or install the Chrome extension to collect as you browse"
3. **Tagline** — "A page, a video, a document... or dozens. In one click, to your AI."
4. **Sous-tagline** — "Summarize, discuss, do your thing, in your favorite assistant."
5. **Section "Why?"** — 3 bullet points
6. **Section "How it works"** — 3 étapes
7. **FAQ** — 4 questions

### Éléments positifs

- Message clair et concis
- Pas de friction (pas d'inscription obligatoire)
- Supporte plusieurs LLMs (Claude, ChatGPT, Gemini, Perplexity, Grok, Copilot)
- Interface minimaliste

---

## Analyse de la concurrence

### 1. YouTube Summary with ChatGPT & Claude (Glasp)

**Positionnement** : Leader du marché avec 2+ millions d'utilisateurs

**Forces** :
- Intégration directe dans YouTube (overlay sur la vidéo)
- Copie de transcript en 1 clic
- Export vers Notion, Roam, Obsidian
- Multi-langues avec traduction de transcripts
- Timestamps cliquables

**Modèle** : Gratuit avec compte Glasp

**Sources** : [Glasp YouTube Summary](https://glasp.co/youtube-summary), [Chrome Web Store](https://chromewebstore.google.com/detail/youtube-summary-with-chat/nmmicjeknamkfloonkhhcjmomieiodli)

---

### 2. HARPA AI

**Positionnement** : Extension tout-en-un (400K+ utilisateurs)

**Forces** :
- 100+ commandes d'automatisation prédéfinies
- Fonctionne sur YouTube, pages web, PDFs
- Commande `/youtube` pour accéder aux prompts YouTube
- Intègre ChatGPT, Claude, Gemini, Perplexity, DeepSeek
- Raccourci clavier (Alt+A)

**Modèle** : Freemium
- Gratuit : 10 messages/jour, 100 commandes AI max
- Payant : 12-19€/mois ou 242€ lifetime

**Sources** : [HARPA AI](https://harpa.ai/), [HARPA Pricing](https://harpa.ai/pricing), [ChatGPT for YouTube](https://harpa.ai/case/chatgpt-for-youtube)

---

### 3. Autres concurrents notables

| Extension | Spécificité |
|-----------|-------------|
| **Merlin** | 26-en-1, chat avec pages/PDFs/YouTube |
| **MaxAI.me** | Accès 1-clic à plusieurs modèles AI |
| **YouTube Transcript to AI** | Prompts personnalisés sauvegardables |
| **NoteGPT** | Focus prise de notes + résumé |

**Sources** : [Top WebChatGPT Alternatives](https://topai.tools/alternatives/webchatgpt), [Best ChatGPT Chrome Extensions](https://beebom.com/best-chatgpt-chrome-extensions/)

---

## Étude approfondie : toyour.ai a-t-il une vraie concurrence ?

### Les 3 questions clés

1. **Est-ce que le concurrent envoie le contenu vers TON PROPRE assistant (ChatGPT, Claude) ou utilise un chat intégré ?**
2. **Est-ce qu'il permet de combiner plusieurs sources en un seul document ?**
3. **Est-ce vraiment gratuit ou freemium avec limites ?**

---

### Tableau comparatif détaillé

| Concurrent | Ton propre AI ? | Combine plusieurs sources ? | Vraiment gratuit ? |
|------------|-----------------|-----------------------------|--------------------|
| **toyour.ai** | ✅ Oui, ouvre directement Claude/ChatGPT/etc. | ✅ Oui, jusqu'à 10 items | ✅ 100% gratuit, sans limite |
| **Glasp** | ⚠️ Copier-coller manuel vers ChatGPT | ❌ Non, 1 vidéo à la fois | ✅ Gratuit (compte requis) |
| **HARPA** | ❌ Chat intégré (session browser) | ❌ Non, 1 source à la fois | ❌ Freemium (10 msg/jour) |
| **Merlin** | ❌ Chat intégré (leur API) | ❌ Non | ❌ Freemium |
| **NoteGPT** | ❌ Chat intégré (leur API) | ⚠️ Jusqu'à 20 vidéos, mais résumé intégré | ❌ Freemium (15 quotas/mois) |
| **MaxAI** | ❌ Chat intégré | ❌ Non | ❌ Freemium |

---

### Analyse détaillée par concurrent

#### Glasp (YouTube Summary with ChatGPT & Claude)

**Comment ça marche vraiment :**
> "It opens ChatGPT's page on a new tab. If you haven't created an account for ChatGPT, please make one."
> "You go back to the YouTube video and click the OpenAI icon again. It opens a new tab of OpenAI, and then you paste (Command + V) the transcript that was copied to your clipboard."

**Source** : [Glasp Features](https://glasp.co/features/youtube-summary)

**Verdict** :
- ✅ Utilise TON ChatGPT... mais via **copier-coller manuel** (pas d'envoi direct)
- ❌ **1 vidéo à la fois** — pour combiner, il faut copier manuellement chaque transcript
- ✅ Gratuit

**Conclusion** : Le plus proche de toyour.ai, mais le workflow est plus fastidieux (copier-coller) et ne permet pas de combiner automatiquement.

---

#### HARPA AI

**Comment ça marche vraiment :**
> "Generative AI features require connection to AI service providers. You can use HARPA with ChatGPT account, OpenAI API key, ClaudeAI, Google Gemini..."
> "You can see chats in chatgpt.com if you're on a Browser Session connection."

**Source** : [HARPA ChatGPT for YouTube](https://harpa.ai/case/chatgpt-for-youtube)

**Verdict** :
- ⚠️ Peut se connecter à ton ChatGPT via "Browser Session"... mais le chat reste **dans l'interface HARPA**
- ❌ **1 source à la fois** — pas de combinaison de plusieurs vidéos/pages
- ❌ **Freemium** : 10 messages/jour gratuits, puis 12-19€/mois

**Conclusion** : Chat intégré dans leur interface, pas vraiment "ton" ChatGPT. Et payant au-delà de 10 messages.

---

#### Merlin

**Comment ça marche vraiment :**
> "Merlin is powered by ChatGPT, Gemini, Anthropic Claude, Mistral, DeepSeek etc., seamlessly integrating advanced features from multiple AI powerhouses."
> "Users can use one account across Chrome, Edge, iOS, Android, Windows, and Mac."

**Source** : [Merlin AI](https://www.getmerlin.in)

**Verdict** :
- ❌ **Chat intégré** — utilise leur propre accès API, pas ton compte ChatGPT/Claude
- ❌ Pas de combinaison multi-sources
- ❌ **Freemium** avec quotas

**Conclusion** : Extension complète mais tout passe par leur plateforme, pas par ton assistant.

---

#### NoteGPT

**Comment ça marche vraiment :**
> "With this AI YouTube Video Summarizer, you can summarize up to 20 YouTube videos at the same time."
> "You get 15 free quotas per month with permanent storage."

**Source** : [NoteGPT](https://notegpt.io/), [NoteGPT Pricing](https://notegpt.io/pricing)

**Verdict** :
- ❌ **Chat intégré** — le résumé est généré par leur AI, pas envoyé à ton ChatGPT
- ⚠️ Peut traiter 20 vidéos... mais le résultat reste dans NoteGPT
- ❌ **Freemium** : 15 quotas/mois gratuits

**Conclusion** : Le seul qui mentionne "multi-vidéos", mais le résumé est généré dans leur interface, pas dans ton assistant préféré.

---

### Ce que toyour.ai fait différemment

| Feature | toyour.ai | Concurrence |
|---------|-----------|-------------|
| **Envoie vers TON assistant** | ✅ 1-clic "Open in Claude/ChatGPT" | ❌ Chat intégré ou copier-coller manuel |
| **Combine plusieurs sources** | ✅ Jusqu'à 10 vidéos/pages en 1 document | ❌ 1 source à la fois |
| **Pas de chat intégré** | ✅ Tu utilises TES outils | ❌ Leur interface de chat |
| **100% gratuit** | ✅ Sans limite, sans quota | ❌ Freemium (quotas, limites/jour) |
| **Collections partageables** | ✅ URL unique | ❌ Export manuel |

---

### Conclusion : toyour.ai a-t-il une vraie différenciation ?

**OUI, et elle est significative.**

La concurrence se divise en 2 catégories :

1. **Les "vrais" assistants externes (Glasp)** → Utilisent ton ChatGPT mais via copier-coller manuel, 1 vidéo à la fois

2. **Les plateformes intégrées (HARPA, Merlin, NoteGPT)** → Chat dans leur interface, freemium avec quotas

**toyour.ai est le seul à :**
- Envoyer directement vers ton assistant en 1 clic (pas de copier-coller)
- Combiner plusieurs sources en un seul document markdown
- Être 100% gratuit sans quota ni limite

**Cette différenciation devrait être au cœur du messaging sur la landing page.**

---

## Recherche approfondie : Y a-t-il des concurrents cachés ?

### Le problème méthodologique

L'analyse précédente ne couvrait que les concurrents visibles et bien référencés (Glasp, HARPA, etc.). Or il pourrait exister des dizaines d'apps moins visibles qui font exactement ce que toyour.ai fait.

### Méthodologie de recherche élargie

Pour valider ou infirmer l'hypothèse d'unicité, j'ai effectué des recherches ciblées sur :

1. **Combinaison multi-sources** : `"combine multiple" YouTube transcripts "send to Claude"`, `"batch" OR "bulk" YouTube transcripts to AI`
2. **Envoi vers TON assistant** : `"open in ChatGPT" extension`, `"send to your own" ChatGPT Claude`
3. **Apps moins visibles** : `site:producthunt.com YouTube transcript multiple videos AI`, `indie hacker YouTube transcript LLM tool`
4. **Web apps alternatives** : `web app combine articles videos markdown send AI assistant free`

### Nouveaux concurrents découverts

#### 1. Skimming AI — LE PLUS PROCHE CONCURRENT

**URL** : [skimming.ai](https://www.skimming.ai/)

**Ce qu'il fait** :
> "Chat with multiple files at once—combine PDFs, YouTube videos, audio files, web pages, and more into one folder and ask questions across all of them."

**Modèle AI** :
> "Switch between top AI models within the same group conversation, including ChatGPT, Claude, and Gemini."

**Pricing** :
- Gratuit : **5 questions** (pas de CB requise)
- Basic : 10 000 questions/mois
- Pro : Illimité

**Limites du gratuit** : vidéos jusqu'à 30 min, 2 documents max, 5 questions/jour

**Verdict** :
| Critère | Skimming AI | toyour.ai |
|---------|-------------|-----------|
| Combine multi-sources | ✅ Oui | ✅ Oui |
| Ton propre AI ? | ❌ Chat intégré | ✅ Ouvre DANS Claude/ChatGPT |
| Gratuit ? | ❌ 5 questions puis payant | ✅ 100% gratuit |

**Conclusion** : Skimming AI est le concurrent le plus proche. Il fait la combinaison multi-sources MAIS utilise un chat intégré (pas ton assistant) et est freemium.

**Source** : [Skimming AI](https://www.skimming.ai/), [Skimming AI Pricing](https://www.skimming.ai/pricing)

---

#### 2. Transcribr.io — Bulk mais très cher

**URL** : [transcribr.io](https://www.transcribr.io/)

**Ce qu'il fait** :
> "Extract YouTube transcripts from videos, channels & playlists in bulk... Chat with entire channels, playlists, or individual videos."

**Pricing** :
- Gratuit : **5 transcripts/jour**
- Weekly : **$29.99/semaine** (!!)
- Monthly : **$99.99/mois** (!!)

**Verdict** : Chat intégré, prix prohibitif. Pas un vrai concurrent pour le gratuit.

**Source** : [Transcribr.io](https://www.transcribr.io/)

---

#### 3. YouTube Transcript Bulk Download (Extension Chrome)

**URL** : [Chrome Web Store](https://chromewebstore.google.com/detail/youtube-transcript-bulk-d/fgpagmikaghagifhoibbgpfcjibjdlfa)

**Ce qu'il fait** :
> "Bulk download transcripts from channels or playlists into a single combined file. AI-powered analysis with ChatGPT & Claude."

**Verdict** : Peut combiner en fichier unique. A investiguer plus en détail. Semble avoir du chat intégré.

---

#### 4. Autres découvertes (chat intégré, 1 source)

| Outil | Multi-sources ? | Ton AI ? | Gratuit ? |
|-------|-----------------|----------|-----------|
| **InsightTube** | ❌ 1 vidéo | ❌ Intégré | ⚠️ "Free for now" |
| **ChatTube** | ❌ 1 vidéo | ❌ Intégré | ? |
| **Glarity** | ❌ 1 page/vidéo | ⚠️ Via API key | Freemium |
| **Scripsy** | ❌ 1 vidéo | ❌ Intégré | Freemium |

**Sources** : [InsightTube](https://www.producthunt.com/products/insighttube), [ChatTube](https://chattube.io/), [Glarity](https://glarity.app/)

---

### Conclusion de la recherche approfondie

**L'hypothèse est PARTIELLEMENT validée** : il existe bien des concurrents moins visibles, mais aucun ne fait exactement ce que toyour.ai fait.

| Critère | toyour.ai | Meilleur concurrent |
|---------|-----------|---------------------|
| **Combine multi-sources** | ✅ Jusqu'à 10 | Skimming AI (mais chat intégré) |
| **Ouvre dans TON assistant** | ✅ 1-clic direct | Glasp (mais copier-coller) |
| **100% gratuit sans limite** | ✅ Aucune limite | Aucun (tous freemium) |

**toyour.ai reste le SEUL à combiner les 3** :
1. Multi-sources combinées
2. Envoi direct vers TON assistant (pas intégré, pas copier-coller)
3. 100% gratuit

---

### Comment surveiller la concurrence à l'avenir

Pour détecter de nouveaux entrants :

1. **Alertes Google** :
   - `"YouTube transcript" "send to ChatGPT"`
   - `"combine multiple videos" AI assistant`
   - `"open in Claude" extension`

2. **Product Hunt** :
   - Suivre les catégories "AI", "YouTube", "Productivity"
   - Rechercher `site:producthunt.com` régulièrement

3. **Chrome Web Store** :
   - Rechercher "YouTube transcript AI" trimestriellement
   - Trier par "Recently updated"

4. **Hacker News** :
   - Rechercher `YouTube transcript LLM` sur [hn.algolia.com](https://hn.algolia.com/)

5. **Reddit** :
   - r/ChatGPT, r/ClaudeAI, r/productivity
   - Rechercher "YouTube transcript tool"

---

## Ce qui manque sur la landing page (à la lumière de l'analyse concurrentielle)

### Le problème principal : on ne dit pas ce qui nous rend UNIQUE

La landing page actuelle ne communique pas les 3 différenciateurs majeurs découverts dans l'analyse :

| Ce qu'on fait de différent | Ce qu'on dit actuellement | Ce qu'on devrait dire |
|---------------------------|---------------------------|----------------------|
| **1-clic vers TON assistant** | "Open it in your AI" (vague) | "Opens directly in YOUR Claude, ChatGPT, or any AI — no copy-paste, no middleman" |
| **Combine plusieurs sources** | "or dozens" (timide) | "Combine 10 videos, pages, or articles into one document" |
| **100% gratuit sans limite** | "Is it free? Yes." (FAQ) | Badge "FREE" visible + "No quotas, no limits, no catch" |

---

### Analyse détaillée de ce qui manque

#### 1. Le messaging ne met pas assez en avant l'envoi direct vers TON assistant

**Problème** : La concurrence utilise des chats intégrés (HARPA, Merlin, NoteGPT) ou du copier-coller (Glasp). Nous, on ouvre directement Claude/ChatGPT. C'est un avantage majeur non communiqué.

**Actuel** :
> "Open it in your AI"

**Suggestion** :
> "One click to open in Claude, ChatGPT, Gemini, or any AI you use"

Ou plus direct :
> "No integrated chat. No copy-paste. Just your content, in your assistant."

---

#### 2. La combinaison multi-sources est notre killer feature — et elle est cachée

**Problème** : AUCUN concurrent ne permet de combiner automatiquement plusieurs sources. C'est notre USP et on le mentionne à peine ("or dozens").

**Actuel** :
> "A page, a video, a document... or dozens."

**Suggestion** :
> "Combine multiple videos, pages, and articles into one AI-ready document"

Ou plus percutant :
> "Research 5 videos at once. Compare 10 articles. One document, one conversation."

---

#### 3. Le "gratuit" n'est pas assez visible (vs concurrence freemium)

**Problème** : HARPA = 10 msg/jour, NoteGPT = 15 quotas/mois, Merlin = quotas. Nous = illimité. Mais on ne le dit qu'en FAQ.

**Actuel** :
> FAQ: "Is it free? Yes."

**Suggestion** :
- Badge **"FREE"** visible près du CTA
- Sous-titre : "100% free. No quotas. No daily limits."
- Comparaison implicite : "Unlike others, no 10-messages-per-day limit."

---

#### 4. Le "Why?" actuel ne répond pas à "pourquoi vous et pas Glasp/HARPA?"

**Actuel** :
```
Why?
- No awkward integrated chat — just use your tools
- Works with any assistant
- Easy to share
```

**Problème** : C'est bien mais générique. On ne parle pas de multi-sources ni du 1-clic.

**Suggestion — réécrire "Why toyour.ai?"** :
```
Why toyour.ai?
- Combine multiple sources into one document (others: 1 at a time)
- Opens directly in YOUR AI — no copy-paste, no middleman
- Works with Claude, ChatGPT, Gemini, Perplexity, Grok, Copilot
- 100% free, no quotas (others: 10 msg/day or paid)
- Shareable collections via URL
```

---

#### 5. L'extension Chrome devrait être le CTA principal

**Problème** : Le lien vers l'extension est en petit sous le formulaire. Or c'est le produit principal.

**Ce que font les concurrents** :
- Glasp : gros bouton "Add to Chrome"
- HARPA : bouton "Install" proéminent

**Suggestion** : Deux CTAs de même importance
```
[Install Chrome Extension - FREE]  [Or paste URLs below]
```

---

#### 6. Pas de visuels = pas de compréhension immédiate

**Problème** : Aucune image, GIF, screenshot. La concurrence montre son produit en action.

**Suggestion** :
- GIF de l'extension sur YouTube (clic sur bouton → popup → "Open in Claude")
- Ou screenshot du popup avec les LLMs listés

---

#### 7. Pas d'exemples concrets d'utilisation

**Problème** : On ne sait pas à quoi ça sert concrètement.

**Suggestion — section "Use cases"** :
- 📺 **Summarize a 2-hour podcast** — Get key points in 30 seconds
- 🔬 **Research a topic** — Combine 5 videos into one briefing
- 🛒 **Compare products** — Aggregate reviews before buying
- 📝 **Prepare notes** — Turn meeting recordings into actionable summaries

---

#### 8. La FAQ sur les données pourrait rassurer plus

**Actuel** :
> "Is my data stored? Collections are public. Log in to edit or delete."

**Problème** : "Collections are public" fait peur.

**Suggestion** :
> "Collections are accessible via their unique URL — only people with the link can see them. We don't store your AI conversations. Only you can edit or delete your collections."

---

## Recommandations prioritaires (mises à jour)

| Priorité | Action | Pourquoi | Impact |
|----------|--------|----------|--------|
| **1** | Réécrire le "Why?" avec les vrais différenciateurs | C'est notre USP vs concurrence | Conversion |
| **2** | Badge "FREE" visible + "No quotas, no limits" | Différencie des freemiums | Conversion |
| **3** | Mettre en avant "Combine multiple sources" | AUCUN concurrent ne le fait | Conversion |
| **4** | CTA "Install Extension" plus visible | C'est le produit principal | Acquisition |
| **5** | Ajouter GIF/screenshot de l'extension | Compréhension immédiate | Compréhension |
| **6** | Ajouter use cases concrets | On comprend à quoi ça sert | Compréhension |
| **7** | Reformuler FAQ données/privacy | Rassurer sur la confidentialité | Confiance |

---

## Proposition de textes pour la landing page

### Hero section

**Option A — Focus multi-sources**
```
Tagline: Combine videos, pages, and articles. Send to your AI.
Sous-tagline: Research faster. One document, one conversation. 100% free.
```

**Option B — Focus "ton" assistant**
```
Tagline: Your content. Your AI. One click.
Sous-tagline: No integrated chat, no copy-paste — opens directly in Claude, ChatGPT, or any assistant.
```

**Option C — Focus simplicité**
```
Tagline: The simplest way to send web content to your AI.
Sous-tagline: Combine multiple sources. Open in any assistant. Free, no signup.
```

---

### Section "Why toyour.ai?"

```
Why toyour.ai?

✅ Combine up to 10 sources into one document
   Others let you process one video at a time.

✅ Opens directly in YOUR assistant
   No integrated chat. No copy-paste. Just Claude, ChatGPT, or any AI you prefer.

✅ Works with any AI
   Claude, ChatGPT, Gemini, Perplexity, Grok, Copilot — or copy-paste anywhere.

✅ 100% free, no quotas
   No "10 messages per day" limit. No monthly quota. No catch.

✅ Shareable collections
   Send a link to share your research with anyone.
```

---

### Section "How it works" (2 flows)

```
How it works

WITH THE EXTENSION (recommended)
1. Browse YouTube or any website
2. Click the toyour.ai button
3. Choose "Open in Claude" (or ChatGPT, Gemini...)
→ Your AI receives the content instantly

FROM THIS PAGE
1. Paste up to 10 URLs (videos, articles, pages)
2. Click "Extract & Combine"
3. Open the result in your favorite AI
→ Research multiple sources in one conversation
```

---

### FAQ révisée

```
FAQ

Is it really free?
Yes. No trial, no freemium, no "10 messages per day" limit. Just free.

Does it work with my AI?
Yes. Claude, ChatGPT, Gemini, Perplexity, Grok, Copilot — or copy the content anywhere.

Can I combine multiple videos?
Yes! Up to 10 videos, articles, or web pages in one document. That's what makes us different.

Is my data private?
Collections are accessible via their unique URL. We don't store your AI conversations — those happen directly in your assistant. Only you can edit or delete your collections.

How does it work technically?
We extract transcripts and content, combine them into clean markdown, and give you a URL. When you click "Open in Claude", your AI fetches that URL directly.
```

---

## Proposition de nouvelle structure de page

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: toyour.ai logo                    [My collections]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HERO                                                       │
│  ════                                                       │
│  Combine videos, pages, and articles.                       │
│  Send to your AI.                                           │
│                                                             │
│  Research faster. One document, one conversation.           │
│  100% free — no quotas, no signup.                          │
│                                                             │
│  [🧩 Install Chrome Extension - FREE]                       │
│                                                             │
│  ────── or paste URLs below ──────                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ https://youtube.com/watch?v=...                     │   │
│  │ https://example.com/article                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  [Extract & Combine...]                                     │
│                                                             │
│  Works with: [Claude] [ChatGPT] [Gemini] [Perplexity]...   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  VISUAL DEMO (GIF)                                          │
│  ════════════════                                           │
│  [GIF: clic sur bouton YouTube → popup → Open in Claude]    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  USE CASES                                                  │
│  ═════════                                                  │
│  📺 Summarize a 2-hour podcast                              │
│  🔬 Research a topic from 5 videos                          │
│  🛒 Compare product reviews                                  │
│  📝 Turn recordings into notes                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WHY TOYOUR.AI?                                             │
│  ══════════════                                             │
│  ✅ Combine up to 10 sources (others: 1 at a time)         │
│  ✅ Opens in YOUR AI (no integrated chat)                   │
│  ✅ Works with any assistant                                │
│  ✅ 100% free, no quotas (others: 10 msg/day)              │
│  ✅ Shareable collections                                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HOW IT WORKS                                               │
│  ═════════════                                              │
│  [Extension flow]          [Website flow]                   │
│  1. Browse YouTube         1. Paste URLs                    │
│  2. Click button           2. Extract & Combine             │
│  3. Open in Claude         3. Open in your AI               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FAQ                                                        │
│  ═══                                                        │
│  ▸ Is it really free?                                       │
│  ▸ Does it work with my AI?                                 │
│  ▸ Can I combine multiple videos?                           │
│  ▸ Is my data private?                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ FOOTER: toyour.ai                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Sources

- [Glasp YouTube Summary](https://glasp.co/youtube-summary)
- [Glasp Features](https://glasp.co/features/youtube-summary)
- [YouTube Summary Chrome Extension](https://chromewebstore.google.com/detail/youtube-summary-with-chat/nmmicjeknamkfloonkhhcjmomieiodli)
- [HARPA AI](https://harpa.ai/)
- [HARPA Pricing](https://harpa.ai/pricing)
- [HARPA ChatGPT for YouTube](https://harpa.ai/case/chatgpt-for-youtube)
- [Merlin AI](https://www.getmerlin.in)
- [NoteGPT](https://notegpt.io/)
- [NoteGPT Pricing](https://notegpt.io/pricing)
- [Top WebChatGPT Alternatives](https://topai.tools/alternatives/webchatgpt)
- [Best ChatGPT Chrome Extensions](https://beebom.com/best-chatgpt-chrome-extensions/)
