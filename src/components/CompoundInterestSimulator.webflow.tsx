import { PropType, PropValues, props } from "@webflow/data-types";
import { declareComponent } from "@webflow/react";
import { CompoundInterestSimulator, CompoundInterestSimulatorProps } from "./CompoundInterestSimulator";
import { CapitalizationFrequencyMonths, TaxApplicationMethod } from "../domain/compoundInterest";

type MethodLabel = "Imposition annuelle" | "Imposition en fin d'horizon";
type CapitalizationFrequencyLabel = "1 mois" | "3 mois" | "12 mois";
type AssuranceVieAllowanceLabel = "Aucun" | "Célibataire (4 600 €)" | "Couple (9 200 €)";

type WebflowSimulatorProps = Omit<
  CompoundInterestSimulatorProps,
  "defaultTaxApplicationMethod" | "defaultCapitalizationFrequencyMonths" | "defaultAssuranceVieAllowanceMode" | "callToActionLink"
> & {
  defaultTaxApplicationLabel: MethodLabel;
  defaultCapitalizationFrequencyLabel: CapitalizationFrequencyLabel;
  defaultAssuranceVieAllowanceLabel: AssuranceVieAllowanceLabel;
  callToActionLink: PropValues[PropType.Link];
};

const taxMethodByLabel: Record<MethodLabel, TaxApplicationMethod> = {
  "Imposition annuelle": "yearly",
  "Imposition en fin d'horizon": "end_of_investment",
};

const capitalizationFrequencyByLabel: Record<CapitalizationFrequencyLabel, CapitalizationFrequencyMonths> = {
  "1 mois": 1,
  "3 mois": 3,
  "12 mois": 12,
};

const assuranceVieAllowanceByLabel: Record<
  AssuranceVieAllowanceLabel,
  CompoundInterestSimulatorProps["defaultAssuranceVieAllowanceMode"]
> = {
  Aucun: "none",
  "Célibataire (4 600 €)": "single",
  "Couple (9 200 €)": "couple",
};

const WebflowCompoundInterestSimulator = ({
  defaultTaxApplicationLabel,
  defaultCapitalizationFrequencyLabel,
  defaultAssuranceVieAllowanceLabel,
  callToActionLink,
  ...rest
}: WebflowSimulatorProps) => {
  return (
    <CompoundInterestSimulator
      {...rest}
      defaultTaxApplicationMethod={taxMethodByLabel[defaultTaxApplicationLabel] ?? "end_of_investment"}
      defaultCapitalizationFrequencyMonths={capitalizationFrequencyByLabel[defaultCapitalizationFrequencyLabel] ?? 12}
      defaultAssuranceVieAllowanceMode={assuranceVieAllowanceByLabel[defaultAssuranceVieAllowanceLabel] ?? "single"}
      callToActionLink={callToActionLink}
    />
  );
};

export default declareComponent(WebflowCompoundInterestSimulator, {
  name: "Simulateur Intérêts Composés",
  description: "Simulateur d'intérêts composés Ramify (sans iframe)",
  group: "Ramify",
  props: {
    initialAmount: props.Number({
      name: "Investissement initial (€)",
      group: "Paramètres",
      defaultValue: 5000,
      min: 0,
      decimals: 0,
    }),
    monthlyInvested: props.Number({
      name: "Versement mensuel (€)",
      group: "Paramètres",
      defaultValue: 100,
      min: 0,
      decimals: 0,
    }),
    timeHorizon: props.Number({
      name: "Horizon (années)",
      group: "Paramètres",
      defaultValue: 10,
      min: 0,
      decimals: 0,
    }),
    annualInterestRate: props.Number({
      name: "Taux d'intérêt annuel (%)",
      group: "Paramètres",
      defaultValue: 5,
      min: 0,
      decimals: 2,
    }),
    annualFeesRate: props.Number({
      name: "Taux de frais annuel (%)",
      group: "Paramètres",
      defaultValue: 0,
      min: 0,
      decimals: 2,
    }),
    taxRate: props.Number({
      name: "Taux d'imposition (%)",
      group: "Paramètres",
      defaultValue: 0,
      min: 0,
      decimals: 2,
    }),
    defaultTaxApplicationLabel: props.Variant({
      name: "Méthode d'imposition par défaut",
      group: "Paramètres",
      options: ["Imposition annuelle", "Imposition en fin d'horizon"],
      defaultValue: "Imposition en fin d'horizon",
    }),
    defaultCapitalizationFrequencyLabel: props.Variant({
      name: "Capitalisation par défaut",
      group: "Paramètres",
      options: ["1 mois", "3 mois", "12 mois"],
      defaultValue: "12 mois",
    }),
    defaultAssuranceVieAllowanceLabel: props.Variant({
      name: "Abattement AV par défaut",
      group: "Paramètres",
      options: ["Aucun", "Célibataire (4 600 €)", "Couple (9 200 €)"],
      defaultValue: "Célibataire (4 600 €)",
    }),
    adjustPresentValue: props.Boolean({
      name: "Afficher fiscalité latente (courbe)",
      group: "Paramètres",
      defaultValue: false,
    }),
    showCallToAction: props.Boolean({
      name: "Afficher CTA",
      group: "CTA",
      defaultValue: true,
    }),
    callToActionText: props.Text({
      name: "Texte CTA",
      group: "CTA",
      defaultValue: "Comparer les offres",
    }),
    callToActionLink: props.Link({
      name: "Lien CTA",
      group: "CTA",
    }),
    showDisclaimer: props.Boolean({
      name: "Afficher disclaimer",
      group: "Contenu",
      defaultValue: true,
    }),
  },
  options: {
    applyTagSelectors: true,
  },
});
