
import { supabase } from "../lib/supabase";


export async function registerAgent(payload) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const registration = {
    full_name: payload.full_name.trim(),
    email: payload.email.trim().toLowerCase(),
    mobile: payload.mobile.trim(),
    city: payload.city.trim(),
    state: payload.state.trim(),
    status: "pending"
  };

  // Insert only. Do not request a returned row.
  const { error } = await supabase
    .from("agent_registrations")
    .insert(registration);

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "A registration already exists for this email."
      );
    }

    throw error;
  }

  return {
    email: registration.email,
    status: registration.status
  };
}


export async function listAgentRegistrations() {
  const { data, error } = await supabase
    .from("agent_registrations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listAgents() {
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      mobile,
      city,
      state,
      agent_code,
      is_active,
      created_at
    `)
    .eq("role", "agent")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function approveAgent(registrationId) {
  const { data, error } = await supabase.functions.invoke(
    "approve-agent",
    {
      body: { registration_id: registrationId }
    }
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

export async function rejectAgent(registrationId, reason) {
  const { data, error } = await supabase.functions.invoke(
    "reject-agent",
    {
      body: {
        registration_id: registrationId,
        reason
      }
    }
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

export async function getAgentApplications(agentId) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select(`
      id,
      application_no,
      applicant_name,
      mobile,
      loan_product,
      requested_amount,
      status,
      created_at,
      uploaded_documents (
        id,
        original_name,
        document_type,
        created_at
      )
    `)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
