import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { ChevronsDownUp, ChevronsUpDown, GitCompareArrows, Info } from "lucide-react";
import * as styles from "./CompoundInterestSimulator.module.css";
import { AdvisorContactModal, trackAdvisorModalOpen } from "./AdvisorContactModal";
import {
  CapitalizationFrequencyMonths,
  computeCompoundInterest,
  TaxApplicationMethod,
} from "../domain/compoundInterest";
import { CompoundInterestTable, type CompoundInterestTableRow } from "./CompoundInterestSimulatorTable";
import {
  normalizeDecimalInput,
  normalizePastedNumeric,
  parseRateInput,
} from "./compoundInterestInputUtils";
import type { LinkValue } from "../types/webflow";

Chart.register(CategoryScale, LinearScale, PointElement, LineController, LineElement, Filler, Tooltip, Legend);

const CURRENCY_FORMATTER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const RATE_FORMATTER = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

type TaxPresetKey = "assurance_vie" | "per" | "pea" | "cto";
type TaxOption = "none" | TaxPresetKey | "custom";
type AssuranceVieAllowanceMode = "none" | "single" | "couple";

interface TaxPreset {
  key: TaxPresetKey;
  label: string;
  getTaxRatePercent: (timeHorizonYears: number) => number;
  tooltip: string;
}

const TAX_PRESETS: TaxPreset[] = [
  {
    key: "assurance_vie",
    label: "Assurance-vie",
    getTaxRatePercent: (timeHorizonYears) => (timeHorizonYears >= 8 ? 24.7 : 30),
    tooltip:
      "Hypothèse simplifiée : avant 8 ans PFU à 30 % (12,8 % d'IR + 17,2 % de PS). Après 8 ans : 7,5 % d'IR + 17,2 % de PS, avec abattement optionnel sur la part IR.",
  },
  {
    key: "pea",
    label: "PEA",
    getTaxRatePercent: (timeHorizonYears) => (timeHorizonYears >= 5 ? 18.6 : 31.4),
    tooltip: "Hypothèse simplifiée : 18,6 % de prélèvements sociaux si horizon \u2265 5 ans, sinon flat tax à 31,4 %.",
  },
  {
    key: "cto",
    label: "CTO",
    getTaxRatePercent: () => 31.4,
    tooltip: "Hypothèse simplifiée : flat tax (PFU) à 31,4 %.",
  },
  {
    key: "per",
    label: "PER",
    getTaxRatePercent: () => 31.4,
    tooltip: "Hypothèse simplifiée : plus-values soumises au PFU de 31,4 % (12,8 % IR + 18,6 % PS).",
  },
];

const TAX_PRESET_BY_KEY: Record<TaxPresetKey, TaxPreset> = TAX_PRESETS.reduce(
  (accumulator, preset) => ({ ...accumulator, [preset.key]: preset }),
  {} as Record<TaxPresetKey, TaxPreset>,
);

const TAX_OPTIONS: { value: TaxOption; label: string }[] = [
  { value: "none", label: "0 %" },
  ...TAX_PRESETS.map((p) => ({ value: p.key as TaxOption, label: p.label })),
  { value: "custom", label: "Personnalisée" },
];

const CAPITALIZATION_FREQUENCIES: { value: CapitalizationFrequencyMonths; label: string }[] = [
  { value: 1, label: "1 mois" },
  { value: 3, label: "3 mois" },
  { value: 12, label: "12 mois" },
];

const ASSURANCE_VIE_ALLOWANCE_BY_MODE: Record<AssuranceVieAllowanceMode, number> = {
  none: 0,
  single: 4600,
  couple: 9200,
};

const ASSURANCE_VIE_ALLOWANCE_OPTIONS: { value: AssuranceVieAllowanceMode; label: string }[] = [
  { value: "none", label: "Aucun" },
  { value: "single", label: "Célibataire" },
  { value: "couple", label: "Couple" },
];

const MARKETING_HEADLINE = "Jusqu'à +12,68 % annualisé depuis 5 ans* avec Ramify";
const MARKETING_BODY =
  "Ramify est la gestion pilotée la plus performante et diversifiée du marché. Accédez à un univers complet d'investissement dès 1000 €.";
const MARKETING_DISCLAIMER =
  "*Portefeuille Ramify Flagship pour un risque de 10/10 de 2021 à 2025. Les performances passées ne préjugent pas des performances futures.";
const COMPARISON_CTA_HEADLINE = "Besoin de parler à un expert ?";
const COMPARISON_CTA_BODY =
  "Les conseillers Ramify, issus d'institutions financières prestigieuses (Goldman Sachs, Nomura, ...), sont à votre disposition du lundi au vendredi, de 9h à 18h pour vous aider avec votre stratégie d'épargne.";
const COMPARISON_CTA_BUTTON = "Échanger avec un conseiller";

export interface CompoundInterestSimulatorProps {
  initialAmount: number;
  monthlyInvested: number;
  timeHorizon: number;
  annualInterestRate: number;
  annualFeesRate: number;
  taxRate: number;
  defaultTaxApplicationMethod: TaxApplicationMethod;
  defaultCapitalizationFrequencyMonths: CapitalizationFrequencyMonths;
  defaultAssuranceVieAllowanceMode: AssuranceVieAllowanceMode;
  adjustPresentValue: boolean;
  showCallToAction: boolean;
  callToActionText: string;
  callToActionLink: LinkValue;
  showDisclaimer: boolean;
}

interface InputData {
  initialAmount: number;
  monthlyInvested: number;
  timeHorizon: number;
  annualInterestRate: number;
  annualFeesRate: number;
  taxRate: number;
  taxApplicationMethod: TaxApplicationMethod;
  capitalizationFrequencyMonths: CapitalizationFrequencyMonths;
  assuranceVieAllowanceMode: AssuranceVieAllowanceMode;
}

interface RateInputData {
  annualInterestRate: string;
  annualFeesRate: string;
  taxRate: string;
}

interface ScenarioState {
  inputData: InputData;
  rateInputData: RateInputData;
  selectedTaxOption: TaxOption;
}

type ScenarioId = "scenario1" | "scenario2";

type DisplayMode = "graph" | "yearly_table" | "monthly_table";

type HistorySeries = ReturnType<typeof computeCompoundInterest>["monthlyHistoryDict"];

interface ReceiptRow {
  key: string;
  label: string;
  valueScenario1: number;
  valueScenario2: number;
  isTotal?: boolean;
}

interface AnnualizedImpact {
  grossAnnualized: number;
  netOfFeesAnnualized: number;
  netAnnualized: number;
  feesImpact: number;
  taxImpact: number;
}

type ComparisonLeader = "scenario1" | "scenario2" | "tie";

function sanitizeNumber(value: unknown, fallback: number, min = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
    return fallback;
  }
  return Math.max(numeric, min);
}

function formatNumberForInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return RATE_FORMATTER.format(Math.round(value * 100) / 100);
}

function parseCapitalizationFrequency(value: unknown): CapitalizationFrequencyMonths {
  if (value === 1 || value === 3 || value === 12) {
    return value;
  }
  return 12;
}

function toRateInputData(inputData: InputData): RateInputData {
  return {
    annualInterestRate: formatNumberForInput(inputData.annualInterestRate),
    annualFeesRate: formatNumberForInput(inputData.annualFeesRate),
    taxRate: formatNumberForInput(inputData.taxRate),
  };
}

function getTaxPresetRate(presetKey: TaxPresetKey, timeHorizonYears: number): number {
  return TAX_PRESET_BY_KEY[presetKey].getTaxRatePercent(timeHorizonYears);
}

