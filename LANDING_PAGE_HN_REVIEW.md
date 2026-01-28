# Review critique de la landing page — Perspective HN/Reddit

Ce document analyse la landing page avec les yeux d'un utilisateur Hacker News ou Reddit r/SideProject — sceptique, technique, allergique au marketing, et prêt à downvoter au moindre faux pas.

---

## Le problème fondamental

**La page actuelle ressemble à une landing page de startup SaaS.**

Or, tu lances un weekend project. Les audiences HN/Reddit détestent :
- Le marketing speak
- Les badges criards
- Les promesses exagérées
- Les comparaisons avec "les autres"
- L'auto-congratulation
- Les pages trop longues qui "vendent"

Ils respectent :
- La simplicité brutale
- L'honnêteté technique
- "Show don't tell"
- Le minimalisme
- L'humilité

---

## Éléments problématiques

### 1. Badge "100% FREE" en vert

**Problème** : Ça crie "marketing cheap". Les apps de qualité n'ont pas besoin de hurler qu'elles sont gratuites.

**Réaction HN probable** : "Red flag. Qu'est-ce qu'ils vendent vraiment ?" ou "Ça ressemble à une pub Facebook."

**Suggestion** : Supprimer le badge. Mentionner "free" une seule fois, discrètement, ou pas du tout — et le dire en FAQ si quelqu'un demande.

---

### 2. Emojis dans les use cases (📺🔬🛒📝)

**Problème** : Gimmicky. Ça fait "app pour grand public" ou "Product Hunt bait".

**Réaction HN probable** : "Emojis = pas sérieux" ou juste un œil qui roule.

**Suggestion** : Supprimer les emojis, ou supprimer toute la section use cases.

---

### 3. "No quotas, no signup, no catch"

**Problème** : Triple négation défensive. Ça sonne comme si tu anticipais qu'on te fasse pas confiance. C'est suspect.

**Réaction HN probable** : "Pourquoi ils insistent autant ? Il y a forcément un catch."

**Suggestion** : Ne rien dire. Ou juste "No account needed."

---

### 4. Section "Why toyour.ai?" avec checkmarks verts

**Problème** : C'est une section de vente. Les checkmarks verts + "Others do X, we do Y" = sales page classique.

**Réaction HN probable** : "C'est du marketing, pas de l'information."

**Points spécifiques toxiques** :
- "Others let you process one video at a time" → Attaque la concurrence sans la nommer = cheap shot
- "That's what makes us different" → Auto-congratulation
- "YOUR assistant" en majuscules → On dirait qu'on crie

**Suggestion** : Supprimer cette section entière, ou la réduire à 2-3 lignes factuelles sans comparaison.

---

### 5. "100% free" répété 3+ fois

**Problème** : Badge, hero, section Why, FAQ. C'est trop. Ça sent le désespoir.

**Réaction HN probable** : "OK on a compris, c'est gratuit. Mais pourquoi tu insistes autant ?"

**Suggestion** : Le dire UNE fois, dans la FAQ, si quelqu'un pose la question.

---

### 6. Section Use Cases

**Problème** : Hand-holding. Les utilisateurs HN sont assez intelligents pour comprendre les cas d'usage.

**Réaction HN probable** : "Ils me prennent pour un idiot ?" ou simplement ignoré.

**Suggestion** : Supprimer. Ou garder un seul exemple inline dans le hero.

---

### 7. Deux colonnes "How it works"

**Problème** : Charge cognitive. Deux flows différents = confusion.

**Réaction HN probable** : "C'est quoi le flow principal ? Pourquoi deux ?"

**Suggestion** : Un seul flow, le plus simple. L'extension peut être mentionnée en passant.

---

### 8. FAQ trop longue (5 questions)

**Problème** : C'est un weekend project, pas un SaaS enterprise. 5 questions de FAQ c'est trop.

**Réaction HN probable** : Personne ne lira.

**Suggestion** : 2 questions max, ou supprimer la FAQ.

---

### 9. Le nom "toyour.ai"

**Risque potentiel** : Quelqu'un pourrait demander "pourquoi ce nom ?" ou trouver que c'est un domaine cher pour un side project.

**Pas forcément un problème**, mais être prêt à répondre avec humilité ("c'était disponible").

---

### 10. La longueur totale

**Problème** : La page est LONGUE. Hero + CTA + Séparateur + Form + LLMs + Use Cases + Why + How + FAQ = trop de scroll.

**Réaction HN probable** : "TL;DR"

**Ce que HN veut voir** :
1. Ce que ça fait (1 phrase)
2. Le form pour essayer
3. C'est tout

---

## Ce qui va déclencher les commentaires négatifs

| Élément | Commentaire HN/Reddit probable |
|---------|-------------------------------|
| Badge "100% FREE" | "Why are they screaming free at me?" |
| Emojis | "Emojis on a landing page, really?" |
| "That's what makes us different" | "Let me decide what makes you different" |
| Comparaison avec "others" | "Which others? Name them or don't mention them" |
| "YOUR assistant" caps | "Don't shout at me" |
| Page longue | "I just wanted to try it, not read a novel" |
| "No catch" | "Saying 'no catch' is exactly what someone with a catch would say" |

---

## Ce qui pourrait être bien reçu

- Le concept de base (combiner plusieurs sources → markdown → ton AI)
- Le form qui marche sans signup
- L'extension Chrome
- Le fait que ce soit open source (si c'est le cas)
- La simplicité technique (markdown, pas de magie)

---

## Proposition : Version minimaliste

Une landing page HN-friendly pourrait ressembler à ça :

```
toyour.ai

Paste URLs. Get markdown. Send to your AI.

[textarea]
[Extract]

Works with any AI that can fetch URLs.
Chrome extension available.

---
FAQ (optionnel, replié)
- What is this? Extracts content from YouTube/web pages into markdown.
- Is it free? Yes, no account needed.
```

C'est tout. 5 lignes. Le reste est du bruit.

---

## Recommandations par priorité

### À supprimer

1. Badge "100% FREE"
2. Section "Why toyour.ai?" entière
3. Emojis
4. Section Use Cases
5. Répétitions de "free/no catch/no quotas"
6. "That's what makes us different"
7. Comparaisons avec "others"

### À simplifier

1. Hero : une seule phrase
2. "How it works" : un seul flow, 3 étapes max
3. FAQ : 2 questions max

### À garder

1. Le form (c'est le produit)
2. La liste des LLMs (mais sans le "Works with" pompeux — juste les noms)
3. Le lien vers l'extension
4. Une courte explication technique si quelqu'un scroll

---

## Ton à adopter

**Avant (marketing)** :
> "Research faster. One document, one conversation. No quotas, no signup, no catch."

**Après (HN-friendly)** :
> "Extracts transcripts and content into markdown."

**Avant** :
> "Opens directly in YOUR assistant"

**Après** :
> "Opens in Claude, ChatGPT, etc."

**Avant** :
> "That's what makes us different."

**Après** :
> [rien, laisse le produit parler]

---

## Conclusion

La landing page actuelle est bien construite pour un public Product Hunt ou grand public. Mais pour HN/Reddit, elle est trop "salesy".

Ces audiences veulent :
- Voir ce que ça fait immédiatement
- Essayer sans friction
- Pas de bullshit marketing
- De l'honnêteté et de l'humilité

Le weekend project qui réussit sur HN, c'est celui qui dit "j'ai fait ce truc, essayez-le" — pas celui qui explique pendant 5 paragraphes pourquoi c'est révolutionnaire.

**Règle d'or** : Si tu dois convaincre, tu as déjà perdu.
