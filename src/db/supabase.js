import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
if (!hasSupabaseConfig) {
  console.log(
    "❌ Supabase env variables missing — falling back to local dedupe mode"
  );
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export function isSupabaseEnabled() {
  return Boolean(supabase);
}
