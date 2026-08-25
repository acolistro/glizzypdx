import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// Builds a service-role-equivalent Supabase client from the NEW secret
// key system (SUPABASE_SECRET_KEYS), following the exact pattern
// handle-vendor-invite/index.ts established for GLPDX-163 — reading a
// named entry out of a JSON-encoded env var, never the legacy
// SUPABASE_SERVICE_ROLE_KEY (that key's underlying JWT secret was
// revoked as part of that same remediation).
//
// Where its data comes from: raw env-var-shaped strings and a
// createClient function, all passed in by the caller rather than read
// directly from Deno.env here. This is what makes the function testable
// with Vitest at all — Deno.env doesn't exist under Vitest's Node
// environment, so every value that would normally come from it has to
// arrive as a parameter instead.
//
// Where its output goes: the caller (each admin function's index.ts)
// pattern-matches on `outcome` to decide between proceeding with
// `result.supabase` or returning a 500 "server misconfigured" response.
// -----------------------------------------------------------------------

export type CreateServiceRoleClientResult =
  | { outcome: "success"; supabase: SupabaseClient }
  | { outcome: "missing_supabase_url" }
  | { outcome: "missing_secret_keys" }
  | { outcome: "invalid_secret_keys_json" }
  | { outcome: "missing_key_entry" };

export function createServiceRoleClient(deps: {
  supabaseUrl: string | undefined;
  secretKeysRaw: string | undefined;
  secretKeyName: string;
  createClient: (url: string, key: string) => SupabaseClient;
}): CreateServiceRoleClientResult {
  if (!deps.supabaseUrl) {
    return { outcome: "missing_supabase_url" };
  }

  if (!deps.secretKeysRaw) {
    return { outcome: "missing_secret_keys" };
  }

  let secretKeys: Record<string, string>;
  try {
    secretKeys = JSON.parse(deps.secretKeysRaw);
  } catch {
    return { outcome: "invalid_secret_keys_json" };
  }

  const secretKeyValue = secretKeys[deps.secretKeyName];
  if (!secretKeyValue) {
    return { outcome: "missing_key_entry" };
  }

  const supabase = deps.createClient(deps.supabaseUrl, secretKeyValue);
  return { outcome: "success", supabase };
}