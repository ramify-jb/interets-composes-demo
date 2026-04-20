const MONTHS_PER_YEAR = 12;

export type TaxApplicationMethod = "yearly" | "end_of_investment";
export type CapitalizationFrequencyMonths = 1 | 3 | 12;

export interface CompoundInterestInput {
  initialAmount?: number;
  monthlyInvested?: number;
  timeHorizonYears?: number;
  annualInterestRatePercent?: number;
  annualFeesRatePercent?: number;
  taxRatePercent?: number;
  taxIncomeRatePercent?: number;
  taxSocialRatePercent?: number;
  annualTaxAllowance?: number;
  taxApplicationMethod?: TaxApplicationMethod;
  capitalizationFrequencyMonths?: CapitalizationFrequencyMonths;
  adjustPresentValue?: boolean;
}

interface HistorySeries {
  value: number[];
  invested: number[];
  contributions: number[];
  interest: number[];
  grossInterest: number[];
  fees: number[];
  tax: number[];
}

export interface CompoundInterestResult {
  finalValue: number;
  finalInvested: number;
  finalInterestGain: number;
  finalGrossInterest: number;
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
  taxIncomeRatePercent: 0,
  taxSocialRatePercent: 0,
  annualTaxAllowance: 0,
  taxApplicationMethod: "end_of_investment",
  capitalizationFrequencyMonths: 1,
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
    contributions: [0],
    interest: [0],
    grossInterest: [0],
    fees: [0],
    tax: [0],
  };
}

function parseCapitalizationFrequencyMonths(
  value: CapitalizationFrequencyMonths | number | undefined,
): CapitalizationFrequencyMonths {
  if (value === 3 || value === 12) {
    return value;
  }
  return 1;
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
    contributions: checkpoints.map((idx) => monthlyHistory.contributions[idx]),
    interest: checkpoints.map((idx) => monthlyHistory.interest[idx]),
    grossInterest: checkpoints.map((idx) => monthlyHistory.grossInterest[idx]),
    fees: checkpoints.map((idx) => monthlyHistory.fees[idx]),
    tax: checkpoints.map((idx) => monthlyHistory.tax[idx]),
  };
}

