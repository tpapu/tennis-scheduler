import { createClient } from "@supabase/supabase-js";
console.log("URL:", process.env.REACT_APP_SUPABASE_URL);
console.log("KEY?", !!process.env.REACT_APP_SUPABASE_ANON_KEY);
export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);