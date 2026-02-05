# Production Readiness Review - x10tube MVP

*Revue effectuée le 4 février 2026*

## Résumé

Le projet est à un niveau **modéré-à-bon** de préparation pour la production. L'architecture est sensée (extraction frontend pour éviter le rate-limiting), mais il y a des **problèmes critiques qui pourraient causer des crashes ou des pertes de données pendant la démo/lancement**.

**Niveau de risque: ÉLEVÉ pour les erreurs non gérées; MOYEN pour l'architecture**

---

## 🔴 Priorité 1 — À faire MAINTENANT

### 1.1 Pas de gestionnaire d'erreurs global Express

**Risque:** Le serveur crash sur les rejections de promesses non gérées.

Les routes async ne sont pas wrappées dans try-catch :
```typescript
// x10Router.get('/:id', async (req, res) => {  // PAS de try-catch!
  const collection = await getCollectionById(id);  // Si ça échoue → crash
})
```

**Fix:** Ajouter un middleware d'erreur Express :
```typescript
// À la fin de index.ts, avant app.listen()
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

### 1.2 Connexion Supabase non validée au démarrage

**Risque:** Le serveur démarre mais l'API échoue immédiatement.

**Fix:** Ajouter un health check au démarrage :
```typescript
async function startup() {
  try {
    await supabase.from('collections').select('id').limit(1);
    console.log('[Startup] Supabase connected');
  } catch (error) {
    console.error('[Startup] Supabase unreachable:', error);
    process.exit(1);
  }
}
startup().then(() => app.listen(PORT));
```

### 1.3 Vérification ownership incomplète sur DELETE collection

**Risque:** Un utilisateur anonyme peut supprimer la collection d'un autre.

```typescript
// routes/api.ts - la vérification actuelle:
if (collection.user_id !== userId) {  // ⚠️ Ne vérifie PAS anonymous_id!
  return res.status(403).json({ error: 'Not authorized' });
}
```

**Fix:**
```typescript
if (collection.user_id !== userId && collection.anonymous_id !== req.anonymousId) {
  return res.status(403).json({ error: 'Not authorized' });
}
```

### 1.4 Handlers unhandledRejection manquants

**Risque:** Le serveur crash silencieusement.

**Fix:** Ajouter dans index.ts :
```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});
```

---

## 🟠 Priorité 2 — Avant le lancement

### 2.1 Pas de rate limiting sur `/sync`

**Risque:** Quelqu'un peut brute-force les user codes.

**Fix:** Utiliser `express-rate-limit` :
```bash
npm install express-rate-limit
```

### 2.2 Pas de timeout sur l'extraction YouTube

**Risque:** L'UI freeze indéfiniment si YouTube ne répond pas.

Le fichier `extension/src/lib/innertube.ts` n'a pas de timeout contrairement à `jina.ts` qui en a un de 30s.

**Fix:** Ajouter un AbortController comme pour Jina.

### 2.3 Pas de validation des tailles de champs

**Risque:** Des champs géants peuvent corrompre la DB.

Champs sans limite de taille :
- `title` — pourrait être 1MB
- `pre_prompt` — pas de limite sur PATCH /settings/pre-prompt

**Fix:** Ajouter des validations de longueur max.

### 2.4 Race condition sur l'ajout à une collection

**Risque:** Double-clic rapide = item dupliqué.

La vérification de doublon se fait côté client, pas en base de données.

**Fix:** Ajouter une contrainte unique sur `(collection_id, youtube_id)` ou `(collection_id, url)` dans Supabase.

---

## 🟡 Priorité 3 — Nice to have

### 3.1 Clé InnerTube hardcodée (PUBLIC)

```typescript
// extension/src/lib/innertube.ts
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
```

C'est acceptable car c'est une clé browser-facing publique. Google l'autorise. Mais si elle est abusée, Google peut la bloquer.

### 3.2 Cookie avec durée de vie très longue

```typescript
maxAge: 365 * 24 * 60 * 60 * 1000  // 1 an
```

Acceptable pour un MVP anonyme-first.

### 3.3 Pas de logging structuré

Seulement `console.log()`. Acceptable pour MVP mais difficile à debugger en prod.

---

## ✅ Ce qui fonctionne bien

| Aspect | Status | Notes |
|--------|--------|-------|
| Architecture extraction frontend | ✅ | Évite le rate-limiting, design intelligent |
| Système utilisateur anonyme | ✅ | Cookie httpOnly, fallback cache, sync cross-device |
| Migration Supabase | ✅ | Types propres, pas d'injection SQL |
| Gestion context invalidation | ✅ | Helpers `safeStorage*` gracieux |
| Validation contenu serveur | ✅ | Limite 500KB, détection doublons |
| CORS global | ✅ | Géré avant body-parser |

---

## 📋 Checklist avant le lancement

### Critique
- [ ] Ajouter middleware d'erreur Express
- [ ] Ajouter health check Supabase au démarrage
- [ ] Fixer vérification anonymous_id sur DELETE
- [ ] Ajouter handler unhandledRejection
- [ ] Tester avec Supabase down/lent

### Important
- [ ] Ajouter rate limiting sur /sync
- [ ] Ajouter timeout extraction YouTube
- [ ] Valider tailles des champs input
- [ ] Tester avec 10+ utilisateurs simultanés

### Documentation
- [ ] Créer DEPLOY.md
- [ ] Compléter .env.example avec commentaires

---

## 🎯 Risques spécifiques pendant la démo

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Erreur Supabase | Moyenne | Crash serveur | Health check au démarrage |
| Crash async handler | Haute | Serveur down | Middleware d'erreur |
| Rate limit YouTube | Faible | Extraction échoue | Utiliser exemples pré-extraits |
| Timeout réseau | Moyenne | UI freeze | Avoir hotspot backup |

**Recommandation:** Tester le flow complet 10 fois avant la démo. Avoir des collections pré-chargées en backup.

---

## Verdict final

| Critère | Score |
|---------|-------|
| Architecture | 🟢 Bon |
| Gestion d'erreurs | 🔴 À améliorer |
| Sécurité | 🟡 Acceptable MVP |
| Intégrité données | 🟡 Quelques races |
| Maintenabilité | 🟢 Bon |

**Prêt pour démo MVP:** ⚠️ **OUI, avec les fixes Priorité 1**

**Temps estimé pour Priorité 1:** ~2 heures
**Temps estimé pour Priorité 2:** ~4 heures
