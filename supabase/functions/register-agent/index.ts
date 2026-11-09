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

  let createdUserId: string | null = null;

  try {
    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const {
      full_name,
      email,
      mobile,
      city,
      state,
      password,
    } = await req.json();

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (
      !full_name ||
      !cleanEmail ||
      !mobile ||
      !city ||
      !state ||
      !password
    ) {
      return respond({ error: "All fields are required" }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return respond({ error: "Invalid email address" }, 400);
    }

    if (!/^[0-9]{10}$/.test(String(mobile))) {
      return respond({ error: "Enter a valid 10-digit mobile number" }, 400);
    }

    if (String(password).length < 8) {
      return respond({ error: "Password must contain at least 8 characters" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Create Auth account using the password chosen by the agent.
    // Email confirmation is intentionally not bypassed here.
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: cleanEmail,
        password: String(password),
        email_confirm: false,
        user_metadata: {
          full_name: String(full_name).trim(),
        },
      });

    if (authError || !authData.user) {
      return respond({
        error: authError?.message || "Account creation failed",
      }, 400);
    }

    createdUserId = authData.user.id;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: createdUserId,
        full_name: String(full_name).trim(),
        mobile: String(mobile).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        role: "agent",
        is_active: false,
      });

    if (profileError) throw profileError;

    const { error: registrationError } = await admin
      .from("agent_registrations")
      .insert({
        user_id: createdUserId,
        full_name: String(full_name).trim(),
        email: cleanEmail,
        mobile: String(mobile).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        status: "pending",
      });

    if (registrationError) throw registrationError;

    return respond({
      success: true,
      message: "Registration submitted. Verify your email and wait for admin approval.",
    });

  } catch (error) {
    // Remove partially created Auth account if registration failed.
    if (createdUserId) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await admin.auth.admin.deleteUser(createdUserId);
    }

    return respond({
      error: error instanceof Error ? error.message : "Registration failed",
    }, 400);
  }
});
