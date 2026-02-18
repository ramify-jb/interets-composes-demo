# Handoff agence Webflow - Simulateur d'intérêts composés

Ce document décrit la procédure complète pour installer, publier et remplacer l'ancien simulateur iframe par le Code Component natif Webflow.

## 1) Ce qui est livré

- Composant Webflow : `Simulateur Intérêts Composés`
- Groupe Webflow : `Ramify`
- Entrée Webflow : `src/components/CompoundInterestSimulator.webflow.tsx`
- Implémentation UI : `src/components/CompoundInterestSimulator.tsx`
- Moteur de calcul : `src/domain/compoundInterest.ts`

## 2) Préparer l'environnement

1. Ouvrir `webflow-code-component/`.
2. Installer les dépendances :
   ```bash
   npm install
   ```
3. Créer `.env` à partir de `.env.example` et renseigner :
   - `WEBFLOW_WORKSPACE_API_TOKEN`

## 3) Vérifier avant publication

Exécuter :

```bash
npm run verify
```

Cette commande valide :

- TypeScript (`typecheck`)
- Build front (`vite build`)
- Bundle Webflow (`webflow library bundle`)

## 4) Publier la librairie Webflow

Exécuter :

```bash
npm run share
```

Résultat attendu : URL de partage de librairie Webflow.

## 5) Installer la librairie dans le site Webflow

1. Ouvrir le Designer du site Ramify.
2. Ouvrir Apps / Code Components.
3. Installer la shared library via l'URL retournée par `npm run share`.
4. Vérifier que `Simulateur Intérêts Composés` apparaît dans le groupe `Ramify`.

## 6) Remplacer l'ancien iframe sur la page

Page cible : `https://www.ramify.fr/outils/calculatrice-interet-compose`

1. Ouvrir la page dans Webflow Designer.
2. Supprimer le bloc embed contenant `iframe#myIframe`.
3. Insérer `Simulateur Intérêts Composés` à la même place.
4. Mettre le composant en largeur 100%.

Paramètres recommandés :

- Investissement initial : `5000`
- Versement mensuel : `100`
- Horizon : `10`
- Taux d'intérêt annuel : `5`
- Taux de frais annuel : `0`
- Taux d'imposition : `0`
- Méthode d'imposition par défaut : `Imposition en fin d'horizon`
- Ajuster la courbe pour impôt final : `true`
- Afficher CTA : `true`
- Texte CTA : `Comparer les offres`
- Lien CTA : `/offres`
- Afficher disclaimer : `true`

## 7) Nettoyage post-migration dans la page Webflow

Retirer les anciens listeners JS liés à l'iframe :

- listener `iframeHeight`
- listener `redirect`

Ils servaient uniquement au `postMessage` de l'ancienne version iframe.

## 8) QA à exécuter avant publication

### Fonctionnel

- Les inputs mettent bien à jour le résultat et le graphe.
- Les onglets Graphique / Tableau annuel / Tableau mensuel fonctionnent.
- Les options d'imposition (0%, presets, personnalisée) fonctionnent.
- Le mode comparaison 2 scénarios fonctionne.
- Les CTA ouvrent les bons liens.

### Responsive

- Desktop : mise en page 2 colonnes.
- Tablet : pas de chevauchement.
- Mobile : lisibilité et graph/tables utilisables.

### Régression métier

- Capital final, versements, intérêts, frais et impôts cohérents.
- TRI net affiché dans la phrase de synthèse.

## 9) Rollback (si incident)

1. Retirer temporairement le Code Component de la page.
2. Réinsérer l'ancien bloc iframe.
3. Republier la page.

## 10) Pourquoi cette implémentation est meilleure que l'iframe legacy

- Plus de dépendance à `postMessage` pour redimensionnement/redirection.
- Plus d'iframe externe GitHub Pages à charger.
- Intégration native dans Webflow (maintenance et édition simplifiées).
- Déploiement versionné via Webflow Code Components (`bundle/share`).
- Surface de bugs réduite (moins de glue JS page-level).

## 11) Ajouts visuels et fonctionnels par rapport au legacy

- Mode comparaison de scénarios (Scénario 1 / Scénario 2 + écarts).
- Vues multiples : graphique, tableau annuel, tableau mensuel.
- Presets fiscaux : Assurance-vie, PEA, CTO, PER.
- Mode imposition personnalisée avec switch "Annuelle / Au terme".
- Détail type "facture" plus lisible sous le graphe.
- CTA contextualisé en mode comparaison ("Échanger avec un conseiller").
- Composant configurable depuis le panneau de props Webflow.

## 12) Packaging pour transmission agence

Créer l'archive à partager :

```bash
npm run package:handoff
```

Archive générée :

- `release/ramify-compound-interest-webflow-component.tar.gz`

## 13) Demo public via GitHub Pages (optionnel)

Workflow disponible :

- `.github/workflows/interets-composes-demo-pages.yml`

Pré-requis dans GitHub :

1. `Settings > Pages`
2. `Source: GitHub Actions`

Puis lancer le workflow `Demo - Interets Composes (GitHub Pages)`.
