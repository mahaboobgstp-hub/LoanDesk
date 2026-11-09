import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return respond({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } =
      await userClient.auth.getUser();

    if (userError || !user) {
      return respond({ error: "Invalid session" }, 401);
    }

    const { data: adminProfile } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .single();

    if (adminProfile?.role !== "admin" || !adminProfile?.is_active) {
      return respond({ error: "Admin access required" }, 403);
    }

    const { registration_id } = await req.json();

    if (!registration_id) {
      return respond({ error: "Registration ID required" }, 400);
    }

    const { data: registration, error: registrationError } =
      await admin
        .from("agent_registrations")
        .select("*")
        .eq("id", registration_id)
        .single();

    if (registrationError || !registration) {
      return respond({ error: "Registration not found" }, 404);
    }

    if (registration.status !== "pending" || !registration.user_id) {
      return respond({
        error: "Registration is not pending or has no linked account",
      }, 409);
    }

    const { data: authUser, error: authError } =
      await admin.auth.admin.getUserById(registration.user_id);

    if (authError || !authUser.user) {
      return respond({ error: "Agent Auth account not found" }, 404);
    }

    if (!authUser.user.email_confirmed_at) {
      return respond({
        error: "Agent must verify their email before approval",
      }, 409);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,role,is_active")
      .eq("id", registration.user_id)
      .single();

    if (profileError || profile?.role !== "agent") {
      return respond({ error: "Agent profile not found" }, 409);
    }

    const agentCode =
      "AG" + crypto.randomUUID().replaceAll("-", "")
        .slice(0, 8).toUpperCase();

    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update({
        full_name: registration.full_name,
        mobile: registration.mobile,
        city: registration.city,
        state: registration.state,
        agent_code: agentCode,
        is_active: true,
      })
      .eq("id", registration.user_id)
      .eq("role", "agent")
      .eq("is_active", false);

    if (profileUpdateError) throw profileUpdateError;

    const { data: updatedRegistration, error: updateError } =
      await admin
        .from("agent_registrations")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", registration_id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

    if (updateError || !updatedRegistration) {
      await admin.from("profiles")
        .update({ is_active: false })
        .eq("id", registration.user_id);

      return respond({
        error: "Approval could not be completed. Please retry.",
      }, 409);
    }

    return respond({
      success: true,
      message: "Agent approved. They can now log in.",
      agent_code: agentCode,
    });

  } catch (error) {
    return respond({
      error: error instanceof Error ? error.message : "Unexpected error",
    }, 500);
  }
});
