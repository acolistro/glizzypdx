import { createClient } from "@supabase/supabase-js";

// This file creates ONE shared Supabase client for the whole app, the
// same way main.tsx creates one shared QueryClient. Every feature that
// needs to talk to Supabase (auth, checkins, vendor profiles) imports
// `supabase` from here rather than creating its own client — this keeps
// auth state and connection config consistent across the app.
//
// Data comes from: environment variables, injected by Vite at build/dev
// time from your .env file. The `VITE_` prefix is required — Vite only
// exposes env vars to client-side code if they start with that prefix,
// as a safety measure so you don't accidentally ship a secret server key
// to the browser. (This is the anon/public key, which is safe to expose —
// Supabase's Row Level Security policies are what actually protect data,
// not keeping this key secret.)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loudly and immediately if these are missing, rather than letting
// the app boot into a broken state where every Supabase call mysteriously
// fails later. This is a deliberate tradeoff: a crash on startup is more
// debuggable than a silent runtime error deep in a component tree.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check that VITE_SUPABASE_URL " +
      "and VITE_SUPABASE_ANON_KEY are set in your .env file (see .env.example).",
  );
}

// This `supabase` object is what every feature hook (e.g. a future
// useVendorCheckin()) will call methods on — supabase.auth.*,
// supabase.from("checkins").*, etc. Exported as a named export (not
// default) so every import site explicitly writes `{ supabase }`,
// making it obvious at a glance what's being imported.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
