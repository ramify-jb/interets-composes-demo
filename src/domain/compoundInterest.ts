const MONTHS_PER_YEAR = 12;

export type TaxApplicationMethod = "yearly" | "end_of_investment";

export interface CompoundInterestInput {
  initialAmount?: number;
  monthlyInvested?: number;
  timeHorizonYears?: number;
  annualInterestRatePercent?: number;
  annualFeesRatePercent?: number;
  taxRatePercent?: number;
  taxApplicationMethod?: TaxApplicationMethod;
  adjustPresentValue?: boolean;
}

interface HistorySeries {
  value: number[];
  invested: number[];
  interest: number[];
  fees: number[];
  tax: number[];
}

export interface CompoundInterestResult {
  finalValue: number;
  finalInvested: number;
  finalInterestGain: number;
  finalFees: number;
  finalTax: number;
  returnOnInvestment: number;
  annualizedROI: number;
  internalRateOfReturn: number;
  monthlyHistoryDict: HistorySeries;
  yearlyHistoryDict: HistorySeries;
}

const defaultInput: Required<CompoundInterestInput> = {
  initialAmount: 5000,
  monthlyInvested: 100,
  timeHorizonYears: 10,
  annualInterestRatePercent: 5,
  annualFeesRatePercent: 0,
  taxRatePercent: 0,
  taxApplicationMethod: "end_of_investment",
  adjustPresentValue: true,
};

function toFiniteNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function clamp(value: number, min: number): number {
  return Math.max(value, min);
}

function newHistorySeries(initialValue: number): HistorySeries {
  return {
    value: [initialValue],
    invested: [initialValue],
    interest: [0],
    fees: [0],
    tax: [0],
  };
}

function calculateIrr(cashflows: number[]): number | null {
  if (cashflows.length < 2) return null;

  const hasPositive = cashflows.some((flow) => flow > 0);
  const hasNegative = cashflows.some((flow) => flow < 0);
  if (!hasPositive || !hasNegative) return null;

  const maxIterations = 1000;
  const tolerance = 1e-10;
  const initialGuesses = [-0.99, -0.5, 0, 0.1, 0.5, 0.99];

  for (const initialGuess of initialGuesses) {
    let rate = initialGuess;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let npv = 0;
      let derivativeNpv = 0;

      for (let period = 0; period < cashflows.length; period += 1) {
        const factor = Math.pow(1 + rate, period);
        npv += cashflows[period] / factor;
        derivativeNpv -= (period * cashflows[period]) / (factor * (1 + rate));
      }

      if (Math.abs(npv) < tolerance) {
        return rate;
      }

      if (Math.abs(derivativeNpv) < tolerance) {
        break;
      }

      const nextRate = rate - npv / derivativeNpv;

      if (!Number.isFinite(nextRate) || Number.isNaN(nextRate)) {
        break;
      }

      if (Math.abs(nextRate - rate) < tolerance) {
        return nextRate;
      }

      rate = nextRate;
    }
  }

  return null;
}

function toYearlySeries(monthlyHistory: HistorySeries, months: number): HistorySeries {
  const checkpoints: number[] = [0];
  for (let month = MONTHS_PER_YEAR; month <= months; month += MONTHS_PER_YEAR) {
    checkpoints.push(month);
  }
  if (checkpoints[checkpoints.length - 1] !== months) {
    checkpoints.push(months);
  }

  return {
    value: checkpoints.map((idx) => monthlyHistory.value[idx]),
    invested: checkpoints.map((idx) => monthlyHistory.invested[idx]),
    interest: checkpoints.map((idx) => monthlyHistory.interest[idx]),
    fees: checkpoints.map((idx) => monthlyHistory.fees[idx]),
    tax: checkpoints.map((idx) => monthlyHistory.tax[idx]),
  };
}

