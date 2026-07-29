import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "@tanstack/react-router";
import { Turnstile } from "@marsidev/react-turnstile";
import { useAdminLogin } from "../hooks/useAdminLogin";
import styles from "./AdminLoginForm.module.css";

/**
 * The typed fields React Hook Form manages directly. The Turnstile
 * token is deliberately excluded, same reasoning as InquiryForm.tsx: it
 * comes from a widget callback, not something the user types, so it
 * lives in useState instead and gets merged in at submit time.
 */
interface AdminLoginFields {
  email: string;
  password: string;
}

/**
 * The admin login form, shown at /admin/login (public route -- see
 * routes/admin/route.tsx's comments for why this route is unguarded).
 *
 * Where its data comes from: user input into email/password fields
 * (React Hook Form), plus a Turnstile token (useState, set via the
 * widget's onSuccess callback).
 *
 * Where its data goes: merged into a single object and passed to
 * useAdminLogin's mutate(), which calls Supabase Auth's
 * signInWithPassword with the Turnstile token as captchaToken. On
 * success, a real Supabase session now exists in the browser.
 *
 * On success, this component itself navigates into /admin via
 * useEffect watching login.isSuccess -- kept colocated here rather than
 * pushed up to a parent/caller, so the form is fully self-contained and
 * there's only one place that needs to know "what happens after a
 * successful login."
 *
 * No vendor-inquiry call-to-action on this form, unlike the future
 * vendor login page (GLPDX-50) -- admin is single-owner-only with no
 * public onboarding path (confirmed in GLPDX-82's description).
 */
export function AdminLoginForm() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const login = useAdminLogin();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginFields>();

  // Runs once per successful login (isSuccess flips false -> true
  // exactly once per mutate() call, since useAdminLogin's mutationFn
  // doesn't get retried on success). useEffect, not an inline call
  // inside onSubmit, because the actual "did it succeed" signal comes
  // asynchronously from the mutation's state, not synchronously from
  // the submit handler itself.
  useEffect(() => {
    if (login.isSuccess) {
      navigate({ to: "/admin" });
    }
  }, [login.isSuccess, navigate]);

  function onSubmit(fields: AdminLoginFields) {
    if (!turnstileToken) {
      // Defensive guard, same as InquiryForm.tsx: the submit button is
      // disabled without a token already, so this should be
      // unreachable in practice. Kept so a future change to the
      // button's disabled logic can't silently reopen this gap.
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
    </form>
  );
}