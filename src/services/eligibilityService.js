// Decision-support calculations. These are configurable scenarios, not lender sanction rules.

export function calculateAvailableEmi({
  incomeAmount, eligibleIncomePercent, existingMonthlyEmi, otherMonthlyObligations = 0
}) {
  const eligibleIncome = Math.max(0, Number(incomeAmount || 0) * Number(eligibleIncomePercent || 0) / 100);
  const obligations = Math.max(0, Number(existingMonthlyEmi || 0)) + Math.max(0, Number(otherMonthlyObligations || 0));
  return {
    eligibleIncome,
    totalExistingObligations: obligations,
    availableEmi: Math.max(0, eligibleIncome - obligations),
    shortfall: Math.max(0, obligations - eligibleIncome)
  };
}

export function calculateEmi(principal, annualRatePercent, tenureMonths) {
  const p = Math.max(0, Number(principal || 0));
  const n = Math.max(0, Number(tenureMonths || 0));
  const r = Math.max(0, Number(annualRatePercent || 0)) / 1200;
  if (!p || !n) return 0;
  if (!r) return p / n;
  const factor = Math.pow(1 + r, n);
  return p * r * factor / (factor - 1);
}

export function calculateEligiblePrincipal(monthlyEmi, annualRatePercent, tenureMonths) {
  const emi = Math.max(0, Number(monthlyEmi || 0));
  const n = Math.max(0, Number(tenureMonths || 0));
  const r = Math.max(0, Number(annualRatePercent || 0)) / 1200;
  if (!emi || !n) return 0;
  if (!r) return emi * n;
  const factor = Math.pow(1 + r, n);
  return emi * (factor - 1) / (r * factor);
}

export function evaluateScenario(input) {
  const capacity = calculateAvailableEmi(input);
  const maxLoan = calculateEligiblePrincipal(capacity.availableEmi, input.annualInterestRate, input.tenureMonths);
  const requestedEmi = calculateEmi(input.requestedAmount, input.annualInterestRate, input.tenureMonths);
  return {
    ...capacity,
    maximumEligibleLoan: maxLoan,
    requestedLoanEmi: requestedEmi,
    requestedAmountFeasible: requestedEmi <= capacity.availableEmi && capacity.availableEmi > 0
  };
}