function toInputData(props: CompoundInterestSimulatorProps): InputData {
  return {
    initialAmount: sanitizeNumber(props.initialAmount, 5000, 0),
    monthlyInvested: sanitizeNumber(props.monthlyInvested, 100, 0),
    timeHorizon: Math.round(sanitizeNumber(props.timeHorizon, 10, 0)),
    annualInterestRate: sanitizeNumber(props.annualInterestRate, 5, 0),
    annualFeesRate: sanitizeNumber(props.annualFeesRate, 0, 0),
    taxRate: sanitizeNumber(props.taxRate, 0, 0),
    taxApplicationMethod: props.defaultTaxApplicationMethod,
    capitalizationFrequencyMonths: parseCapitalizationFrequency(props.defaultCapitalizationFrequencyMonths),
    assuranceVieAllowanceMode: props.defaultAssuranceVieAllowanceMode,
  };
}

function toScenarioState(inputData: InputData): ScenarioState {
  return {
    inputData,
    rateInputData: toRateInputData(inputData),
    selectedTaxOption: inputData.taxRate > 0 ? "custom" : "none",
  };
}

function cloneScenarioState(state: ScenarioState): ScenarioState {
  return {
    inputData: { ...state.inputData },
    rateInputData: { ...state.rateInputData },
    selectedTaxOption: state.selectedTaxOption,
  };
}

function computeFromScenarioState(state: ScenarioState, adjustPresentValue: boolean) {
  const inputData = state.inputData;
  const isAssuranceVie = state.selectedTaxOption === "assurance_vie";
  const isLongTermAssuranceVie = isAssuranceVie && inputData.timeHorizon >= 8;

  return computeCompoundInterest({
    initialAmount: inputData.initialAmount,
    monthlyInvested: inputData.monthlyInvested,
    timeHorizonYears: inputData.timeHorizon,
    annualInterestRatePercent: inputData.annualInterestRate,
    annualFeesRatePercent: inputData.annualFeesRate,
    taxRatePercent: inputData.taxRate,
    taxIncomeRatePercent: isAssuranceVie ? (isLongTermAssuranceVie ? 7.5 : 12.8) : 0,
    taxSocialRatePercent: isAssuranceVie ? 17.2 : 0,
    annualTaxAllowance: isLongTermAssuranceVie ? ASSURANCE_VIE_ALLOWANCE_BY_MODE[inputData.assuranceVieAllowanceMode] : 0,
    taxApplicationMethod: inputData.taxApplicationMethod,
    capitalizationFrequencyMonths: inputData.capitalizationFrequencyMonths,
    adjustPresentValue,
  });
}

function computeAnnualizedImpactForScenario(state: ScenarioState, adjustPresentValue: boolean): AnnualizedImpact {
  const inputData = state.inputData;

  const gross = computeCompoundInterest({
    initialAmount: inputData.initialAmount,
    monthlyInvested: inputData.monthlyInvested,
    timeHorizonYears: inputData.timeHorizon,
    annualInterestRatePercent: inputData.annualInterestRate,
    annualFeesRatePercent: 0,
    taxRatePercent: 0,
    capitalizationFrequencyMonths: inputData.capitalizationFrequencyMonths,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });

  const netOfFees = computeCompoundInterest({
    initialAmount: inputData.initialAmount,
    monthlyInvested: inputData.monthlyInvested,
    timeHorizonYears: inputData.timeHorizon,
    annualInterestRatePercent: inputData.annualInterestRate,
    annualFeesRatePercent: inputData.annualFeesRate,
    taxRatePercent: 0,
    capitalizationFrequencyMonths: inputData.capitalizationFrequencyMonths,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });

  const net = computeFromScenarioState(state, adjustPresentValue);

  return {
    grossAnnualized: gross.internalRateOfReturn,
    netOfFeesAnnualized: netOfFees.internalRateOfReturn,
    netAnnualized: net.internalRateOfReturn,
    feesImpact: netOfFees.internalRateOfReturn - gross.internalRateOfReturn,
    taxImpact: net.internalRateOfReturn - netOfFees.internalRateOfReturn,
  };
}

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(Math.round(value));
}

function formatRate(value: number): string {
  return RATE_FORMATTER.format(value);
}

function formatRatioToPercent(value: number): string {
  return formatRate(value * 100);
}

function formatRatePointDelta(value: number): string {
  const deltaPoints = value * 100;
  if (deltaPoints === 0) {
    return "0 %";
  }
  const sign = deltaPoints > 0 ? "+" : "";
  return `${sign}${formatRate(deltaPoints)} %`;
}

function formatPercentRatio(value: number): string {
  return `${formatRatioToPercent(value)} %`;
}

function renderBillLabel(label: string) {
  const matches = label.match(/^(.+?)\s*\((.+)\)$/);
  if (!matches) {
    return <span className={styles.billLabelMain}>{label}</span>;
  }

  return (
    <>
      <span className={styles.billLabelMain}>{matches[1]}</span>
      <span className={styles.billLabelNote}>({matches[2]})</span>
    </>
  );
}

function renderBillSectionLabel(
  label: string,
  isOpen: boolean,
  onToggle: () => void,
) {
  return (
    <button
      type="button"
      className={styles.billSectionToggle}
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span className={styles.billSectionChevron} aria-hidden="true">
        {isOpen ? (
          <ChevronsDownUp
            className={`${styles.billSectionChevronIcon} ${styles.billSectionChevronIconCollapse}`}
          />
        ) : (
          <ChevronsUpDown
            className={`${styles.billSectionChevronIcon} ${styles.billSectionChevronIconExpand}`}
          />
        )}
      </span>
      <span className={styles.billSectionLabelContent}>
        {renderBillLabel(label)}
      </span>
    </button>
  );
}

function renderBillStaticSectionLabel(label: string) {
  return (
    <span className={styles.billSectionStaticLabel}>
      <span className={styles.billSectionChevronSpacer} aria-hidden="true">
        <ChevronsUpDown
          className={`${styles.billSectionChevronIcon} ${styles.billSectionChevronIconExpand}`}
        />
      </span>
      <span className={styles.billSectionLabelContent}>
        {renderBillLabel(label)}
      </span>
    </span>
  );
}

function formatSignedCurrency(value: number): string {
  if (value === 0) {
    return "0 €";
  }

  const absoluteValue = formatCurrency(Math.abs(value));
  return `${value > 0 ? "+" : "-"}${absoluteValue} €`;
}

function formatReceiptValue(value: number): string {
  if (value < 0) {
    return `-${formatCurrency(Math.abs(value))} €`;
  }
  return `${formatCurrency(value)} €`;
}

function createGradient(
  context: CanvasRenderingContext2D,
  right: number,
  start: string,
  end: string,
): CanvasGradient {
  const gradient = context.createLinearGradient(0, 0, right, 0);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);
  return gradient;
}

function buildTableRows(history: HistorySeries, mode: "yearly" | "monthly"): CompoundInterestTableRow[] {
  return history.value.map((value, index) => ({
    period:
      index === 0
        ? mode === "yearly"
          ? "Année 0"
          : "Mois 0"
        : mode === "yearly"
          ? `Fin d'année ${index}`
          : `Fin du mois ${index}`,
    value,
    invested: history.invested[index] ?? 0,
    interest: history.interest[index] ?? 0,
    grossInterest: history.grossInterest[index] ?? 0,
    fees: history.fees[index] ?? 0,
    tax: history.tax[index] ?? 0,
    periodIndex: index,
  }));
}