function computeTaxAmount({
  taxableGain,
  incomeTaxRate,
  socialTaxRate,
  allowance,
}: {
  taxableGain: number;
  incomeTaxRate: number;
  socialTaxRate: number;
  allowance: number;
}): number {
  if (taxableGain <= 0) {
    return 0;
  }

  const taxableIncomePart = Math.max(0, taxableGain - allowance);
  return taxableIncomePart * incomeTaxRate + taxableGain * socialTaxRate;
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
  const taxIncomeRatePercent = clamp(toFiniteNumber(merged.taxIncomeRatePercent, defaultInput.taxIncomeRatePercent), 0);
  const taxSocialRatePercent = clamp(toFiniteNumber(merged.taxSocialRatePercent, defaultInput.taxSocialRatePercent), 0);
  const annualTaxAllowance = clamp(toFiniteNumber(merged.annualTaxAllowance, defaultInput.annualTaxAllowance), 0);
  const capitalizationFrequencyMonths = parseCapitalizationFrequencyMonths(merged.capitalizationFrequencyMonths);

  const taxApplicationMethod: TaxApplicationMethod =
    merged.taxApplicationMethod === "yearly" || merged.taxApplicationMethod === "end_of_investment"
      ? merged.taxApplicationMethod
      : defaultInput.taxApplicationMethod;

  const adjustPresentValue = Boolean(merged.adjustPresentValue);

  const totalMonths = Math.floor(timeHorizonYears * MONTHS_PER_YEAR);
  const annualInterestRate = annualInterestRatePercent / 100;
  const annualFeesRate = annualFeesRatePercent / 100;
  const incomeTaxRate = (taxIncomeRatePercent > 0 ? taxIncomeRatePercent : taxRatePercent) / 100;
  const socialTaxRate = taxSocialRatePercent / 100;

  const monthlyInterestAccrualRate = annualInterestRate / MONTHS_PER_YEAR;

  let workingCapital = initialAmount;
  let currentInvested = initialAmount;
  let currentContributions = 0;
  let currentInterestGain = 0;
  let currentGrossInterest = 0;
  let currentFees = 0;
  let currentTax = 0;
  let lastFeesApplicationMonth = 0;
  let interestGainAfterPreviousTaxEvent = 0;
  let accruedInterestBuffer = 0;

  const monthlyHistory = newHistorySeries(initialAmount);

  for (let month = 1; month <= totalMonths; month += 1) {
    const isFinalMonth = month === totalMonths;
    const isCapitalizationMonth = month % capitalizationFrequencyMonths === 0 || isFinalMonth;
    const isYearEnd = month % MONTHS_PER_YEAR === 0;

    // Match the spreadsheet reference: each monthly contribution is invested
    // at the beginning of the month, then earns interest immediately.
    currentInvested += monthlyInvested;
    currentContributions += monthlyInvested;
    workingCapital += monthlyInvested;

    const monthlyInterest = workingCapital * monthlyInterestAccrualRate;
    accruedInterestBuffer += monthlyInterest;

    if (isCapitalizationMonth) {
      workingCapital += accruedInterestBuffer;
      accruedInterestBuffer = 0;
    }

    const shouldApplyFees = isYearEnd || (isFinalMonth && month !== lastFeesApplicationMonth);

    if (shouldApplyFees && annualFeesRate > 0) {
      const monthsSinceLastFees = month - lastFeesApplicationMonth;
      const periodFeesRate = Math.pow(1 + annualFeesRate, monthsSinceLastFees / MONTHS_PER_YEAR) - 1;
      const appliedFees = workingCapital * periodFeesRate;
      currentFees += appliedFees;
      workingCapital -= appliedFees;
      lastFeesApplicationMonth = month;
    }

    currentInterestGain = workingCapital - currentInvested;

    let appliedTax = 0;

    const isYearlyTaxEvent = taxApplicationMethod === "yearly" && (isYearEnd || isFinalMonth);
    const isEndOfInvestmentTaxEvent = taxApplicationMethod === "end_of_investment" && isFinalMonth;

    if (isYearlyTaxEvent) {
      const yearlyTaxableGain = currentInterestGain - interestGainAfterPreviousTaxEvent;
      appliedTax = computeTaxAmount({
        taxableGain: yearlyTaxableGain,
        incomeTaxRate,
        socialTaxRate,
        allowance: annualTaxAllowance,
      });
    } else if (isEndOfInvestmentTaxEvent) {
      appliedTax = computeTaxAmount({
        taxableGain: currentInterestGain,
        incomeTaxRate,
        socialTaxRate,
        allowance: annualTaxAllowance,
      });
    }

    workingCapital -= appliedTax;
    currentInterestGain -= appliedTax;
    currentTax += appliedTax;
    if (isYearlyTaxEvent) {
      interestGainAfterPreviousTaxEvent = currentInterestGain;
    }

    currentGrossInterest = currentInterestGain + currentFees + currentTax;

    monthlyHistory.value.push(workingCapital);
    monthlyHistory.invested.push(currentInvested);
    monthlyHistory.contributions.push(currentContributions);
    monthlyHistory.interest.push(currentInterestGain);
    monthlyHistory.grossInterest.push(currentGrossInterest);
    monthlyHistory.fees.push(currentFees);
    monthlyHistory.tax.push(currentTax);
  }

  if (taxApplicationMethod === "end_of_investment" && adjustPresentValue && annualTaxAllowance === 0) {
    const virtualFlatTaxRate = incomeTaxRate + socialTaxRate;
    for (let idx = 0; idx < monthlyHistory.tax.length - 1; idx += 1) {
      const taxableGain = Math.max(0, monthlyHistory.grossInterest[idx] - monthlyHistory.fees[idx]);
      monthlyHistory.tax[idx] = taxableGain * virtualFlatTaxRate;
      monthlyHistory.interest[idx] =
        monthlyHistory.grossInterest[idx] - monthlyHistory.fees[idx] - monthlyHistory.tax[idx];
      monthlyHistory.value[idx] = monthlyHistory.invested[idx] + monthlyHistory.interest[idx];
    }
  }

  const finalIndex = totalMonths;
  const finalValue = monthlyHistory.value[finalIndex] ?? initialAmount;
  const finalInvested = monthlyHistory.invested[finalIndex] ?? initialAmount;
  const finalInterestGain = monthlyHistory.interest[finalIndex] ?? 0;
  const finalGrossInterest = monthlyHistory.grossInterest[finalIndex] ?? 0;
  const finalFees = monthlyHistory.fees[finalIndex] ?? 0;
  const finalTax = monthlyHistory.tax[finalIndex] ?? 0;

  const returnOnInvestment = finalInvested > 0 ? finalValue / finalInvested - 1 : 0;

  const cashflows = Array.from({ length: totalMonths + 1 }, () => 0);
  cashflows[0] = -initialAmount;
  if (totalMonths > 0) {
    cashflows[0] -= monthlyInvested;
  }
  for (let month = 1; month < totalMonths; month += 1) {
    cashflows[month] -= monthlyInvested;
  }
  cashflows[totalMonths] += finalValue;

  const monthlyIrr = calculateIrr(cashflows);
  const internalRateOfReturn = monthlyIrr === null ? 0 : Math.pow(1 + monthlyIrr, MONTHS_PER_YEAR) - 1;
  const annualizedROI = internalRateOfReturn;

  return {
    finalValue,
    finalInvested,
    finalInterestGain,
    finalGrossInterest,
    finalFees,
    finalTax,
    returnOnInvestment,
    annualizedROI,
    internalRateOfReturn,
    monthlyHistoryDict: monthlyHistory,
    yearlyHistoryDict: toYearlySeries(monthlyHistory, totalMonths),
  };
}
