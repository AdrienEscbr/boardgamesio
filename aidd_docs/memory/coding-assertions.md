---
name: coding-assertions
description: Code quality verification checklist
argument-hint: N/A
scope: all
---

# Coding Guidelines

> Those rules must be minimal because the MUST be checked after EVERY CODE GENERATION.

## Requirements to complete a feature

**A feature is really completed if ALL of the above are satisfied: if not, iterate to fix all until all are green.**

- Prérequis : `npm install` fait (sinon `packages/core-server/test/server.test.js` échoue faute de `socket.io-client`).

## Commands to run

- `Before commit`: minimal check to build a feature
- `Before push`: heavier check ran before push

### Before commit

| Order | Command | Description |
| ----- | ------- | ----------- |
| 1 | `npm test` | `node --test` sur `packages/*/test` et `games/*/test` |

### Before push

| Order | Command | Description |
| ----- | ------- | ----------- |
| 1 | `npm test` | Tous les tests (socle + jeux), comme la CI |
| 2 | `npm run build` | Build Vite du site (`apps/web/dist`), comme la CI |
