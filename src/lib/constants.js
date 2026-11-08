export const LOAN_PRODUCTS = [
  { group: "Personal", items: ["Personal Loan", "Salary Loan", "Pension Loan"] },
  { group: "Housing", items: ["Home Purchase Loan", "Home Construction Loan", "Home Extension Loan", "Home Renovation Loan"] },
  { group: "Mortgage / Property", items: ["Loan Against Property (Residential)", "Loan Against Property (Commercial)", "Plot / Land Purchase Loan", "Plot + Construction Loan"] },
  { group: "Business / MSME", items: ["Business Loan", "MSME Loan", "Working Capital", "Term Loan", "Machinery / Equipment Loan", "Invoice / Bill Discounting"] },
  { group: "Education", items: ["Domestic Education Loan", "Overseas Education Loan"] },
  { group: "Project Finance", items: ["Project Finance", "Infrastructure Finance", "Industrial Project Finance"] },
  { group: "Vehicle", items: ["New Vehicle Loan", "Used Vehicle Loan", "Commercial Vehicle Loan"] },
  { group: "Other", items: ["Gold Loan", "Agriculture Loan", "Loan Against Securities", "Loan Against Fixed Deposit", "Other Loan Product"] }
];

export const STATUSES = {
  submitted: "Submitted",
  under_review: "Under review",
  documents_required: "Documents required",
  documents_submitted: "Documents submitted",
  approved_for_processing: "Approved for processing",
  rejected: "Rejected",
  completed: "Completed",
  on_hold: "On hold"
};
