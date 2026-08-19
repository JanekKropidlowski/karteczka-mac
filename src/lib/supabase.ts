import { createClient } from "@supabase/supabase-js";

// Ten sam self-hosted Supabase co panel task.kropidlowscy.pl (same-origin przez NPM).
// Anon key jest publiczny (jest w bundlu panelu), dane chroni RLS.
const SUPABASE_URL = "https://task.kropidlowscy.pl";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjIwMDAwMDAwMDB9.LoEx8n8R1Fnm6Ne-YhUmwZQcriajyQQQxnSGLIENCY8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
