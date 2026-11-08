import { supabase } from "../lib/supabase";

export async function saveAssessment(payload) {
  const { data, error } = await supabase.from("eligibility_assessments")
    .insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateApplicationDecision(applicationId, status, adminNotes = "") {
  const { error } = await supabase.from("loan_applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) throw error;
  const { error: decisionError } = await supabase.from("admin_decisions").insert({
    application_id: applicationId, decision: status, internal_notes: adminNotes
  });
  if (decisionError) throw decisionError;
}

export async function saveDocumentRequirements(applicationId, items) {
  const rows = items.filter(x => x.trim()).map(label => ({
    application_id: applicationId, document_name: label.trim(), status: "requested"
  }));
  if (!rows.length) throw new Error("Add at least one required document.");
  const { error } = await supabase.from("document_requirements").insert(rows);
  if (error) throw error;
  await updateApplicationDecision(applicationId, "documents_required", "Additional documents requested.");
}