function applyTaxOptionToScenario(previous: ScenarioState, nextOption: TaxOption): ScenarioState {
  let nextInputData = previous.inputData;
  let nextRateInputData = previous.rateInputData;
  const defaultPresetTaxMethod: TaxApplicationMethod = "end_of_investment";

  if (nextOption === "none") {
    nextInputData =
      previous.inputData.taxRate === 0 && previous.inputData.taxApplicationMethod === defaultPresetTaxMethod
        ? previous.inputData
        : { ...previous.inputData, taxRate: 0, taxApplicationMethod: defaultPresetTaxMethod };
    nextRateInputData =
      previous.rateInputData.taxRate === "0" ? previous.rateInputData : { ...previous.rateInputData, taxRate: "0" };
  } else if (nextOption !== "custom") {
    const presetTaxRate = getTaxPresetRate(nextOption, previous.inputData.timeHorizon);
    const formattedPresetRate = formatNumberForInput(presetTaxRate);
    nextInputData =
      Math.abs(previous.inputData.taxRate - presetTaxRate) < 0.0001 &&
      previous.inputData.taxApplicationMethod === defaultPresetTaxMethod
        ? previous.inputData
        : { ...previous.inputData, taxRate: presetTaxRate, taxApplicationMethod: defaultPresetTaxMethod };
    nextRateInputData =
      previous.rateInputData.taxRate === formattedPresetRate
        ? previous.rateInputData
        : { ...previous.rateInputData, taxRate: formattedPresetRate };
  }

  if (
    nextInputData === previous.inputData &&
    nextRateInputData === previous.rateInputData &&
    nextOption === previous.selectedTaxOption
  ) {
    return previous;
  }

  return {
    ...previous,
    selectedTaxOption: nextOption,
    inputData: nextInputData,
    rateInputData: nextRateInputData,
  };
}

const defaultProps: CompoundInterestSimulatorProps = {
  initialAmount: 5000,
  monthlyInvested: 100,
  timeHorizon: 10,
  annualInterestRate: 5,
  annualFeesRate: 0,
  taxRate: 0,
  defaultTaxApplicationMethod: "end_of_investment",
  defaultCapitalizationFrequencyMonths: 12,
  defaultAssuranceVieAllowanceMode: "single",
  adjustPresentValue: false,
  showCallToAction: true,
  callToActionText: "Comparer les offres",
  callToActionLink: {
    href: "/offres",
    target: "_self",
  },
  showDisclaimer: true,
};

