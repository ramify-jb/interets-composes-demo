# Handoff client / agence Webflow - Simulateur d'intérêts composés

Ce document décrit la procédure complète pour installer, publier et remplacer l'ancien simulateur iframe par le Code Component natif Webflow.

Le repo public est la source de vérité du simulateur. Toute évolution du composant doit partir de ce repo, puis être repartagée vers Webflow via `npm run share`.

## 1) Ce qui est livré

- Composant Webflow : `Simulateur Intérêts Composés`
- Groupe Webflow : `Ramify`
- Entrée Webflow : `src/components/CompoundInterestSimulator.webflow.tsx`
- Implémentation UI : `src/components/CompoundInterestSimulator.tsx`
- Moteur de calcul : `src/domain/compoundInterest.ts`

## 2) Préparer l'environnement

1. Ouvrir la racine de ce repo.
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

Cette commande :

- authentifie le workspace Webflow si nécessaire,
- compile la librairie Code Components,
- la partage au workspace sélectionné.

Résultat attendu : message de succès Webflow CLI confirmant le partage de la librairie dans le workspace cible.

## 5) Installer la librairie dans le site Webflow

Cette étape ne nécessite pas l'agence si vous avez :

- un accès au workspace Webflow Ramify,
- un accès Designer sur le site Ramify,
- et le droit d'installer / mettre à jour des Libraries.

Procédure :

1. Ouvrir le Designer du site Ramify.
2. Ouvrir le panneau `Libraries` (`L`).
3. Dans `Available to install`, installer la librairie partagée `Ramify Simulateurs`.
4. Ouvrir ensuite le panneau `Components`.
5. Vérifier que `Simulateur Intérêts Composés` apparaît dans le groupe `Ramify`.

## 6) Remplacer l'ancien iframe sur la page

Page cible : `https://www.ramify.fr/outils/calculatrice-interet-compose`

1. Ouvrir la page dans Webflow Designer.
2. Repérer le bloc embed legacy contenant `iframe#myIframe`.
3. Supprimer ce bloc iframe.
4. Insérer `Simulateur Intérêts Composés` à la même place.
5. Mettre le composant en largeur 100%.

État actuel observé sur la page live au 20 avril 2026 :

- la page publie encore `iframe#myIframe`,
- source iframe : `https://ramify.github.io/simulateur-site/`,
- les listeners legacy `iframeHeight` et `redirect` sont encore présents.

Paramètres recommandés :

- Investissement initial : `5000`
- Versement mensuel : `100`
- Horizon : `10`
- Taux d'intérêt annuel : `5`
- Taux de frais annuel : `0`
- Taux d'imposition : `0`
- Méthode d'imposition par défaut : `Imposition en fin d'horizon`
- Capitalisation par défaut : `12 mois`
- Abattement AV par défaut : `Célibataire (4 600 €)`
- Afficher fiscalité latente (courbe) : `false`
- Afficher CTA : `true`
- Texte CTA : `Comparer les offres`
- Lien CTA : `/offres`
- Afficher disclaimer : `true`

## 7) Nettoyage post-migration dans la page Webflow

Retirer les anciens listeners JS liés à l'iframe :

- listener `iframeHeight`
- listener `redirect`

Ils servaient uniquement au `postMessage` de l'ancienne version iframe.

Important :

- cette suppression doit se faire dans le custom code de la page ou du site seulement si ce code n'est plus utilisé par d'autres simulateurs iframe,
- la publication finale du site reste une action manuelle dans Webflow Designer.

## 8) QA à exécuter avant publication

### Fonctionnel

- Les inputs mettent bien à jour le résultat et le graphe.
- Les onglets Graphique / Tableau annuel / Tableau mensuel fonctionnent.
- Les options d'imposition (0%, presets, personnalisée) fonctionnent.
- Le mode comparaison 2 scénarios fonctionne.
- Les CTA ouvrent les bons liens.
- Le footer affiche bien le disclaimer actuel sur le rendement annualisé, sans ancien lien de méthodologie.

### Responsive

- Desktop : mise en page 2 colonnes.
- Tablet : pas de chevauchement.
- Mobile : lisibilité et graph/tables utilisables.

### Régression métier

- Capital final, versements, intérêts, frais et impôts cohérents.
- Rendement annualisé net affiché dans la phrase de synthèse.
- En mode "imposition en fin d'horizon", les impôts apparaissent uniquement sur la dernière ligne des tableaux (sauf si l'option "fiscalité latente" est activée).
- En mode Assurance-vie (horizon >= 8 ans), vérifier que l'abattement ne s'applique que sur la part IR.
- Le bloc détaillé de rendement annualisé (brut + impacts frais/fiscalité) n'apparaît que si les frais ou les impôts sont non nuls.

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

### Impact SEO

- Le contenu du simulateur est rendu directement dans la page, au lieu d'être isolé dans un document iframe séparé.
- La structure de la page est plus cohérente pour l'indexation (moins de fragmentation entre page article et contenu embarqué).
- Moins de dépendance à une origine externe pour charger une partie critique de la page.

### Impact sécurité

- Réduction de la surface d'attaque liée aux communications cross-origin iframe ↔ page.
- Suppression du flux `postMessage` legacy pour hauteur/redirection, qui utilisait un ciblage permissif.
- Moins de logique de "bridge" JS au niveau page, donc moins de risques d'erreurs d'intégration.

### Impact UX

- Navigation de liens plus prévisible (pas de comportement encapsulé par iframe).
- Cas corrigé explicitement : le lien d'explication du rendement annualisé ne s'ouvre plus à l'intérieur d'un encadré iframe, mais avec le comportement attendu de la page.

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

Le demo public est publié depuis ce repo :

- Code: `https://github.com/ramify-jb/interets-composes-demo`
- URL: `https://ramify-jb.github.io/interets-composes-demo/`

Pour publier une nouvelle version du demo depuis ce projet :

```bash
npm run deploy:public-demo
```

La commande build le projet avec le bon base path puis pousse `dist/` sur la branche `gh-pages` de ce repo.
