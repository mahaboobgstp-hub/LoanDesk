
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
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
      global: { headers: { Authorization: authorization } },
    });

    const adminClient = createClient(url, serviceKey);

    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
      return respond({ error: "Invalid session" }, 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin" || !profile?.is_active) {
      return respond({ error: "Admin access required" }, 403);
    }

    const { registration_id, reason } = await req.json();

    if (!registration_id) {
      return respond({ error: "Registration ID required" }, 400);
    }

    const { data, error } = await adminClient
      .from("agent_registrations")
      .update({
        status: "rejected",
        rejection_reason: reason || "Registration not approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", registration_id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return respond({
        error: "Registration not found or already processed"
      }, 409);
    }

    return respond({ success: true });

  } catch (error) {
    return respond({
      error: error instanceof Error
        ? error.message
        : "Unexpected error"
    }, 500);
  }
});
