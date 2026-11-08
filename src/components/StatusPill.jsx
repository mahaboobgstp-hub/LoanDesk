import React from "react";
export default function StatusPill({ status }) {
  const tone = status === "rejected" ? "red" :
    ["approved_for_processing", "completed"].includes(status) ? "green" :
    ["documents_required", "on_hold"].includes(status) ? "amber" : "blue";
  const labels = {
    submitted: "Submitted", under_review: "Under review", documents_required: "Documents required",
    documents_submitted: "Documents submitted", approved_for_processing: "Approved for processing",
    rejected: "Rejected", completed: "Completed", on_hold: "On hold"
  };
  return <span className={`pill ${tone}`}>{labels[status] || status}</span>;
}
