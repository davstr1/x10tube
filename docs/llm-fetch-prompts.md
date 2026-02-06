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

**Status:** ❌ Non fiable (hallucine ou refuse)

**Problème:** Gemini est très inconsistant pour le fetch d'URLs:
- Parfois hallucine le contenu au lieu de le chercher
- Parfois refuse avec "I am sorry, but I am unable to browse the provided URL"
- Fonctionne aléatoirement selon les URLs (Wikipedia OK, autres sites aléatoire)

**Prompts testés (résultats inconsistants):**
```
Use your Browse Tool to read this URL: https://toyourai.plstry.me/s/{id}.txt
```

```
Summarize the content at this URL: https://toyourai.plstry.me/s/{id}.txt
```

> ⚠️ **Problème connu:**
> - Le "URL Context" de Gemini est bugué dans l'interface web consumer
> - Fonctionne mieux via l'API avec `tools=[{"url_context": {}}]`
> - Pas de fix officiel annoncé par Google

**Workaround:** Copier-coller le contenu manuellement dans Gemini au lieu de donner l'URL.

**Sources:**
- [Does URL context even work?](https://discuss.ai.google.dev/t/does-url-context-even-work-can-you-fix-it/91770)
- [Why has Gemini lost its ability to read web links?](https://discuss.ai.google.dev/t/why-has-gemini-lost-its-ability-to-read-web-links/49775)

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
| ChatGPT | ✅ | `.txt` uniquement | `Fetch {URL}` |
| Gemini | ❌ | N/A | Non fiable - copier-coller le contenu |
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
