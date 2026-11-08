
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    if (!authorization) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const adminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return respond({ error: "Invalid session" }, 401);
    }

    const { data: profile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .single();

    if (
      profileError ||
      profile?.role !== "admin" ||
      !profile?.is_active
    ) {
      return respond({ error: "Admin access required" }, 403);
    }

    const { registration_id } = await req.json();

    if (!registration_id) {
      return respond({ error: "Registration ID required" }, 400);
    }

    const { data: registration, error: registrationError } =
      await adminClient
        .from("agent_registrations")
        .select("*")
        .eq("id", registration_id)
        .single();

    if (registrationError || !registration) {
      return respond({ error: "Registration not found" }, 404);
    }

    if (registration.status !== "pending") {
      return respond({ error: "Registration already processed" }, 409);
    }

    const { data: existing } = await adminClient.auth.admin
      .listUsers({ page: 1, perPage: 1000 });

    const alreadyExists = existing?.users?.some(
      (u) => u.email?.toLowerCase() ===
        registration.email.toLowerCase()
    );

    if (alreadyExists) {
      return respond({
        error: "An Auth account already exists for this email. Resolve it manually before approval."
      }, 409);
    }

    const { data: invited, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(
        registration.email,
        {
          data: {
            full_name: registration.full_name,
          },
        }
      );

    if (inviteError || !invited.user) {
      return respond({
        error: inviteError?.message || "Invitation failed"
      }, 400);
    }

    const agentCode =
      "AG" + crypto.randomUUID().replaceAll("-", "")
        .slice(0, 8).toUpperCase();

    const { error: profileError2 } = await adminClient
      .from("profiles")
      .upsert({
        id: invited.user.id,
        full_name: registration.full_name,
        mobile: registration.mobile,
        city: registration.city,
        state: registration.state,
        agent_code: agentCode,
        role: "agent",
        is_active: false,
      });

    if (profileError2) {
      await adminClient.auth.admin.deleteUser(invited.user.id);
      return respond({
        error: "Could not create agent profile"
      }, 500);
    }

    const { error: registrationUpdateError } =
      await adminClient
        .from("agent_registrations")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", registration_id)
        .eq("status", "pending");

    if (registrationUpdateError) {
      await adminClient.auth.admin.deleteUser(invited.user.id);
      return respond({
        error: "Could not complete registration approval"
      }, 500);
    }

    return respond({
      success: true,
      message: "Agent approved and invitation sent.",
      agent_code: agentCode,
    });

  } catch (error) {
    return respond({
      error: error instanceof Error
        ? error.message
        : "Unexpected error"
    }, 500);
  }
});
