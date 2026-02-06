# Issue: Chrome Clipboard Permission Prompt

**Date:** 6 février 2026
**Statut:** En investigation

---

## Symptôme

Sur certains sites web (ex: h16free.com), Chrome affiche une popup de permission :

> **h16free.com wants to "see text and images copied to clipboard"**
> [Allow] [Block]

Cette popup interrompt le flow "Open in Gemini" et dégrade l'UX.

---

## Analyse

### Pourquoi cette popup apparaît ?

La popup est liée à l'API `navigator.clipboard`. Chrome distingue deux permissions :

| Permission | API | Prompt |
|------------|-----|--------|
| `clipboard-write` | `navigator.clipboard.writeText()` | Rarement (user gesture suffit) |
| `clipboard-read` | `navigator.clipboard.readText()` | Toujours |

**Hypothèses :**

1. **Le site lui-même demande l'accès** - h16free.com a peut-être du JS qui appelle `navigator.clipboard.read()` pour ses propres besoins
2. **Chrome agrège les permissions** - Si le site a déjà demandé clipboard-read, Chrome peut re-prompter
3. **Comportement récent de Chrome** - Les règles de permission clipboard évoluent fréquemment

### Pourquoi pas sur YouTube ?

YouTube est un "site de confiance" pour Chrome (Google property). Les permissions peuvent être gérées différemment.

---

## Solutions potentielles

### 1. Utiliser `execCommand('copy')` en priorité

`execCommand` ne déclenche **jamais** de popup de permission :

```typescript
function copyWithExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand('copy');
  document.body.removeChild(textarea);
  return success;
}
```

**Avantage :** Aucune popup, jamais.
**Inconvénient :** API deprecated (mais toujours supportée).

### 2. Inverser l'ordre des fallbacks

Actuellement proposé :
```
navigator.clipboard.writeText() → fallback execCommand
```

Alternative :
```
execCommand() → fallback navigator.clipboard.writeText()
```

Utiliser `execCommand` en premier évite la popup dans 100% des cas.

### 3. Permission `clipboardWrite` dans le manifest

```json
{
  "permissions": ["clipboardWrite"]
}
```

**Note :** Cette permission est normalement pour les service workers/background scripts, pas les content scripts. À tester si elle aide pour les content scripts.

### 4. Exécuter via le Background Script

Le background script (service worker) de l'extension a un contexte différent. On pourrait :

1. Content script envoie le texte au background
2. Background script fait le `clipboard.writeText()`
3. Background répond au content script

```typescript
// content.ts
chrome.runtime.sendMessage({ action: 'copyToClipboard', text: content });

// background.ts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'copyToClipboard') {
    navigator.clipboard.writeText(msg.text).then(() => {
      sendResponse({ success: true });
    });
    return true; // async response
  }
});
```

**Problème potentiel :** Le service worker n'a peut-être pas accès à `navigator.clipboard` sans fenêtre active.

---

## Recommandation

**Utiliser `execCommand('copy')` en premier**, pas en fallback.

Raisons :
- Aucune popup de permission
- Fonctionne dans tous les contextes
- Pas de contrainte de user activation (5s timeout)
- Supporté par tous les navigateurs

Le seul inconvénient (API deprecated) est théorique - les navigateurs ne peuvent pas la retirer sans casser des millions de sites.

---

## Questions ouvertes

1. La popup vient-elle du site h16free.com ou de notre extension ?
   - Test : Essayer sur un site minimal sans JS

2. La permission `clipboardWrite` dans le manifest aide-t-elle ?
   - Test : Ajouter et re-tester

3. Le background script peut-il faire le clipboard write ?
   - Test : Implémenter et vérifier

---

## Références

- [Chrome Clipboard Permission](https://developer.chrome.com/docs/extensions/reference/permissions/)
- [Clipboard API Permissions](https://web.dev/async-clipboard/)
- [MDN - Clipboard API Security](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#security_considerations)