export function CompoundInterestSimulator(rawProps: Partial<CompoundInterestSimulatorProps>) {
  const props = { ...defaultProps, ...rawProps };

  const [scenarios, setScenarios] = useState<{
    scenario1: ScenarioState;
    scenario2: ScenarioState | null;
  }>(() => {
    const initialInputData = toInputData(props);
    return {
      scenario1: toScenarioState(initialInputData),
      scenario2: null,
    };
  });
  const [activeScenario, setActiveScenario] = useState<ScenarioId>("scenario1");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("graph");
  const [isAdvisorModalOpen, setIsAdvisorModalOpen] = useState(false);
  const [isCapitalBreakdownOpen, setIsCapitalBreakdownOpen] = useState(true);
  const [isAnnualizedBreakdownOpen, setIsAnnualizedBreakdownOpen] = useState(false);

  const simulatorContainerRef = useRef<HTMLElement | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<"line"> | null>(null);

  const activeScenarioState =
    activeScenario === "scenario2" && scenarios.scenario2 ? scenarios.scenario2 : scenarios.scenario1;
  const activeInputData = activeScenarioState.inputData;
  const activeRateInputData = activeScenarioState.rateInputData;
  const activeSelectedTaxOption = activeScenarioState.selectedTaxOption;
  const hasScenario2 = scenarios.scenario2 !== null;

  const patchActiveScenarioState = (updater: (previous: ScenarioState) => ScenarioState) => {
    setScenarios((previous) => {
      if (activeScenario === "scenario2" && previous.scenario2) {
        const nextScenario2 = updater(previous.scenario2);
        if (nextScenario2 === previous.scenario2) return previous;
        return { ...previous, scenario2: nextScenario2 };
      }

      const nextScenario1 = updater(previous.scenario1);
      if (nextScenario1 === previous.scenario1) return previous;
      return { ...previous, scenario1: nextScenario1 };
    });
  };

  useEffect(() => {
    const nextInputData = toInputData(props);
    setScenarios({
      scenario1: toScenarioState(nextInputData),
      scenario2: null,
    });
    setActiveScenario("scenario1");
  }, [
    props.initialAmount,
    props.monthlyInvested,
    props.timeHorizon,
    props.annualInterestRate,
    props.annualFeesRate,
    props.taxRate,
    props.defaultTaxApplicationMethod,
    props.defaultCapitalizationFrequencyMonths,
    props.defaultAssuranceVieAllowanceMode,
  ]);

  useEffect(() => {
    if (activeSelectedTaxOption === "custom") return;

    setScenarios((previous) => {
      const currentScenario =
        activeScenario === "scenario2" && previous.scenario2 ? previous.scenario2 : previous.scenario1;
      const nextScenario = applyTaxOptionToScenario(currentScenario, activeSelectedTaxOption);
      if (nextScenario === currentScenario) return previous;

      if (activeScenario === "scenario2" && previous.scenario2) {
        return { ...previous, scenario2: nextScenario };
      }
      return { ...previous, scenario1: nextScenario };
    });
  }, [activeSelectedTaxOption, activeInputData.timeHorizon, activeScenario]);

  const scenario1ComputedValues = useMemo(
    () => computeFromScenarioState(scenarios.scenario1, props.adjustPresentValue),
    [scenarios.scenario1, props.adjustPresentValue],
  );

  const scenario2ComputedValues = useMemo(
    () => (scenarios.scenario2 ? computeFromScenarioState(scenarios.scenario2, props.adjustPresentValue) : null),
    [scenarios.scenario2, props.adjustPresentValue],
  );

  const scenario1AnnualizedImpact = useMemo(
    () => computeAnnualizedImpactForScenario(scenarios.scenario1, props.adjustPresentValue),
    [scenarios.scenario1, props.adjustPresentValue],
  );

  const scenario2AnnualizedImpact = useMemo(
    () => (scenarios.scenario2 ? computeAnnualizedImpactForScenario(scenarios.scenario2, props.adjustPresentValue) : null),
    [scenarios.scenario2, props.adjustPresentValue],
  );

  const activeComputedValues =
    activeScenario === "scenario2" && scenario2ComputedValues ? scenario2ComputedValues : scenario1ComputedValues;
  const activeAnnualizedImpact =
    activeScenario === "scenario2" && scenario2AnnualizedImpact ? scenario2AnnualizedImpact : scenario1AnnualizedImpact;
  const activeScenarioHasFees = activeComputedValues.finalFees > 0;
  const activeScenarioHasTaxes = activeComputedValues.finalTax > 0;
  const activeScenarioHasCharges = activeScenarioHasFees || activeScenarioHasTaxes;
  const scenario1HasFees = scenario1ComputedValues.finalFees > 0;
  const scenario1HasTaxes = scenario1ComputedValues.finalTax > 0;
  const scenario1HasCharges = scenario1HasFees || scenario1HasTaxes;
  const scenario2HasFees = scenario2ComputedValues ? scenario2ComputedValues.finalFees > 0 : false;
  const scenario2HasTaxes = scenario2ComputedValues ? scenario2ComputedValues.finalTax > 0 : false;
  const scenario2HasCharges = scenario2HasFees || scenario2HasTaxes;
  const shouldShowAnnualizedImpactRows = hasScenario2 ? scenario1HasCharges || scenario2HasCharges : activeScenarioHasCharges;
  const hasAnyFees = hasScenario2 ? scenario1HasFees || scenario2HasFees : activeScenarioHasFees;
  const hasAnyTaxes = hasScenario2 ? scenario1HasTaxes || scenario2HasTaxes : activeScenarioHasTaxes;
  const feesImpactLabel = hasAnyFees ? "Impact des frais¹" : "Impact des frais";
  const taxCumulativeLabel = hasAnyTaxes ? "Impôts cumulés²" : "Impôts cumulés";
  const taxImpactLabel = hasAnyTaxes ? "Impact de la fiscalité²" : "Impact de la fiscalité";

  const yearlyTableRows = useMemo(
    () => buildTableRows(activeComputedValues.yearlyHistoryDict, "yearly"),
    [activeComputedValues.yearlyHistoryDict],
  );

  const monthlyTableRows = useMemo(
    () => buildTableRows(activeComputedValues.monthlyHistoryDict, "monthly"),
    [activeComputedValues.monthlyHistoryDict],
  );

  const comparativeReceiptRows = useMemo<ReceiptRow[]>(() => {
    if (!scenario2ComputedValues) return [];

    return [
      {
        key: "final_value",
        label: "Capital final",
        valueScenario1: scenario1ComputedValues.finalValue,
        valueScenario2: scenario2ComputedValues.finalValue,
        isTotal: true,
      },
      {
        key: "invested",
        label: "Capital investi (initial + versements)",
        valueScenario1: scenario1ComputedValues.finalInvested,
        valueScenario2: scenario2ComputedValues.finalInvested,
      },
      {
        key: "gross_interest",
        label: "Intérêts bruts",
        valueScenario1: scenario1ComputedValues.finalGrossInterest,
        valueScenario2: scenario2ComputedValues.finalGrossInterest,
      },
      {
        key: "fees",
        label: "Frais cumulés",
        valueScenario1: -scenario1ComputedValues.finalFees,
        valueScenario2: -scenario2ComputedValues.finalFees,
      },
      {
        key: "tax",
        label: taxCumulativeLabel,
        valueScenario1: -scenario1ComputedValues.finalTax,
        valueScenario2: -scenario2ComputedValues.finalTax,
      },
      {
        key: "interest",
        label: "Gains nets",
        valueScenario1: scenario1ComputedValues.finalInterestGain,
        valueScenario2: scenario2ComputedValues.finalInterestGain,
      },
    ];
  }, [scenario1ComputedValues, scenario2ComputedValues, taxCumulativeLabel]);

  const comparativeCapitalFinalRow = comparativeReceiptRows[0] ?? null;
  const comparativeCapitalBreakdownRows = comparativeReceiptRows.slice(1);

  const comparisonLeader = useMemo<ComparisonLeader | null>(() => {
    if (!scenario2ComputedValues) return null;
    const delta = scenario2ComputedValues.finalValue - scenario1ComputedValues.finalValue;
    if (Math.abs(delta) < 0.005) return "tie";
    return delta > 0 ? "scenario2" : "scenario1";
  }, [scenario1ComputedValues.finalValue, scenario2ComputedValues]);

  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;

    Chart.getChart(canvas)?.destroy();

    const context = canvas.getContext("2d");
    if (!context) return;

    const chart = new Chart(context, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Versement",
            data: [],
            fill: true,
            borderColor: "#87858180",
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 6,
            backgroundColor: (ctx) => {
              const chart = ctx.chart;
              if (!chart.chartArea) {
                return "rgba(242, 241, 239, 0.8)";
              }
              return createGradient(chart.ctx, chart.chartArea.right, "rgb(242, 241, 239)", "rgb(223, 221, 220)");
            },
          },
          {
            label: "Intérêts",
            data: [],
            fill: true,
            borderColor: "#f2d6ac",
            borderWidth: 1,
            pointRadius: 0,
            pointHoverRadius: 6,
            backgroundColor: (ctx) => {
              const chart = ctx.chart;
              if (!chart.chartArea) {
                return "rgba(248, 232, 205, 0.8)";
              }
              return createGradient(chart.ctx, chart.chartArea.right, "rgb(248, 232, 205)", "rgb(217, 204, 180)");
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => `${CURRENCY_FORMATTER.format(Number(value))} €`,
            },
          },
          x: {
            title: {
              display: true,
              text: "Années",
              align: "end",
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => `${items[0]?.label ?? 0} ans`,
              label: (item) => `${item.dataset.label}: ${CURRENCY_FORMATTER.format(Number(item.parsed.y))} €`,
            },
            mode: "index",
            intersect: false,
          },
          legend: {
            labels: {
              boxWidth: 11,
            },
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.destroy();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const roundedInvested = activeComputedValues.yearlyHistoryDict.invested.map((value) => Math.round(value * 10) / 10);
    const roundedFinal = activeComputedValues.yearlyHistoryDict.value.map((value) => Math.round(value * 10) / 10);
    const labels = activeComputedValues.yearlyHistoryDict.value.map((_, index) => String(index));

    chart.data.labels = labels;
    chart.data.datasets[0].data = roundedInvested;
    chart.data.datasets[1].data = roundedFinal;
    chart.update();
  }, [activeComputedValues]);

  useEffect(() => {
    if (displayMode !== "graph") return;
    requestAnimationFrame(() => {
      chartRef.current?.resize();
      chartRef.current?.update("none");
    });
  }, [displayMode]);

  const handleNumericKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ",") {
      event.preventDefault();
    }
  };

  const handleNumericBeforeInput = (event: FormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (nativeEvent.data !== ",") return;

    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const updated = `${input.value.slice(0, start)}.${input.value.slice(end)}`;

    input.value = updated;
    input.setSelectionRange(start + 1, start + 1);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const handleNumericPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();

    const cleanValue = normalizePastedNumeric(event.clipboardData.getData("text"));

    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    input.value = `${input.value.slice(0, start)}${cleanValue}${input.value.slice(end)}`;
    const cursor = start + cleanValue.length;
    input.setSelectionRange(cursor, cursor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const updateNumericField = (key: "initialAmount" | "monthlyInvested" | "timeHorizon") => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value.replace(",", "."));
      const safeValue = Number.isFinite(value) ? value : 0;

      patchActiveScenarioState((previous) => {
        if (key === "timeHorizon") {
          const nextTimeHorizon = Math.max(0, Math.round(safeValue));
          if (previous.inputData.timeHorizon === nextTimeHorizon) {
            return previous;
          }

          return {
            ...previous,
            inputData: {
              ...previous.inputData,
              timeHorizon: nextTimeHorizon,
            },
          };
        }

        const nextValue = Math.max(0, safeValue);
        if (previous.inputData[key] === nextValue) {
          return previous;
        }

        return {
          ...previous,
          inputData: {
            ...previous.inputData,
            [key]: nextValue,
          },
        };
      });
    };
  };

  const updateRateField = (key: keyof RateInputData) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const normalizedInputValue = normalizeDecimalInput(event.target.value);
      const parsedRateValue = parseRateInput(normalizedInputValue);

      patchActiveScenarioState((previous) => {
        const nextRateInputData =
          previous.rateInputData[key] === normalizedInputValue
            ? previous.rateInputData
            : { ...previous.rateInputData, [key]: normalizedInputValue };

        let nextInputData = previous.inputData;
        if (key === "annualInterestRate") {
          if (previous.inputData.annualInterestRate !== parsedRateValue) {
            nextInputData = {
              ...previous.inputData,
              annualInterestRate: parsedRateValue,
            };
          }
        } else if (key === "annualFeesRate") {
          if (previous.inputData.annualFeesRate !== parsedRateValue) {
            nextInputData = {
              ...previous.inputData,
              annualFeesRate: parsedRateValue,
            };
          }
        } else if (previous.inputData.taxRate !== parsedRateValue) {
          nextInputData = {
            ...previous.inputData,
            taxRate: parsedRateValue,
          };
        }

        const nextSelectedTaxOption = key === "taxRate" ? "custom" : previous.selectedTaxOption;

        if (
          nextRateInputData === previous.rateInputData &&
          nextInputData === previous.inputData &&
          nextSelectedTaxOption === previous.selectedTaxOption
        ) {
          return previous;
        }

        return {
          ...previous,
          inputData: nextInputData,
          rateInputData: nextRateInputData,
          selectedTaxOption: nextSelectedTaxOption,
        };
      });
    };
  };

  const handleTaxOptionChange = (nextOption: TaxOption) => {
    patchActiveScenarioState((previous) => applyTaxOptionToScenario(previous, nextOption));
  };

  const patchInputField = <K extends keyof InputData>(key: K, value: InputData[K]) => {
    patchActiveScenarioState((previous) =>
      previous.inputData[key] === value
        ? previous
        : {
            ...previous,
            inputData: {
              ...previous.inputData,
              [key]: value,
            },
          },
    );
  };

  const setCapitalizationFrequency = (frequencyMonths: CapitalizationFrequencyMonths) => {
    patchInputField("capitalizationFrequencyMonths", frequencyMonths);
  };

  const handleCapitalizationFrequencyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number(event.target.value);
    if (nextValue === 1 || nextValue === 3 || nextValue === 12) {
      setCapitalizationFrequency(nextValue);
    }
  };

  const setAssuranceVieAllowanceMode = (mode: AssuranceVieAllowanceMode) => {
    patchInputField("assuranceVieAllowanceMode", mode);
  };

  const handleScenarioTabClick = (scenarioId: ScenarioId) => {
    if (scenarioId === "scenario1") {
      setActiveScenario("scenario1");
      return;
    }

    setScenarios((previous) => {
      if (previous.scenario2) return previous;
      return {
        ...previous,
        scenario2: cloneScenarioState(previous.scenario1),
      };
    });
    setActiveScenario("scenario2");
  };

  const handleExitComparisonMode = () => {
    setScenarios((previous) => {
      if (!previous.scenario2) return previous;
      return {
        ...previous,
        scenario2: null,
      };
    });
    setActiveScenario("scenario1");
  };

  const setTaxApplicationMethod = (method: TaxApplicationMethod) => {
    patchInputField("taxApplicationMethod", method);
  };

  const callToActionHref = props.callToActionLink?.href || "/offres";
  const callToActionTarget = props.callToActionLink?.target || "_self";
  const callToActionRel = callToActionTarget === "_blank" ? "noopener noreferrer" : undefined;
  const isPreset = activeSelectedTaxOption !== "none" && activeSelectedTaxOption !== "custom";
  const selectedTaxPresetData = isPreset ? TAX_PRESET_BY_KEY[activeSelectedTaxOption] : null;
  const isAssuranceViePreset = activeSelectedTaxOption === "assurance_vie";
  const assuranceVieAllowanceAmount = ASSURANCE_VIE_ALLOWANCE_BY_MODE[activeInputData.assuranceVieAllowanceMode];
  const shouldApplyAssuranceVieAllowance = isAssuranceViePreset && activeInputData.timeHorizon >= 8;
  const getDeltaClassName = (delta: number) => {
    if (delta > 0) return styles.billValuePositive;
    if (delta < 0) return styles.billValueNegative;
    return "";
  };
  const renderScenarioHeaderLabel = (scenarioId: ScenarioId, label: string) => {
    const isWinner = comparisonLeader === scenarioId;
    return <span className={isWinner ? styles.billValueHeaderWinner : ""}>{label}</span>;
  };
  const compareActionLabel = hasScenario2 ? "Retour au mode simple" : "Comparer 2 scénarios";
  const compareActionButtonText = hasScenario2 ? "Revenir à 1 scénario" : "Comparer 2 scénarios";
  const handleCompareAction = () => {
    if (hasScenario2) {
      handleExitComparisonMode();
      return;
    }

    handleScenarioTabClick("scenario2");

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 800px)").matches) {
      simulatorContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleOpenAdvisorModal = () => {
    trackAdvisorModalOpen();
    setIsAdvisorModalOpen(true);
  };

  const renderMarketingBlock = (visibilityClassName: string) => {
    const isComparisonPromo = hasScenario2;

    return (
      <div className={`${styles.bottomPart} ${isComparisonPromo ? styles.bottomPartComparison : ""} ${visibilityClassName}`}>
        <p className={`${styles.comment} ${isComparisonPromo ? styles.commentComparison : ""}`}>
          {isComparisonPromo ? COMPARISON_CTA_HEADLINE : MARKETING_HEADLINE}
        </p>
        <p className={`${styles.commentBody} ${isComparisonPromo ? styles.commentBodyComparison : ""}`}>
          {isComparisonPromo ? COMPARISON_CTA_BODY : MARKETING_BODY}
        </p>
        {props.showCallToAction
          ? isComparisonPromo
            ? (
                <button
                  type="button"
                  className={`${styles.callToAction} ${styles.callToActionComparison}`}
                  onClick={handleOpenAdvisorModal}
                >
                  <span className={styles.callToActionGlow} />
                  <span className={styles.callToActionText}>{COMPARISON_CTA_BUTTON}</span>
                </button>
              )
            : (
                <a className={styles.callToAction} href={callToActionHref} target={callToActionTarget} rel={callToActionRel}>
                  <span className={styles.callToActionGlow} />
                  <span className={styles.callToActionText}>{props.callToActionText}</span>
                </a>
              )
          : null}
        {!isComparisonPromo ? (
          <p className={styles.promoDisclaimer}>
            <em>{MARKETING_DISCLAIMER}</em>
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <section ref={simulatorContainerRef} className={styles.simulatorContainer}>
      <div className={styles.inputPart}>
        {hasScenario2 ? (
          <div className={styles.scenarioTabsRow} role="tablist" aria-label="Scénarios de simulation">
            <button
              type="button"
              role="tab"
              aria-selected={activeScenario === "scenario1"}
              className={`${styles.scenarioTabButton} ${activeScenario === "scenario1" ? styles.scenarioTabButtonActive : ""}`}
              onClick={() => handleScenarioTabClick("scenario1")}
            >
              Scénario 1
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeScenario === "scenario2"}
              className={`${styles.scenarioTabButton} ${activeScenario === "scenario2" ? styles.scenarioTabButtonActive : ""}`}
              onClick={() => handleScenarioTabClick("scenario2")}
            >
              Scénario 2
            </button>
          </div>
        ) : null}

        <div className={styles.inputArea}>
          <div className={styles.inputContainer}>
            <label className={styles.inputLabel} htmlFor="initial-amount">
              Investissement initial
            </label>
            <div className={styles.inputLine}>
              <input
                id="initial-amount"
                className={styles.inputField}
                min={0}
                step="1"
                type="number"
                value={activeInputData.initialAmount}
                onBeforeInput={handleNumericBeforeInput}
                onChange={updateNumericField("initialAmount")}
                onKeyDown={handleNumericKeyDown}
                onPaste={handleNumericPaste}
              />
              <span className={styles.inputSuffix}>€</span>
            </div>
          </div>

          <div className={styles.inputContainer}>
            <label className={styles.inputLabel} htmlFor="time-horizon">
              Horizon d&#39;investissement
            </label>
            <div className={styles.inputLine}>
              <input
                id="time-horizon"
                className={styles.inputField}
                min={0}
                step="1"
                type="number"
                value={activeInputData.timeHorizon}
                onBeforeInput={handleNumericBeforeInput}
                onChange={updateNumericField("timeHorizon")}
                onKeyDown={handleNumericKeyDown}
                onPaste={handleNumericPaste}
              />
              <span className={styles.inputSuffix}>ans</span>
            </div>
          </div>

          <div className={styles.inputContainer}>
            <div className={styles.inputLabelWithHelp}>
              <label className={styles.inputLabel} htmlFor="monthly-invested">
                Versement mensuel
              </label>
              <span className={styles.inputLabelHelpWrap}>
                <button
                  type="button"
                  className={styles.inputHelpIcon}
                  aria-label="Aide sur le versement mensuel"
                  aria-describedby="monthly-invested-help-tooltip"
                >
                  <Info className={styles.inputHelpIconSvg} aria-hidden="true" />
                </button>
                <span id="monthly-invested-help-tooltip" role="tooltip" className={styles.inputHelpTooltip}>
                  <span className={styles.inputHelpTooltipLine}>Hypothèse : versements effectués en début de mois.</span>
                </span>
              </span>
            </div>
            <div className={styles.inputLine}>
              <input
                id="monthly-invested"
                className={styles.inputField}
                min={0}
                step="1"
                type="number"
                value={activeInputData.monthlyInvested}
                onBeforeInput={handleNumericBeforeInput}
                onChange={updateNumericField("monthlyInvested")}
                onKeyDown={handleNumericKeyDown}
                onPaste={handleNumericPaste}
              />
              <span className={styles.inputSuffix}>€</span>
            </div>
          </div>

          <div className={styles.inputRow}>
            <div className={`${styles.inputContainer} ${styles.inputContainerCompact}`}>
              <div className={styles.inputFieldGroup}>
                <label className={styles.inputLabel} htmlFor="annual-interest-rate">
                  Taux d&#39;intérêt
                </label>
                <div className={styles.inputLine}>
                  <input
                    id="annual-interest-rate"
                    className={styles.inputField}
                    inputMode="decimal"
                    type="text"
                    value={activeRateInputData.annualInterestRate}
                    onChange={updateRateField("annualInterestRate")}
                  />
                  <span className={styles.inputSuffix}>%</span>
                </div>
              </div>
            </div>

            <div className={`${styles.inputContainer} ${styles.inputContainerCompact}`}>
              <div className={styles.inputFieldGroup}>
                <div className={styles.inputLabelWithHelp}>
                  <span className={styles.inputLabel}>Capitalisation</span>
                  <span className={styles.inputLabelHelpWrap}>
                    <button
                      type="button"
                      className={styles.inputHelpIcon}
                      aria-label="Aide sur la capitalisation des intérêts"
                      aria-describedby="capitalization-help-tooltip"
                    >
                      <Info className={styles.inputHelpIconSvg} aria-hidden="true" />
                    </button>
                    <span id="capitalization-help-tooltip" role="tooltip" className={styles.inputHelpTooltip}>
                      <span className={styles.inputHelpTooltipLine}>
                        Les versements sont ajoutés en début de mois. Les intérêts sont calculés chaque mois sur la base du taux
                        annuel mensualisé, puis réinvestis selon la fréquence choisie.
                      </span>
                      <span className={styles.inputHelpTooltipLine}>
                        À taux annuel identique, une capitalisation plus fréquente augmente légèrement le rendement effectif.
                      </span>
                    </span>
                  </span>
                </div>
                <div className={`${styles.inputLine} ${styles.inputSelectLine}`}>
                  <select
                    className={styles.inputSelectField}
                    value={activeInputData.capitalizationFrequencyMonths}
                    onChange={handleCapitalizationFrequencyChange}
                  >
                    {CAPITALIZATION_FREQUENCIES.map((frequency) => (
                      <option key={frequency.value} value={frequency.value}>
                        {frequency.label}
                      </option>
                    ))}
                  </select>
                  <span className={styles.inputSelectChevron}>▾</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.inputContainer}>
            <label className={styles.inputLabel} htmlFor="annual-fees-rate">
              Frais de gestion
            </label>
            <div className={styles.inputLine}>
              <input
                id="annual-fees-rate"
                className={styles.inputField}
                inputMode="decimal"
                type="text"
                value={activeRateInputData.annualFeesRate}
                onChange={updateRateField("annualFeesRate")}
              />
              <span className={styles.inputSuffix}>%</span>
            </div>
          </div>

          <div className={styles.impositionSection}>
            <div className={styles.inputLabel}>Imposition</div>

            <div className={styles.taxOptionsGrid}>
              {TAX_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.taxOptionPill} ${activeSelectedTaxOption === option.value ? styles.taxOptionPillActive : ""}`}
                  onClick={() => handleTaxOptionChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {selectedTaxPresetData && !isAssuranceViePreset ? (
              <p className={styles.taxOptionHint}>
                {selectedTaxPresetData.tooltip}
              </p>
            ) : null}

            {isAssuranceViePreset ? (
              <div className={styles.assuranceVieBox}>
                <p className={styles.assuranceVieText}>
                  {selectedTaxPresetData?.tooltip}
                  {shouldApplyAssuranceVieAllowance && assuranceVieAllowanceAmount > 0
                    ? ` Abattement appliqué : ${formatCurrency(assuranceVieAllowanceAmount)} €.`
                    : ""}
                </p>
                <div className={styles.assuranceVieField}>
                  <span className={styles.customTaxLabel}>Abattement AV (part IR)</span>
                  <div className={styles.taxMethodSwitch}>
                    {ASSURANCE_VIE_ALLOWANCE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.taxOptionPill} ${
                          activeInputData.assuranceVieAllowanceMode === option.value ? styles.taxOptionPillActive : ""
                        }`}
                        onClick={() => setAssuranceVieAllowanceMode(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className={styles.assuranceVieText}>
                  {activeInputData.timeHorizon < 8
                    ? "Abattement non appliqué avant 8 ans d'horizon."
                    : "L'abattement s'applique uniquement sur la part IR ; les prélèvements sociaux s'appliquent sur 100 % de la plus-value."}
                </p>
              </div>
            ) : null}

            {activeSelectedTaxOption === "custom" ? (
              <div className={styles.customTaxRow}>
                <div className={styles.customTaxField}>
                  <label className={styles.customTaxLabel} htmlFor="tax-rate">Taux</label>
                  <div className={styles.customTaxInput}>
                    <input
                      id="tax-rate"
                      className={styles.customTaxInputField}
                      inputMode="decimal"
                      type="text"
                      value={activeRateInputData.taxRate}
                      onChange={updateRateField("taxRate")}
                    />
                    <span className={styles.customTaxSuffix}>%</span>
                  </div>
                </div>
                <div className={styles.customTaxField}>
                  <span className={styles.customTaxLabel}>Application des impôts</span>
                  <div className={styles.taxMethodSwitch}>
                    <button
                      type="button"
                      className={`${styles.taxOptionPill} ${
                        activeInputData.taxApplicationMethod === "yearly" ? styles.taxOptionPillActive : ""
                      }`}
                      onClick={() => setTaxApplicationMethod("yearly")}
                    >
                      Annuelle
                    </button>
                    <button
                      type="button"
                      className={`${styles.taxOptionPill} ${
                        activeInputData.taxApplicationMethod === "end_of_investment" ? styles.taxOptionPillActive : ""
                      }`}
                      onClick={() => setTaxApplicationMethod("end_of_investment")}
                    >
                      Au terme
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {renderMarketingBlock(styles.desktopOnly)}
      </div>

      <div className={styles.chartPart}>
        <div className={styles.dataContainer}>
          <div className={styles.resultBox}>
            <div className={styles.resultBoxHeader}>
              <div className={styles.titleResult}>
                <h3 className={styles.resultHeadline}>Capital final&nbsp;:&nbsp;</h3>
                <p className={styles.resultValue}>{formatCurrency(activeComputedValues.finalValue)} €</p>
              </div>
            </div>

            <p className={styles.mainSentence}>
              Vous disposerez d&#39;un capital de{" "}
              <span className={styles.mainSentenceKeyNumber}>{formatCurrency(activeComputedValues.finalValue)} €</span> pour un investissement
              initial de <span className={styles.mainSentenceNumber}>{formatCurrency(activeInputData.initialAmount)} €</span>, des versements
              mensuels de <span className={styles.mainSentenceNumber}>{formatCurrency(activeInputData.monthlyInvested)} €</span> en début de
              mois,
              à un taux annuel de <span className={styles.mainSentenceNumber}>{formatRate(activeInputData.annualInterestRate)} %</span> pendant{" "}
              <span className={styles.mainSentenceNumber}>{activeInputData.timeHorizon} ans</span>, soit un rendement annualisé net de frais
              et d&#39;impôts de{" "}
              <span className={styles.mainSentenceKeyNumber}>{formatRatioToPercent(activeComputedValues.internalRateOfReturn)} %</span>.
            </p>
            <div className={styles.resultSecondaryActions}>
              <button
                type="button"
                className={styles.resultCompareButton}
                aria-label={compareActionLabel}
                title={compareActionLabel}
                onClick={handleCompareAction}
              >
                <span className={styles.resultCompareBadge} aria-hidden="true">
                  <GitCompareArrows className={styles.resultCompareBadgeIcon} />
                </span>
                <span className={styles.resultCompareText}>{compareActionButtonText}</span>
              </button>
            </div>
          </div>

          <div className={styles.tabsRow} role="tablist" aria-label="Vues du simulateur">
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === "graph"}
              className={`${styles.tabButton} ${displayMode === "graph" ? styles.tabButtonActive : ""}`}
              onClick={() => setDisplayMode("graph")}
            >
              Graphique
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === "yearly_table"}
              className={`${styles.tabButton} ${displayMode === "yearly_table" ? styles.tabButtonActive : ""}`}
              onClick={() => setDisplayMode("yearly_table")}
            >
              Tableau annuel
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === "monthly_table"}
              className={`${styles.tabButton} ${displayMode === "monthly_table" ? styles.tabButtonActive : ""}`}
              onClick={() => setDisplayMode("monthly_table")}
            >
              Tableau mensuel
            </button>
          </div>

          <div className={styles.panelContainer}>
            <div className={`${styles.chartArea} ${displayMode === "graph" ? "" : styles.panelHidden}`}>
              <canvas ref={chartCanvasRef} className={styles.chartCanvas} role="img" aria-label="Graphique intérêts composés" />
            </div>

            {displayMode === "yearly_table" ? <CompoundInterestTable rows={yearlyTableRows} /> : null}
            {displayMode === "monthly_table" ? <CompoundInterestTable rows={monthlyTableRows} /> : null}
          </div>

          <div className={styles.billContainer}>
            {hasScenario2 && scenario2ComputedValues ? (
              <>
                <div className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowHeader}`}>
                  <span className={`${styles.billLabel} ${styles.billLabelHeader}`}>Détail</span>
                  <span className={`${styles.billValue} ${styles.billValueHeader}`}>{renderScenarioHeaderLabel("scenario1", "Scénario 1")}</span>
                  <span className={`${styles.billValue} ${styles.billValueHeader}`}>{renderScenarioHeaderLabel("scenario2", "Scénario 2")}</span>
                  <span className={`${styles.billValue} ${styles.billValueHeader}`}>Écart</span>
                </div>
                {comparativeCapitalFinalRow ? (
                  <div className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowTotal}`}>
                    <span className={styles.billLabel}>
                      {renderBillSectionLabel(
                        comparativeCapitalFinalRow.label,
                        isCapitalBreakdownOpen,
                        () => setIsCapitalBreakdownOpen((previous) => !previous),
                      )}
                    </span>
                    <span className={styles.billValue}>{formatReceiptValue(comparativeCapitalFinalRow.valueScenario1)}</span>
                    <span className={styles.billValue}>{formatReceiptValue(comparativeCapitalFinalRow.valueScenario2)}</span>
                    <span
                      className={`${styles.billValue} ${getDeltaClassName(
                        comparativeCapitalFinalRow.valueScenario2 - comparativeCapitalFinalRow.valueScenario1,
                      )}`}
                    >
                      {formatSignedCurrency(
                        comparativeCapitalFinalRow.valueScenario2 - comparativeCapitalFinalRow.valueScenario1,
                      )}
                    </span>
                  </div>
                ) : null}
                {isCapitalBreakdownOpen
                  ? comparativeCapitalBreakdownRows.map((row) => {
                      const delta = row.valueScenario2 - row.valueScenario1;
                      return (
                        <div
                          key={row.key}
                          className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowNested} ${styles.billRowIndented}`}
                        >
                          <span className={styles.billLabel}>{renderBillLabel(row.label)}</span>
                          <span className={styles.billValue}>{formatReceiptValue(row.valueScenario1)}</span>
                          <span className={styles.billValue}>{formatReceiptValue(row.valueScenario2)}</span>
                          <span className={`${styles.billValue} ${getDeltaClassName(delta)}`}>{formatSignedCurrency(delta)}</span>
                        </div>
                      );
                    })
                  : null}
                {scenario2AnnualizedImpact ? (
                  <>
                    <div className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowGrossAnnualized}`}>
                      <span className={styles.billLabel}>
                        {shouldShowAnnualizedImpactRows
                          ? renderBillSectionLabel(
                              "Rendement annualisé brut (avant frais et impôts)",
                              isAnnualizedBreakdownOpen,
                              () => setIsAnnualizedBreakdownOpen((previous) => !previous),
                            )
                          : renderBillStaticSectionLabel("Rendement annualisé brut (avant frais et impôts)")}
                      </span>
                      <span className={styles.billValue}>{formatPercentRatio(scenario1AnnualizedImpact.grossAnnualized)}</span>
                      <span className={styles.billValue}>{formatPercentRatio(scenario2AnnualizedImpact.grossAnnualized)}</span>
                      <span
                        className={`${styles.billValue} ${getDeltaClassName(
                          scenario2AnnualizedImpact.grossAnnualized - scenario1AnnualizedImpact.grossAnnualized,
                        )}`}
                      >
                        {formatRatePointDelta(scenario2AnnualizedImpact.grossAnnualized - scenario1AnnualizedImpact.grossAnnualized)}
                      </span>
                    </div>
                    {shouldShowAnnualizedImpactRows && isAnnualizedBreakdownOpen ? (
                      <>
                        <div className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowNested} ${styles.billRowIndented}`}>
                          <span className={styles.billLabel}>{renderBillLabel(feesImpactLabel)}</span>
                          <span className={styles.billValue}>{formatRatePointDelta(scenario1AnnualizedImpact.feesImpact)}</span>
                          <span className={styles.billValue}>{formatRatePointDelta(scenario2AnnualizedImpact.feesImpact)}</span>
                          <span
                            className={`${styles.billValue} ${getDeltaClassName(
                              scenario2AnnualizedImpact.feesImpact - scenario1AnnualizedImpact.feesImpact,
                            )}`}
                          >
                            {formatRatePointDelta(scenario2AnnualizedImpact.feesImpact - scenario1AnnualizedImpact.feesImpact)}
                          </span>
                        </div>
                        <div className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowNested} ${styles.billRowIndented}`}>
                          <span className={styles.billLabel}>{renderBillLabel(taxImpactLabel)}</span>
                          <span className={styles.billValue}>{formatRatePointDelta(scenario1AnnualizedImpact.taxImpact)}</span>
                          <span className={styles.billValue}>{formatRatePointDelta(scenario2AnnualizedImpact.taxImpact)}</span>
                          <span
                            className={`${styles.billValue} ${getDeltaClassName(
                              scenario2AnnualizedImpact.taxImpact - scenario1AnnualizedImpact.taxImpact,
                            )}`}
                          >
                            {formatRatePointDelta(scenario2AnnualizedImpact.taxImpact - scenario1AnnualizedImpact.taxImpact)}
                          </span>
                        </div>
                      </>
                    ) : null}
                    <div className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowTotal}`}>
                      <span className={styles.billLabel}>{renderBillStaticSectionLabel("Rendement annualisé net")}</span>
                      <span className={styles.billValue}>{formatPercentRatio(scenario1AnnualizedImpact.netAnnualized)}</span>
                      <span className={styles.billValue}>{formatPercentRatio(scenario2AnnualizedImpact.netAnnualized)}</span>
                      <span
                        className={`${styles.billValue} ${getDeltaClassName(
                          scenario2AnnualizedImpact.netAnnualized - scenario1AnnualizedImpact.netAnnualized,
                        )}`}
                      >
                        {formatRatePointDelta(scenario2AnnualizedImpact.netAnnualized - scenario1AnnualizedImpact.netAnnualized)}
                      </span>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <div className={`${styles.billRow} ${styles.billRowTotal}`}>
                  <span className={styles.billLabel}>
                    {renderBillSectionLabel(
                      "Capital final",
                      isCapitalBreakdownOpen,
                      () => setIsCapitalBreakdownOpen((previous) => !previous),
                    )}
                  </span>
                  <span className={styles.billValue}>{formatCurrency(activeComputedValues.finalValue)} €</span>
                </div>
                {isCapitalBreakdownOpen ? (
                  <>
                    <div className={`${styles.billRow} ${styles.billRowNested} ${styles.billRowIndented}`}>
                      <span className={styles.billLabel}>{renderBillLabel("Capital investi (initial + versements)")}</span>
                      <span className={styles.billValue}>{formatCurrency(activeComputedValues.finalInvested)} €</span>
                    </div>
                    <div className={`${styles.billRow} ${styles.billRowNested} ${styles.billRowIndented}`}>
                      <span className={styles.billLabel}>{renderBillLabel("Intérêts bruts")}</span>
                      <span className={styles.billValue}>{formatCurrency(activeComputedValues.finalGrossInterest)} €</span>
                    </div>
                    <div className={`${styles.billRow} ${styles.billRowNested} ${styles.billRowIndented}`}>
                      <span className={styles.billLabel}>{renderBillLabel("Frais cumulés")}</span>
                      <span className={styles.billValue}>-{formatCurrency(activeComputedValues.finalFees)} €</span>
                    </div>
                    <div className={`${styles.billRow} ${styles.billRowNested} ${styles.billRowIndented}`}>
                      <span className={styles.billLabel}>{renderBillLabel(taxCumulativeLabel)}</span>
                      <span className={styles.billValue}>-{formatCurrency(activeComputedValues.finalTax)} €</span>
                    </div>
                    <div className={`${styles.billRow} ${styles.billRowNested} ${styles.billRowIndented}`}>
                      <span className={styles.billLabel}>{renderBillLabel("Gains nets")}</span>
                      <span className={styles.billValue}>{formatCurrency(activeComputedValues.finalInterestGain)} €</span>
                    </div>
                  </>
                ) : null}
                <div className={`${styles.billRow} ${styles.billRowGrossAnnualized}`}>
                  <span className={styles.billLabel}>
                    {shouldShowAnnualizedImpactRows
                      ? renderBillSectionLabel(
                          "Rendement annualisé brut (avant frais et impôts)",
                          isAnnualizedBreakdownOpen,
                          () => setIsAnnualizedBreakdownOpen((previous) => !previous),
                        )
                      : renderBillStaticSectionLabel("Rendement annualisé brut (avant frais et impôts)")}
                  </span>
                  <span className={styles.billValue}>{formatPercentRatio(activeAnnualizedImpact.grossAnnualized)}</span>
                </div>
                {shouldShowAnnualizedImpactRows && isAnnualizedBreakdownOpen ? (
                  <>
                    <div className={`${styles.billRow} ${styles.billRowNested} ${styles.billRowIndented}`}>
                      <span className={styles.billLabel}>{renderBillLabel(feesImpactLabel)}</span>
                      <span className={styles.billValue}>{formatRatePointDelta(activeAnnualizedImpact.feesImpact)}</span>
                    </div>
                    <div className={`${styles.billRow} ${styles.billRowNested} ${styles.billRowIndented}`}>
                      <span className={styles.billLabel}>{renderBillLabel(taxImpactLabel)}</span>
                      <span className={styles.billValue}>{formatRatePointDelta(activeAnnualizedImpact.taxImpact)}</span>
                    </div>
                  </>
                ) : null}
                <div className={`${styles.billRow} ${styles.billRowTotal}`}>
                  <span className={styles.billLabel}>{renderBillStaticSectionLabel("Rendement annualisé net")}</span>
                  <span className={styles.billValue}>{formatPercentRatio(activeAnnualizedImpact.netAnnualized)}</span>
                </div>
              </>
            )}
          </div>
          {hasAnyTaxes || (hasAnyFees && isAnnualizedBreakdownOpen) ? (
            <div className={styles.billNotes}>
              {hasAnyFees && isAnnualizedBreakdownOpen ? (
                <p className={styles.billNote}>
                  <span className={styles.billNoteMarker}>¹</span>
                  L&apos;impact des frais dépasse le taux affiché parce que les frais se composent comme les intérêts,
                  c&apos;est l&apos;effet de la composition des frais.
                </p>
              ) : null}
              {hasAnyTaxes ? (
                <p className={styles.billNote}>
                  <span className={styles.billNoteMarker}>²</span>
                  Les impôts sont calculés sur les gains bruts après frais. Les gains nets affichés les déduisent déjà.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {renderMarketingBlock(styles.mobileOnly)}

        {props.showDisclaimer ? (
          <div className={styles.disclaimerContainer}>
            <p className={styles.disclaimer}>
              Cet outil est fourni à titre informatif uniquement et ne constitue en aucun cas un conseil financier.
            </p>
            <p className={styles.disclaimer}>Rendement annualisé calculé selon les hypothèses et conventions du simulateur.</p>
          </div>
        ) : null}
      </div>
      <AdvisorContactModal isOpen={isAdvisorModalOpen} onClose={() => setIsAdvisorModalOpen(false)} />
    </section>
  );
}