export function computeCompoundInterest(input: CompoundInterestInput = {}): CompoundInterestResult {
  const merged = { ...defaultInput, ...input };

  const initialAmount = clamp(toFiniteNumber(merged.initialAmount, defaultInput.initialAmount), 0);
  const monthlyInvested = clamp(toFiniteNumber(merged.monthlyInvested, defaultInput.monthlyInvested), 0);
  const timeHorizonYears = clamp(toFiniteNumber(merged.timeHorizonYears, defaultInput.timeHorizonYears), 0);
  const annualInterestRatePercent = toFiniteNumber(
    merged.annualInterestRatePercent,
    defaultInput.annualInterestRatePercent,
  );
  const annualFeesRatePercent = toFiniteNumber(merged.annualFeesRatePercent, defaultInput.annualFeesRatePercent);
  const taxRatePercent = clamp(toFiniteNumber(merged.taxRatePercent, defaultInput.taxRatePercent), 0);

  const taxApplicationMethod: TaxApplicationMethod =
    merged.taxApplicationMethod === "yearly" || merged.taxApplicationMethod === "end_of_investment"
      ? merged.taxApplicationMethod
      : defaultInput.taxApplicationMethod;

  const adjustPresentValue = Boolean(merged.adjustPresentValue);

  const totalMonths = Math.floor(timeHorizonYears * MONTHS_PER_YEAR);
  const annualInterestRate = annualInterestRatePercent / 100;
  const annualFeesRate = annualFeesRatePercent / 100;
  const taxRate = taxRatePercent / 100;

  const monthlyInterestRate = Math.pow(1 + annualInterestRate, 1 / MONTHS_PER_YEAR) - 1;
  const monthlyFeesRate = Math.pow(1 + annualFeesRate, 1 / MONTHS_PER_YEAR) - 1;

  let currentValue = initialAmount;
  let currentInvested = initialAmount;
  let currentInterestGain = 0;
  let currentFees = 0;
  let currentTax = 0;

  const monthlyHistory = newHistorySeries(initialAmount);

  for (let month = 1; month <= totalMonths; month += 1) {
    currentInvested += monthlyInvested;

    const grossValue = (currentValue + monthlyInvested) * (1 + monthlyInterestRate);
    const monthlyFees = grossValue * monthlyFeesRate;

    currentFees += monthlyFees;
    currentValue = grossValue - monthlyFees;
    currentInterestGain = currentValue - currentInvested;

    let appliedTax = 0;
    const isYearEnd = month % MONTHS_PER_YEAR === 0;

    if (isYearEnd) {
      if (taxApplicationMethod === "yearly") {
        const previousYearInterest = monthlyHistory.interest[month - MONTHS_PER_YEAR] ?? 0;
        appliedTax = (currentInterestGain - previousYearInterest) * taxRate;
      } else if (taxApplicationMethod === "end_of_investment" && month === totalMonths) {
        appliedTax = currentInterestGain * taxRate;
      }
    }

    currentValue -= appliedTax;
    currentInterestGain -= appliedTax;
    currentTax += appliedTax;

    monthlyHistory.value.push(currentValue);
    monthlyHistory.invested.push(currentInvested);
    monthlyHistory.interest.push(currentInterestGain);
    monthlyHistory.fees.push(currentFees);
    monthlyHistory.tax.push(currentTax);
  }

  if (taxApplicationMethod === "end_of_investment" && adjustPresentValue) {
    for (let idx = 0; idx < monthlyHistory.tax.length - 1; idx += 1) {
      monthlyHistory.tax[idx] = monthlyHistory.interest[idx] * taxRate;
      monthlyHistory.interest[idx] = monthlyHistory.interest[idx] * (1 - taxRate);
      monthlyHistory.value[idx] = monthlyHistory.invested[idx] + monthlyHistory.interest[idx];
    }
  }

  const finalIndex = totalMonths;
  const finalValue = monthlyHistory.value[finalIndex] ?? initialAmount;
  const finalInvested = monthlyHistory.invested[finalIndex] ?? initialAmount;
  const finalInterestGain = monthlyHistory.interest[finalIndex] ?? 0;
  const finalFees = monthlyHistory.fees[finalIndex] ?? 0;
  const finalTax = monthlyHistory.tax[finalIndex] ?? 0;

  const returnOnInvestment = finalInvested > 0 ? finalValue / finalInvested - 1 : 0;

  const annualizedROI =
    finalInvested > 0 && timeHorizonYears > 0 ? Math.pow(finalValue / finalInvested, 1 / timeHorizonYears) - 1 : 0;

  const cashflows = [
    -initialAmount,
    ...Array.from({ length: totalMonths }, () => -monthlyInvested),
    finalValue,
  ];

  const monthlyIrr = calculateIrr(cashflows);
  const internalRateOfReturn = monthlyIrr === null ? 0 : Math.pow(1 + monthlyIrr, MONTHS_PER_YEAR) - 1;

  return {
    finalValue,
    finalInvested,
    finalInterestGain,
    finalFees,
    finalTax,
    returnOnInvestment,
    annualizedROI,
    internalRateOfReturn,
    monthlyHistoryDict: monthlyHistory,
    yearlyHistoryDict: toYearlySeries(monthlyHistory, totalMonths),
  };
}
