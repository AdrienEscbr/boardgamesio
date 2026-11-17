---
objective: "L'hôte peut expulser un joueur hors partie en cours ; l'expulsé est prévenu, renvoyé à l'accueil et ne peut plus revenir dans ce salon."
status: pending
---

# Plan: Expulsion d'un joueur par l'hôte

Source: aidd_docs/tasks/2026-11-17-expulsion-joueurs/spec.md

## Phases

| #   | Phase                          | File                         | Depends on |
| --- | ------------------------------ | ---------------------------- | ---------- |
| 1   | Commande serveur `room:kick`   | [`phase-1.md`](./phase-1.md) | none |
| 2   | Bouton d'expulsion et retour à l'accueil | [`phase-2.md`](./phase-2.md) | 1 |

## External sources

| URL  | What it settled |
| ---- | --------------- |
| none | none |

## Impact

| Category | Verdict and evidence | Handled in |
| -------- | -------------------- | ---------- |
| regression | low : `join` gagne un refus `KICKED` ; `packages/core-server/test/server.test.js` couvre join/leave/removeBot ; pas de phase filet (ajout pur) | 1 |
| architecture | nouveau push serveur → client `room:kicked { roomId }` sur le canal `player:<id>`, en plus de `room:state` (l'expulsé n'est plus membre, `notify` ne le joint plus) | 1, 2 |
| documentation | `aidd_docs/memory/internal/api-docs.md` (commande, push, codes) et `README.md` l.49 (liste des commandes) | 1 |

## Rules

| Rule | Why it applies |
| ---- | -------------- |
| Interface et messages en français, code en anglais | message `KICKED` et toast |
| Commits préfixés `BoardGamesIO :` | socle (`packages/*`, `apps/*`) |
| `npm test` puis `npm run build` avant push | coding-assertions |
