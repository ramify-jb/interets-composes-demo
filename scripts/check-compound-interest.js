#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadComputeCompoundInterest() {
  const sourcePath = path.join(__dirname, "..", "src", "domain", "compoundInterest.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const moduleObject = { exports: {} };
  const exportsObject = new Function("module", "exports", "require", `${transpiled}\nreturn module.exports;`)(
    moduleObject,
    moduleObject.exports,
    require,
  );

  return exportsObject.computeCompoundInterest;
}

function assertClose(actual, expected, label, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
}

const computeCompoundInterest = loadComputeCompoundInterest();

{
  const result = computeCompoundInterest({
    initialAmount: 5000,
    monthlyInvested: 0,
    timeHorizonYears: 10,
    annualInterestRatePercent: 5,
    annualFeesRatePercent: 0,
    taxRatePercent: 0,
    capitalizationFrequencyMonths: 1,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });

  const monthlyRate = 0.05 / 12;
  const expectedFinalValue = 5000 * Math.pow(1 + monthlyRate, 120);
  assertClose(result.finalValue, expectedFinalValue, "lump-sum final value");
  assertClose(result.internalRateOfReturn, Math.pow(1 + monthlyRate, 12) - 1, "lump-sum annualized return");
}

{
  const result = computeCompoundInterest({
    initialAmount: 5000,
    monthlyInvested: 100,
    timeHorizonYears: 10,
    annualInterestRatePercent: 5,
    annualFeesRatePercent: 0,
    taxRatePercent: 0,
    capitalizationFrequencyMonths: 1,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });

  const monthlyRate = 0.05 / 12;
  let expectedFinalValue = 5000;
  for (let month = 1; month <= 120; month += 1) {
    expectedFinalValue += 100;
    expectedFinalValue *= 1 + monthlyRate;
  }

  assertClose(result.finalValue, expectedFinalValue, "monthly contribution final value");
  assertClose(result.internalRateOfReturn, Math.pow(1 + monthlyRate, 12) - 1, "monthly contribution annualized return");
  assertClose(result.annualizedROI, result.internalRateOfReturn, "annualized ROI alignment");
}

{
  const result = computeCompoundInterest({
    initialAmount: 5000,
    monthlyInvested: 0,
    timeHorizonYears: 10,
    annualInterestRatePercent: 5,
    annualFeesRatePercent: 0,
    taxRatePercent: 30,
    capitalizationFrequencyMonths: 1,
    taxApplicationMethod: "yearly",
    adjustPresentValue: false,
  });

  let expectedFinalValue = 5000;
  for (let year = 0; year < 10; year += 1) {
    const capitalAtYearStart = expectedFinalValue;
    for (let month = 0; month < 12; month += 1) {
      expectedFinalValue *= 1 + 0.05 / 12;
    }
    expectedFinalValue -= (expectedFinalValue - capitalAtYearStart) * 0.3;
  }

  assertClose(result.finalValue, expectedFinalValue, "yearly tax final value");
}

{
  const yearly = computeCompoundInterest({
    initialAmount: 10000,
    monthlyInvested: 100,
    timeHorizonYears: 1,
    annualInterestRatePercent: 5,
    annualFeesRatePercent: 0,
    taxRatePercent: 0,
    capitalizationFrequencyMonths: 12,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });
  const quarterly = computeCompoundInterest({
    initialAmount: 10000,
    monthlyInvested: 100,
    timeHorizonYears: 1,
    annualInterestRatePercent: 5,
    annualFeesRatePercent: 0,
    taxRatePercent: 0,
    capitalizationFrequencyMonths: 3,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });
  const monthly = computeCompoundInterest({
    initialAmount: 10000,
    monthlyInvested: 100,
    timeHorizonYears: 1,
    annualInterestRatePercent: 5,
    annualFeesRatePercent: 0,
    taxRatePercent: 0,
    capitalizationFrequencyMonths: 1,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });

  assert.equal(Math.round(yearly.finalValue), 11733, "12-month capitalization final value");
  assert.equal(Math.round(quarterly.finalValue), 11742, "3-month capitalization final value");
  assert.equal(Math.round(monthly.finalValue), 11745, "1-month capitalization final value");
  assert.ok(monthly.finalValue > quarterly.finalValue, "monthly capitalization beats quarterly");
  assert.ok(quarterly.finalValue > yearly.finalValue, "quarterly capitalization beats yearly");

  assert.deepEqual(
    yearly.monthlyHistoryDict.value.map((value) => Math.round(value)),
    [10000, 10100, 10200, 10300, 10400, 10500, 10600, 10700, 10800, 10900, 11000, 11100, 11733],
    "yearly monthly history only capitalizes at month 12",
  );
  assert.deepEqual(
    yearly.monthlyHistoryDict.grossInterest.map((value) => Math.round(value)),
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 533],
    "yearly gross interest only appears at month 12",
  );
  assert.deepEqual(
    quarterly.monthlyHistoryDict.value.map((value) => Math.round(value)),
    [10000, 10100, 10200, 10428, 10528, 10628, 10860, 10960, 11060, 11299, 11399, 11499, 11742],
    "quarterly monthly history only capitalizes at months 3, 6, 9 and 12",
  );
  assert.deepEqual(
    quarterly.monthlyHistoryDict.grossInterest.map((value) => Math.round(value)),
    [0, 0, 0, 128, 128, 128, 260, 260, 260, 399, 399, 399, 542],
    "quarterly gross interest only changes on capitalization months",
  );
  assertClose(
    monthly.finalGrossInterest,
    monthly.finalInterestGain + monthly.finalFees + monthly.finalTax,
    "gross interest decomposition",
  );
}

{
  const result = computeCompoundInterest({
    initialAmount: 10000,
    monthlyInvested: 100,
    timeHorizonYears: 10,
    annualInterestRatePercent: 5,
    annualFeesRatePercent: 1.2,
    taxRatePercent: 30,
    capitalizationFrequencyMonths: 12,
    taxApplicationMethod: "end_of_investment",
    adjustPresentValue: false,
  });

  assertClose(
    result.finalGrossInterest,
    result.finalInterestGain + result.finalFees + result.finalTax,
    "gross interest decomposition with fees and tax",
  );
}

console.log("Compound interest checks passed.");
