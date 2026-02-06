# Issue: Clipboard "Document is not focused" Error

**Date:** 6 février 2026
**Statut:** Analysé, solution proposée

---

## Symptôme

```
NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Document is not focused.
```

- **Fonctionne :** YouTube
- **Échoue :** Pages web (ex: h16free.com)
- **Workaround temporaire :** Reload la page et réessayer

---

## Cause racine : User Activation Expiration

Quand l'utilisateur clique, Chrome accorde une **"transient user activation"** qui expire après ~5 secondes. C'est un timer interne du navigateur (hardcodé dans Chromium).

### Timeline du problème

```
T+0.0s  → User clique sur "Open in Gemini"
         → Chrome: user activation = true (expire dans 5s)

T+0.1s  → closeDropdown()
T+0.2s  → createX10WithExtraction() démarre
         → Appel serveur → Jina Reader (attente...)

T+6.0s  → Jina répond (était lent)
T+6.1s  → fetch(txtUrl)
T+6.3s  → clipboard.writeText() → ❌ FAIL (activation expirée à T+5.0s)
```

### Pourquoi YouTube fonctionne ?

| Source | Extraction | Délai total |
|--------|-----------|-------------|
| YouTube | Transcript local (innertube) | ~1s |
| Web page | Jina Reader | 3-8s |

YouTube reste sous les 5 secondes, les pages web peuvent dépasser.

---

## Problème secondaire : Error handling silencieux

L'erreur s'affiche dans la console mais pas à l'utilisateur. Le `catch` block appelle `showToast()` mais soit :
- Le toast n'est pas visible
- Le message d'erreur technique n'est pas user-friendly

---

## Solution proposée (pérenne)

### 1. Utilitaire clipboard robuste avec fallback

```typescript
async function copyToClipboard(text: string): Promise<{ success: boolean; error?: string }> {
  // Essai 1: API moderne
  try {
    await navigator.clipboard.writeText(text);
    return { success: true };
  } catch (e) {
    console.warn('[STYA] clipboard.writeText failed, trying fallback:', e);
  }

  // Essai 2: Fallback execCommand (deprecated mais permissif)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (success) return { success: true };
  } catch (e) {
    console.warn('[STYA] execCommand fallback failed:', e);
  }

  return { success: false, error: 'clipboard_unavailable' };
}
```

**Note sur `execCommand('copy')` :**
- Aucune permission supplémentaire requise
- Autorisé par Chrome et le Chrome Web Store
- Marqué "deprecated" mais toujours supporté par tous les navigateurs
- Plus permissif : pas de contrainte de user activation

### 2. UX de récupération si les deux méthodes échouent

Si même le fallback échoue, montrer un **modal de récupération** :

```typescript
function showClipboardFailureModal(content: string, llmType: string): void {
  // Modal avec:
  // - Le contenu dans un textarea (sélectionnable manuellement)
  // - Un bouton "Copy" (fresh user activation au clic)
  // - Un bouton "Open [LLM] anyway"
  // - Message explicatif user-friendly
}
```

### 3. Flow révisé

```typescript
async function handleClipboardOnlyLLM(url: string, llmType: string): Promise<void> {
  showToast('Creating collection...', '');
  closeDropdown();

  try {
    const result = await api.createX10WithExtraction(url, true);
    if (!result.success) {
      showToast(`Error: ${result.error}`, 'error');
      return;
    }

    const txtUrl = `${api.baseUrl}/s/${result.x10Id}.txt`;
    showToast('Fetching content...', '');

    const response = await fetch(txtUrl);
    const txtContent = await response.text();

    // Utiliser l'utilitaire robuste
    const clipResult = await copyToClipboard(txtContent);

    if (clipResult.success) {
      window.open(LLM_CLIPBOARD_URLS[llmType], '_blank');
      showToastWithIcon(`${CLIPBOARD_ICON}Content copied — paste it!`, 'success');
    } else {
      // Clipboard a échoué → montrer modal de récupération
      showClipboardFailureModal(txtContent, llmType);
    }
  } catch (error) {
    // Erreur réseau/serveur → toast d'erreur user-friendly
    const msg = error instanceof Error ? error.message : 'Unknown error';
    showToast(`Error: ${msg}`, 'error');
  }
}
```

### Résultat attendu

- **99% des cas** → le fallback `execCommand` fonctionne
- **1% restant** → l'utilisateur a un modal avec bouton Copy (fresh activation) + contenu visible

---

## Références

- [HTML Spec - User Activation](https://html.spec.whatwg.org/multipage/interaction.html#transient-activation)
- [MDN - Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [MDN - execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand)
