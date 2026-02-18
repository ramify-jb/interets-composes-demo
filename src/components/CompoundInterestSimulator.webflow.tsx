import { PropType, PropValues, props } from "@webflow/data-types";
import { declareComponent } from "@webflow/react";
import { CompoundInterestSimulator, CompoundInterestSimulatorProps } from "./CompoundInterestSimulator";
import { TaxApplicationMethod } from "../domain/compoundInterest";

type MethodLabel = "Imposition annuelle" | "Imposition en fin d'horizon";

type WebflowSimulatorProps = Omit<CompoundInterestSimulatorProps, "defaultTaxApplicationMethod" | "callToActionLink"> & {
  defaultTaxApplicationLabel: MethodLabel;
  callToActionLink: PropValues[PropType.Link];
};

const taxMethodByLabel: Record<MethodLabel, TaxApplicationMethod> = {
  "Imposition annuelle": "yearly",
  "Imposition en fin d'horizon": "end_of_investment",
};

const WebflowCompoundInterestSimulator = ({
  defaultTaxApplicationLabel,
  callToActionLink,
  ...rest
}: WebflowSimulatorProps) => {
  return (
    <CompoundInterestSimulator
      {...rest}
      defaultTaxApplicationMethod={taxMethodByLabel[defaultTaxApplicationLabel] ?? "end_of_investment"}
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
    adjustPresentValue: props.Boolean({
      name: "Ajuster la courbe pour impôt final",
      group: "Paramètres",
      defaultValue: true,
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
