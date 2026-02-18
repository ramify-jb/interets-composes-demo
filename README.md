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
npm run deploy:public-demo
npm run package:handoff
```

## Détail des scripts

- `npm run dev` : preview local Vite.
- `npm run verify` : vérification complète (`typecheck` + `build` + `bundle`).
- `npm run share` : publication de la librairie Code Components.
- `npm run deploy:public-demo` : publie le demo statique sur `https://ramify-jb.github.io/interets-composes-demo/`.
- `npm run package:handoff` : crée une archive prête à transmettre à l'agence dans `release/`.

## Documentation de livraison

Voir `AGENCY_HANDOFF.md` pour :

- l'installation agence,
- la migration de la page Webflow,
- la checklist QA,
- la stratégie de rollback,
- et les différences entre l'ancien simulateur iframe et cette version.

## Demo public (GitHub Pages)

Le demo public est hébergé dans le repo dédié :

- `https://github.com/ramify-jb/interets-composes-demo`

URL :

- `https://ramify-jb.github.io/interets-composes-demo/`

Publication en une commande (depuis ce dossier) :

```bash
npm run deploy:public-demo
```

## Modifier le copy de la box promotionnelle

Éditer ces constantes dans :

- `src/components/CompoundInterestSimulator.tsx`
  - `MARKETING_HEADLINE`
  - `MARKETING_BODY`

Puis republier le demo :

```bash
npm run deploy:public-demo
```
