import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// TanStack Query mutation hook for the vendor login form (GLPDX-50),
// mirroring useAdminLogin's shape closely -- same useMutation pattern,
// Turnstile verified server-side via Supabase Auth's own captchaToken
// option, same reasoning as useAdminLogin for why that has to happen at
// the Auth endpoint itself rather than a custom Edge Function.
//
// Deliberately SIMPLER than useAdminLogin: no role check. Any account
// that successfully authenticates is treated as a valid vendor login --
// there's no "wrong account type" scenario to guard against here the
// way admin login guards against a non-admin account (explicit decision
// this session, not an oversight).
//
// Where its data comes from: whatever object the caller passes to
// mutate() -- email/password from the login form's fields, plus a
// captchaToken from the Turnstile widget's callback.
//
// Where its data goes: supabase.auth.signInWithPassword(). On success,
// a real Supabase session exists in the browser; the calling component
// reacts to isSuccess and navigates into /portal itself, same pattern
// as AdminLoginForm.
// -----------------------------------------------------------------------

export interface VendorLoginInput {
  email: string;
  password: string;
  captchaToken: string;
}

// Same reasoning as useAdminLogin's GENERIC_LOGIN_ERROR: one message
// for every failure path, so nothing about the response can be used to
// tell a wrong password apart from an unknown email.
const GENERIC_LOGIN_ERROR = "Invalid email or password.";

export function useVendorLogin() {
  return useMutation<void, Error, VendorLoginInput>({
    mutationFn: async ({ email, password, captchaToken }) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });

      if (error) {
        throw new Error(GENERIC_LOGIN_ERROR);
      }

      // Success: a real Supabase session now exists. No role check --
      // see the file-level comment. Nothing further to return; the
      // login form component reacts to isSuccess and navigates itself.
    },
  });
}