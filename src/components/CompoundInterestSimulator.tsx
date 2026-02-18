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
import * as styles from "./CompoundInterestSimulator.module.css";
import { computeCompoundInterest, TaxApplicationMethod } from "../domain/compoundInterest";
import type { LinkValue } from "../types/webflow";

Chart.register(CategoryScale, LinearScale, PointElement, LineController, LineElement, Filler, Tooltip, Legend);

const CURRENCY_FORMATTER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const RATE_FORMATTER = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

type TaxPresetKey = "assurance_vie" | "per" | "pea" | "cto";
type TaxOption = "none" | TaxPresetKey | "custom";

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
    getTaxRatePercent: () => 24.7,
    tooltip: "Hypothèse simplifiée : rachat après 8 ans au taux global de 24,7 % (7,5 % IR + 17,2 % PS).",
  },
  {
    key: "pea",
    label: "PEA",
    getTaxRatePercent: (timeHorizonYears) => (timeHorizonYears >= 5 ? 18.6 : 31.4),
    tooltip: "Hypothèse simplifiée : 17,2 % de prélèvements sociaux si horizon \u2265 5 ans, sinon flat tax à 30 % + 1,4 % de CS.",
  },
  {
    key: "cto",
    label: "CTO",
    getTaxRatePercent: () => 31.4,
    tooltip: "Hypothèse simplifiée : flat tax (PFU) à 30 % + 1,4 % de contribution supplémentaire, soit 31,4 %.",
  },
  {
    key: "per",
    label: "PER",
    getTaxRatePercent: () => 31.4,
    tooltip: "Hypothèse simplifiée : sortie en capital imposée au taux global de 31,4 % (IR + PS).",
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

const MARKETING_HEADLINE = "Jusqu'à +12,68 % annualisé depuis 5 ans* avec Ramify";
const MARKETING_BODY =
  "Ramify est la gestion pilotée la plus performante et diversifiée du marché. Accédez à un univers complet d'investissement dès 1000 €.";
const MARKETING_DISCLAIMER =
  "*Portefeuille Ramify Flagship pour un risque de 10/10 de 2021 à 2025. Les performances passées ne préjugent pas des performances futures.";

export interface CompoundInterestSimulatorProps {
  initialAmount: number;
  monthlyInvested: number;
  timeHorizon: number;
  annualInterestRate: number;
  annualFeesRate: number;
  taxRate: number;
  defaultTaxApplicationMethod: TaxApplicationMethod;
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

interface TableRow {
  period: string;
  value: number;
  invested: number;
  interest: number;
  fees: number;
  tax: number;
}

interface ReceiptRow {
  key: string;
  label: string;
  valueScenario1: number;
  valueScenario2: number;
  isTotal?: boolean;
}

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

function normalizeDecimalInput(rawValue: string): string {
  const normalized = rawValue.replace(/\./g, ",").replace(/[^0-9,]/g, "");
  const firstCommaIndex = normalized.indexOf(",");
  if (firstCommaIndex < 0) {
    return normalized;
  }

  return `${normalized.slice(0, firstCommaIndex + 1)}${normalized.slice(firstCommaIndex + 1).replace(/,/g, "")}`;
}

function parseRateInput(rawValue: string): number {
  const normalizedValue = rawValue.trim().replace(",", ".");
  if (!normalizedValue || normalizedValue === ".") {
    return 0;
  }

  const parsed = Number(normalizedValue.endsWith(".") ? normalizedValue.slice(0, -1) : normalizedValue);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(parsed, 0);
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

function computeFromInputData(inputData: InputData, adjustPresentValue: boolean) {
  return computeCompoundInterest({
    initialAmount: inputData.initialAmount,
    monthlyInvested: inputData.monthlyInvested,
    timeHorizonYears: inputData.timeHorizon,
    annualInterestRatePercent: inputData.annualInterestRate,
    annualFeesRatePercent: inputData.annualFeesRate,
    taxRatePercent: inputData.taxRate,
    taxApplicationMethod: inputData.taxApplicationMethod,
    adjustPresentValue,
  });
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

function buildTableRows(history: HistorySeries, labelPrefix: "Année" | "Mois"): TableRow[] {
  return history.value.map((value, index) => ({
    period: `${labelPrefix} ${index}`,
    value,
    invested: history.invested[index] ?? 0,
    interest: history.interest[index] ?? 0,
    fees: history.fees[index] ?? 0,
    tax: history.tax[index] ?? 0,
  }));
}

function applyTaxOptionToScenario(previous: ScenarioState, nextOption: TaxOption): ScenarioState {
  let nextInputData = previous.inputData;
  let nextRateInputData = previous.rateInputData;

  if (nextOption === "none") {
    nextInputData = previous.inputData.taxRate === 0 ? previous.inputData : { ...previous.inputData, taxRate: 0 };
    nextRateInputData =
      previous.rateInputData.taxRate === "0" ? previous.rateInputData : { ...previous.rateInputData, taxRate: "0" };
  } else if (nextOption !== "custom") {
    const presetTaxRate = getTaxPresetRate(nextOption, previous.inputData.timeHorizon);
    const formattedPresetRate = formatNumberForInput(presetTaxRate);
    nextInputData =
      Math.abs(previous.inputData.taxRate - presetTaxRate) < 0.0001
        ? previous.inputData
        : { ...previous.inputData, taxRate: presetTaxRate };
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
  adjustPresentValue: true,
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
    () => computeFromInputData(scenarios.scenario1.inputData, props.adjustPresentValue),
    [scenarios.scenario1.inputData, props.adjustPresentValue],
  );

  const scenario2ComputedValues = useMemo(
    () => (scenarios.scenario2 ? computeFromInputData(scenarios.scenario2.inputData, props.adjustPresentValue) : null),
    [scenarios.scenario2, props.adjustPresentValue],
  );

  const activeComputedValues =
    activeScenario === "scenario2" && scenario2ComputedValues ? scenario2ComputedValues : scenario1ComputedValues;

  const yearlyTableRows = useMemo(
    () => buildTableRows(activeComputedValues.yearlyHistoryDict, "Année"),
    [activeComputedValues.yearlyHistoryDict],
  );

  const monthlyTableRows = useMemo(
    () => buildTableRows(activeComputedValues.monthlyHistoryDict, "Mois"),
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
        label: "Versements cumulés",
        valueScenario1: scenario1ComputedValues.finalInvested,
        valueScenario2: scenario2ComputedValues.finalInvested,
      },
      {
        key: "interest",
        label: "Intérêts nets",
        valueScenario1: scenario1ComputedValues.finalInterestGain,
        valueScenario2: scenario2ComputedValues.finalInterestGain,
      },
      {
        key: "fees",
        label: "Frais cumulés",
        valueScenario1: -scenario1ComputedValues.finalFees,
        valueScenario2: -scenario2ComputedValues.finalFees,
      },
      {
        key: "tax",
        label: "Impôts cumulés",
        valueScenario1: -scenario1ComputedValues.finalTax,
        valueScenario2: -scenario2ComputedValues.finalTax,
      },
    ];
  }, [scenario1ComputedValues, scenario2ComputedValues]);

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

    const raw = event.clipboardData.getData("text");
    const normalized = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const chunks = normalized.split(".");
    const cleanValue = chunks.length > 2 ? `${chunks[0]}.${chunks.slice(1).join("")}` : normalized;

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
    patchActiveScenarioState((previous) =>
      previous.inputData.taxApplicationMethod === method
        ? previous
        : {
            ...previous,
            inputData: {
              ...previous.inputData,
              taxApplicationMethod: method,
            },
          },
    );
  };

  const callToActionHref = props.callToActionLink?.href || "/offres";
  const callToActionTarget = props.callToActionLink?.target || "_self";
  const callToActionRel = callToActionTarget === "_blank" ? "noopener noreferrer" : undefined;
  const isPreset = activeSelectedTaxOption !== "none" && activeSelectedTaxOption !== "custom";
  const selectedTaxPresetData = isPreset ? TAX_PRESET_BY_KEY[activeSelectedTaxOption] : null;
  const getDeltaClassName = (delta: number) => {
    if (delta > 0) return styles.billValuePositive;
    if (delta < 0) return styles.billValueNegative;
    return "";
  };
  const compareActionLabel = hasScenario2 ? "Retour au mode simple" : "Comparer 2 scénarios";
  const compareActionIcon = hasScenario2 ? "×" : "+";
  const handleCompareAction = hasScenario2 ? handleExitComparisonMode : () => handleScenarioTabClick("scenario2");

  const renderTable = (rows: TableRow[]) => {
    return (
      <div className={styles.tableWrapper}>
        <table className={styles.tableElement}>
          <thead>
            <tr>
              <th className={styles.tableHeadCell}>Période</th>
              <th className={styles.tableHeadCell}>Capital</th>
              <th className={styles.tableHeadCell}>Versements</th>
              <th className={styles.tableHeadCell}>Intérêts nets</th>
              <th className={styles.tableHeadCell}>Frais</th>
              <th className={styles.tableHeadCell}>Impôts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.period}>
                <td className={styles.tableCell}>{row.period}</td>
                <td className={styles.tableCell}>{formatCurrency(row.value)} €</td>
                <td className={styles.tableCell}>{formatCurrency(row.invested)} €</td>
                <td className={styles.tableCell}>{formatCurrency(row.interest)} €</td>
                <td className={styles.tableCell}>-{formatCurrency(row.fees)} €</td>
                <td className={styles.tableCell}>-{formatCurrency(row.tax)} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMarketingBlock = (visibilityClassName: string) => (
    <div className={`${styles.bottomPart} ${visibilityClassName}`}>
      <p className={styles.comment}>{MARKETING_HEADLINE}</p>
      <p className={styles.commentBody}>{MARKETING_BODY}</p>
      {props.showCallToAction ? (
        <a className={styles.callToAction} href={callToActionHref} target={callToActionTarget} rel={callToActionRel}>
          <span className={styles.callToActionGlow} />
          <span className={styles.callToActionText}>{props.callToActionText}</span>
        </a>
      ) : null}
      <p className={styles.promoDisclaimer}>
        <em>{MARKETING_DISCLAIMER}</em>
      </p>
    </div>
  );

  return (
    <section className={styles.simulatorContainer}>
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
            <label className={styles.inputLabel} htmlFor="monthly-invested">
              Versement mensuel
            </label>
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

          <div className={styles.inputContainer}>
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
            {selectedTaxPresetData ? (
              <p className={styles.taxOptionHint}>{selectedTaxPresetData.tooltip}</p>
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
            <div className={styles.resultBoxActions}>
              <button
                type="button"
                className={styles.resultCompareButton}
                aria-label={compareActionLabel}
                title={compareActionLabel}
                onClick={handleCompareAction}
              >
                <span className={styles.resultCompareIcon} aria-hidden="true">
                  {compareActionIcon}
                </span>
              </button>
              <span className={styles.resultCompareTooltip}>{compareActionLabel}</span>
            </div>
            <div className={styles.titleResult}>
              <h3 className={styles.resultHeadline}>Capital final&nbsp;:&nbsp;</h3>
              <p className={styles.resultValue}>{formatCurrency(activeComputedValues.finalValue)} €</p>
            </div>

            <p className={styles.mainSentence}>
              Vous disposerez d&#39;un capital de{" "}
              <span className={styles.mainSentenceKeyNumber}>{formatCurrency(activeComputedValues.finalValue)} €</span> pour un investissement
              initial de <span className={styles.mainSentenceNumber}>{formatCurrency(activeInputData.initialAmount)} €</span>, des versements
              mensuels de <span className={styles.mainSentenceNumber}>{formatCurrency(activeInputData.monthlyInvested)} €</span>, à un taux annuel
              de <span className={styles.mainSentenceNumber}>{formatRate(activeInputData.annualInterestRate)} %</span> pendant{" "}
              <span className={styles.mainSentenceNumber}>{activeInputData.timeHorizon} ans</span>, soit une performance nette de frais et
              d&#39;impôts* de <span className={styles.mainSentenceKeyNumber}>{formatRatioToPercent(activeComputedValues.internalRateOfReturn)} %</span>.
            </p>
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

            {displayMode === "yearly_table" ? renderTable(yearlyTableRows) : null}
            {displayMode === "monthly_table" ? renderTable(monthlyTableRows) : null}
          </div>

          <div className={styles.billContainer}>
            {hasScenario2 && scenario2ComputedValues ? (
              <>
                <div className={`${styles.billRow} ${styles.billRowComparative} ${styles.billRowHeader}`}>
                  <span className={`${styles.billLabel} ${styles.billLabelHeader}`}>Détail</span>
                  <span className={`${styles.billValue} ${styles.billValueHeader}`}>Scénario 1</span>
                  <span className={`${styles.billValue} ${styles.billValueHeader}`}>Scénario 2</span>
                  <span className={`${styles.billValue} ${styles.billValueHeader}`}>Écart</span>
                </div>
                {comparativeReceiptRows.map((row) => {
                  const delta = row.valueScenario2 - row.valueScenario1;
                  return (
                    <div
                      key={row.key}
                      className={`${styles.billRow} ${styles.billRowComparative} ${row.isTotal ? styles.billRowTotal : ""}`}
                    >
                      <span className={styles.billLabel}>{row.label}</span>
                      <span className={styles.billValue}>{formatReceiptValue(row.valueScenario1)}</span>
                      <span className={styles.billValue}>{formatReceiptValue(row.valueScenario2)}</span>
                      <span className={`${styles.billValue} ${getDeltaClassName(delta)}`}>{formatSignedCurrency(delta)}</span>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <div className={`${styles.billRow} ${styles.billRowTotal}`}>
                  <span className={styles.billLabel}>Capital final</span>
                  <span className={styles.billValue}>{formatCurrency(activeComputedValues.finalValue)} €</span>
                </div>
                <div className={styles.billRow}>
                  <span className={styles.billLabel}>Versements cumulés</span>
                  <span className={styles.billValue}>{formatCurrency(activeComputedValues.finalInvested)} €</span>
                </div>
                <div className={styles.billRow}>
                  <span className={styles.billLabel}>Intérêts nets</span>
                  <span className={styles.billValue}>{formatCurrency(activeComputedValues.finalInterestGain)} €</span>
                </div>
                <div className={styles.billRow}>
                  <span className={styles.billLabel}>Frais cumulés</span>
                  <span className={styles.billValue}>-{formatCurrency(activeComputedValues.finalFees)} €</span>
                </div>
                <div className={styles.billRow}>
                  <span className={styles.billLabel}>Impôts cumulés</span>
                  <span className={styles.billValue}>-{formatCurrency(activeComputedValues.finalTax)} €</span>
                </div>
              </>
            )}
          </div>
        </div>

        {hasScenario2 && props.showCallToAction ? (
          <div className={styles.advisorLinkRow}>
            <a className={`${styles.callToAction} ${styles.advisorLink}`} href="https://www.ramify.fr/contact" target="_self">
              <span className={styles.callToActionGlow} />
              <span className={styles.callToActionText}>Echanger avec un conseiller</span>
            </a>
          </div>
        ) : null}

        {renderMarketingBlock(styles.mobileOnly)}

        {props.showDisclaimer ? (
          <div className={styles.disclaimerContainer}>
            <p className={styles.disclaimer}>
              Cet outil est fourni à titre informatif uniquement et ne constitue en aucun cas un conseil financier.
            </p>
            <p className={styles.disclaimer}>
              * Taux de rendement interne,&nbsp;
              <a
                className={styles.disclaimerLink}
                href="https://www.ramify.fr/finance-quantitative/calcul-performances-methodologie-ramify"
                target="_blank"
                rel="noreferrer"
              >
                plus d&#39;infos sur la méthode de calcul ici
              </a>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
