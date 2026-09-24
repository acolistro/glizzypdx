import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "@tanstack/react-router";
import { Turnstile } from "@marsidev/react-turnstile";
import { useVendorLogin } from "../hooks/useVendorLogin";
import styles from "./VendorLoginForm.module.css";

/**
 * The typed fields React Hook Form manages directly. The Turnstile
 * token is excluded, same reasoning as AdminLoginForm.tsx: it comes
 * from a widget callback, not something the user types, so it lives in
 * useState instead and gets merged in at submit time.
 */
interface VendorLoginFields {
  email: string;
  password: string;
}

/**
 * The vendor login form, shown at /portal/login (GLPDX-50).
 *
 * Where its data comes from: user input into email/password fields
 * (React Hook Form), plus a Turnstile token (useState, set via the
 * widget's onSuccess callback).
 *
 * Where its data goes: merged into a single object and passed to
 * useVendorLogin's mutate(), which calls Supabase Auth's
 * signInWithPassword with the Turnstile token as captchaToken.
 *
 * On success, this component navigates into /portal via useEffect
 * watching login.isSuccess -- same pattern as AdminLoginForm, kept
 * colocated here so the form stays self-contained.
 *
 * Unlike AdminLoginForm, this form DOES include a vendor-inquiry CTA
 * link -- there's no self-registration (GLPDX-49 is obsolete), so
 * someone without an account needs a path to the inquiry pipeline.
 * TEMPORARY: links to "/" (the inquiry form's current location), not
 * /get-listed -- GLPDX-157 hasn't moved the form yet. Plain <a>, not
 * <Link>, since this page is tested without a <RouterProvider> --
 * same interim pattern as -FaqPage.tsx / -ContactPage.tsx (GLPDX-158/
 * 156). MUST become <Link to="/get-listed"> once GLPDX-157 lands.
 *
 * "Forgot password?" renders as plain, non-interactive text rather
 * than a link -- GLPDX-153 (the reset flow) doesn't exist yet, so
 * there's nothing real to link to. MUST become a real link once
 * GLPDX-153 lands.
 */
export function VendorLoginForm() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const login = useVendorLogin();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VendorLoginFields>();

  useEffect(() => {
    if (login.isSuccess) {
      navigate({ to: "/portal" });
    }
  }, [login.isSuccess, navigate]);

  function onSubmit(fields: VendorLoginFields) {
    if (!turnstileToken) {
      // Defensive guard, same as AdminLoginForm: the submit button is
      // disabled without a token already, so this should be
      // unreachable in practice.
      return;
    }

    login.mutate({ ...fields, captchaToken: turnstileToken });
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {login.isError && (
        <p className={styles.errorBanner} role="alert" aria-label="Login failed">
          {login.error?.message ?? "Invalid email or password."}
        </p>
      )}

      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          {...register("email", {
            required: "Email is required.",
          })}
          aria-invalid={errors.email ? "true" : "false"}
        />
        {errors.email && (
          <p className={styles.fieldError} role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password", {
            required: "Password is required.",
          })}
          aria-invalid={errors.password ? "true" : "false"}
        />
        {errors.password && (
          <p className={styles.fieldError} role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Plain text, not a link -- GLPDX-153 doesn't exist yet. */}
      <p className={styles.forgotPassword}>Forgot password?</p>

      <Turnstile
        siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
        onSuccess={setTurnstileToken}
        onExpire={() => setTurnstileToken(null)}
        onError={() => setTurnstileToken(null)}
      />

      <button
        type="submit"
        className={styles.submitButton}
        disabled={!turnstileToken || login.isPending}
      >
        {login.isPending ? "Logging in…" : "Log in"}
      </button>

      <p className={styles.inquiryCta}>
        Don't have an account? Interested in becoming a listed vendor?{" "}
        <a href="/">Reach out here</a>.
      </p>
    </form>
  );
}