import { supabase } from "../lib/supabase";

export async function createLead(payload) {
  const { data, error } = await supabase.from("loan_applications")
    .insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function listMyLeads() {
  const { data, error } = await supabase.from("loan_applications")
    .select("id, application_no, applicant_name, loan_product, requested_amount, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAllLeads() {
  const { data, error } = await supabase.from("loan_applications")
    .select("id, application_no, applicant_name, loan_product, requested_amount, status, created_at, agent_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLeadBundle(id) {
  const queries = await Promise.all([
    supabase.from("loan_applications").select("*").eq("id", id).single(),
    supabase.from("applicant_income").select("*").eq("application_id", id).maybeSingle(),
    supabase.from("co_applicants").select("*").eq("application_id", id),
    supabase.from("credit_reports").select("*").eq("application_id", id).order("created_at", { ascending: false }),
    supabase.from("credit_accounts").select("*").eq("application_id", id),
    supabase.from("credit_dpd_history").select("*").eq("application_id", id).order("month", { ascending: false }),
    supabase.from("eligibility_assessments").select("*").eq("application_id", id).order("created_at", { ascending: false })
  ]);
  for (const q of queries) if (q.error) throw q.error;
  return {
    application: queries[0].data, income: queries[1].data,
    coApplicants: queries[2].data ?? [], reports: queries[3].data ?? [],
    accounts: queries[4].data ?? [], dpd: queries[5].data ?? [],
    assessments: queries[6].data ?? []
  };
}
