import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// TanStack Query mutation hook for the admin login form, mirroring the
// shape of useVendorInquiry (same useMutation pattern, same
// data-in/data-out structure).
//
// Where its data comes from: whatever object the caller passes to
// mutate() -- email/password from the login form's fields, plus a
// captchaToken from the Turnstile widget's callback.
//
// Where its data goes: supabase.auth.signInWithPassword(), which is
// Supabase's own hosted Auth endpoint. The Turnstile token is passed as
// `options.captchaToken` so Supabase verifies it server-side, as part of
// its own Auth flow -- NOT via a custom Edge Function like the vendor
// inquiry form uses. That custom-function pattern doesn't work for auth:
// Supabase's Auth endpoint is public and callable directly with the anon
// key, so a bot could just skip our verification step and hit Supabase
// directly. Only a check enforced by Supabase itself, at the endpoint,
// can't be routed around.
//
// SECURITY: authentication succeeding is not enough to succeed here. If
// signInWithPassword works but the resulting session's role isn't
// "admin" (e.g. a real account, just not THE admin account), we sign
// that session back out immediately and throw the exact same generic
// error a wrong password would produce. Without this, a valid-but-wrong
// account would get a session that just sits there unused, AND the
// error response would differ from a wrong-password response in a way
// that leaks which accounts exist -- the same account-enumeration risk
// GLPDX-82 already calls out for the credentials-invalid case.
// -----------------------------------------------------------------------

export interface AdminLoginInput {
  email: string;
  password: string;
  captchaToken: string;
}

// A single generic, unhelpful message for every failure path -- wrong
// password, unknown email, and wrong-role-but-real-account all look
// identical from outside this hook. Distinguishing any of them in the
// UI would leak information an attacker could use.
const GENERIC_LOGIN_ERROR = "Invalid email or password.";

export function useAdminLogin() {
  return useMutation<void, Error, AdminLoginInput>({
    mutationFn: async ({ email, password, captchaToken }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });

      if (error) {
        throw new Error(GENERIC_LOGIN_ERROR);
      }

      const role = data.session?.user.app_metadata?.role;

      if (role !== "admin") {
        // Real credentials, wrong account. Don't leave this session
        // sitting around authenticated-but-unauthorized -- undo it
        // completely before reporting failure.
        await supabase.auth.signOut();
        throw new Error(GENERIC_LOGIN_ERROR);
      }

      // Success: a real Supabase session now exists for the admin.
      // Nothing further to return -- the login form component reacts to
      // isSuccess and navigates into /admin itself.
    },
  });
}