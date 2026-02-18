# Simulateur d'intérêts composés (Webflow Code Component)

Ce dossier contient la version active du simulateur Ramify, en React + Webflow Code Components (sans iframe).

## Prérequis

- Node.js 20+
- npm 10+
- Un token Workspace Webflow dans `.env` (voir `.env.example`)

## Commandes utiles

```bash
npm install
npm run dev
npm run verify
npm run share
npm run package:handoff
```

## Détail des scripts

- `npm run dev` : preview local Vite.
- `npm run verify` : vérification complète (`typecheck` + `build` + `bundle`).
- `npm run share` : publication de la librairie Code Components.
- `npm run package:handoff` : crée une archive prête à transmettre à l'agence dans `release/`.

## Documentation de livraison

Voir `AGENCY_HANDOFF.md` pour :

- l'installation agence,
- la migration de la page Webflow,
- la checklist QA,
- la stratégie de rollback,
- et les différences entre l'ancien simulateur iframe et cette version.

## Demo GitHub Pages

Un workflow est prêt pour publier le demo sur GitHub Pages :

- `.github/workflows/interets-composes-demo-pages.yml`

Activation (une seule fois dans GitHub) :

1. Aller dans `Settings > Pages`.
2. Dans `Build and deployment`, choisir `Source: GitHub Actions`.
3. Lancer le workflow `Demo - Interets Composes (GitHub Pages)` (onglet Actions), ou merger sur `main`.

URL attendue (project pages) :

- `https://<owner>.github.io/<repo>/`
