import { supabase } from "../lib/supabase";

export async function signIn(email, password) {
  if (!supabase) throw new Error("Supabase is not configured. Add the project URL and publishable key.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("id, full_name, role, is_active").eq("id", data.user.id).single();
  if (profileError) throw profileError;
  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error("Your account is inactive. Contact the administrator.");
  }
  return { user: data.user, profile };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles")
    .select("id, full_name, role, is_active").eq("id", userId).single();
  if (error) throw error;
  return data;
}
