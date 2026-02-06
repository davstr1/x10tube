# How to Make LLMs Actually Fetch URLs

Guide pour que chaque LLM récupère vraiment le contenu d'une URL au lieu d'halluciner.

**URL de test:** `https://toyourai.plstry.me/s/{id}.txt`

> **Note:** L'extension `.md` n'est pas supportée par ChatGPT. Utiliser `.txt` à la place.

---

## Claude

**Status:** ✅ Fonctionne parfaitement

**Prompt:**
```
Fetch https://toyourai.plstry.me/s/{id}.txt
```

Claude récupère automatiquement le contenu et l'analyse.

---

## ChatGPT

**Status:** ⚠️ Fonctionne avec `.txt` (pas `.md`)

**Prompt:**
```
Fetch https://toyourai.plstry.me/s/{id}.txt
```

> ⚠️ **Important:** ChatGPT ne supporte PAS l'extension `.md`. Utiliser `.txt`.

**Alternative - Agent Mode:**
Si le browsing tool échoue, utiliser le mode Agent qui utilise un vrai navigateur Chrome.

---

## Gemini

**Status:** ⚠️ Nécessite un prompt spécifique

**Problème:** Gemini a tendance à halluciner le contenu au lieu de vraiment le chercher.

**Solution:** Utiliser le terme **"Browse Tool"** (pas "URL Context") car c'est le nom interne que Gemini utilise.

**Prompts recommandés:**
```
Use your Browse Tool to read this URL and summarize: https://toyourai.plstry.me/s/{id}.txt
```

```
First, use the Browse Tool to fetch the content at https://toyourai.plstry.me/s/{id}.txt, then analyze it.
```

```
Browse this URL and extract the key information: https://toyourai.plstry.me/s/{id}.txt
```

> ⚠️ **Important:**
> - Utiliser "Browse Tool" et non "URL Context"
> - Inclure l'URL complète avec `https://`
> - Gemini supporte: HTML, PDF, images (PNG, JPEG), JSON, XML, CSV, TXT

**Source:** [How to Correctly Reference Gemini's URL Context Tool](https://medium.com/@l0_0is/how-to-correctly-reference-geminis-url-context-tool-a-tip-for-better-context-engineering-3a285331f3cd)

---

## Perplexity

**Status:** ❓ À tester

**Prompt:**
```
Fetch https://toyourai.plstry.me/s/{id}.txt
```

Perplexity est conçu pour la recherche web, devrait fonctionner nativement.

---

## Grok

**Status:** ✅ Fonctionne

**Prompt:**
```
Fetch https://toyourai.plstry.me/s/{id}.txt
```

Grok récupère le contenu sans problème.

---

## Copilot

**Status:** ✅ Fonctionne

**Prompt:**
```
Fetch https://toyourai.plstry.me/s/{id}.txt
```

Copilot (Bing) récupère le contenu correctement.

---

## Résumé des Prompts

| LLM | Status | Extension | Prompt |
|-----|--------|-----------|--------|
| Claude | ✅ | `.txt` ou `.md` | `Fetch {URL}` |
| ChatGPT | ⚠️ | `.txt` uniquement | `Fetch {URL}` |
| Gemini | ⚠️ | `.txt` | `Use your Browse Tool to read {URL}` |
| Perplexity | ❓ | `.txt` | `Fetch {URL}` |
| Grok | ✅ | `.txt` | `Fetch {URL}` |
| Copilot | ✅ | `.txt` | `Fetch {URL}` |

## Notes

- Toujours utiliser `.txt` au lieu de `.md` pour une compatibilité maximale
- Certains LLMs nécessitent des prompts spécifiques pour forcer le fetch
- Le mode "Agent" de ChatGPT utilise un vrai navigateur et contourne les bugs du browsing tool
- Pour Gemini: utiliser "Browse Tool" (nom interne) et non "URL Context"

## Sources

- [URL Context - Gemini API](https://ai.google.dev/gemini-api/docs/url-context)
- [Gemini Browse Tool Tip](https://medium.com/@l0_0is/how-to-correctly-reference-geminis-url-context-tool-a-tip-for-better-context-engineering-3a285331f3cd)
- [Investigation ChatGPT 400 Error](./investigation-chatgpt-400-error.md)
