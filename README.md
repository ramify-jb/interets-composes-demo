# Simulateur d'intérêts composés Ramify

Ce repo public est la source de vérité du simulateur Ramify en React + Webflow Code Components.

Il sert à la fois pour :

- modifier le code du simulateur,
- vérifier localement les calculs et l'UI,
- partager la librairie Webflow au workspace Ramify,
- publier la démo GitHub Pages,
- et transmettre un handoff propre à un client ou à une agence.

## Prérequis

- Node.js 20+
- npm 10+
- Un token Workspace Webflow dans `.env` (voir `.env.example`)
- Des accès Webflow suffisants si vous devez installer la librairie sur un site ou publier

## Commandes utiles

```bash
npm install
npm run dev
npm run verify
npm run share
npm run deploy:public-demo
npm run package:handoff
```

## Workflow standard

1. Modifier le code dans ce repo.
2. Lancer :
   ```bash
   npm install
   npm run check:calculations
   npm run verify
   ```
3. Partager la version au workspace Webflow :
   ```bash
   npm run share
   ```
4. Dans Webflow Designer :
   - installer ou mettre à jour la librairie `Ramify Simulateurs`,
   - accepter les changements si une update est en attente,
   - puis publier le site manuellement.

## Détail des scripts

- `npm run dev` : preview local Vite.
- `npm run check:calculations` : vérification métier du moteur de calcul.
- `npm run verify` : vérification complète (`typecheck` + `build` + `bundle`).
- `npm run share` : partage la librairie Code Components dans un workspace Webflow.
- `npm run deploy:public-demo` : publie le demo statique sur `https://ramify-jb.github.io/interets-composes-demo/`.
- `npm run package:handoff` : crée une archive prête à transmettre à l'agence dans `release/`.

## Documentation de livraison

Voir `AGENCY_HANDOFF.md` pour :

- l'installation côté client / agence,
- l'installation manuelle côté Ramify si vous avez les accès Webflow,
- la migration de la page Webflow,
- la checklist QA,
- la stratégie de rollback,
- et les différences entre l'ancien simulateur iframe et cette version.

## Demo public (GitHub Pages)

Le demo public est publié depuis ce repo sur la branche `gh-pages`.

Repo :

- `https://github.com/ramify-jb/interets-composes-demo`

URL :

- `https://ramify-jb.github.io/interets-composes-demo/`

Publication en une commande (depuis ce dossier) :

```bash
npm run deploy:public-demo
```

## Accès nécessaires pour un tiers

Pour qu'un client ou une agence puisse modifier et republier le simulateur sans dépendre d'un repo privé, il lui faut :

- accès en écriture à ce repo,
- accès au workspace Webflow Ramify,
- accès Designer au site cible,
- droit d'installer / mettre à jour des Libraries,
- droit de publier le site.

## Modifier quelques textes

Éditer ces constantes dans :

- `src/components/CompoundInterestSimulator.tsx`
  - `MARKETING_HEADLINE`
  - `MARKETING_BODY`
  - `MARKETING_DISCLAIMER`
  - `COMPARISON_CTA_HEADLINE`
  - `COMPARISON_CTA_BODY`
  - `COMPARISON_CTA_BUTTON`

Puis republier le demo :

```bash
npm run deploy:public-demo
```
