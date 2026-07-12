import { useState } from "react";
import { useForm } from "react-hook-form";
import { Turnstile } from "@marsidev/react-turnstile";
import { useVendorInquiry } from "../hooks/useVendorInquiry";
import type { VendorInquiryFormData } from "../hooks/useVendorInquiry";
import styles from "./InquiryForm.module.css";

/**
 * The subset of VendorInquiryFormData that actually comes from form
 * inputs. turnstileToken is deliberately excluded here — React Hook Form
 * manages typed text fields, but the Turnstile token comes from a
 * separate widget callback, not a form input the user types into. We
 * merge the two together at submit time (see onSubmit below).
 */
type InquiryFormFields = Omit<VendorInquiryFormData, "turnstileToken">;

/**
 * The public vendor inquiry form (Gate 1 of vendor onboarding, GLPDX-129).
 * Anonymous, unauthenticated — anyone can submit this, which is exactly
 * why it's protected by Turnstile.
 *
 * Where its data comes from: user input into three fields (business name,
 * contact email, message), managed by React Hook Form; plus a Turnstile
 * token, managed by local useState and set via the widget's onSuccess
 * callback.
 *
 * Where its data goes: on submit, both are merged into a single
 * VendorInquiryFormData object and passed to useVendorInquiry's mutate(),
 * which POSTs it to the submit-vendor-inquiry Edge Function.
 *
 * Non-obvious pattern: the Turnstile token lives in useState, NOT as a
 * React Hook Form field, even though it's technically part of the
 * submitted payload. That's because RHF's model is built around typed
 * inputs (text, checkboxes, etc.) with validation rules — Turnstile's
 * token isn't typed by the user, it's handed to us asynchronously by a
 * third-party widget's callback. Forcing it into RHF's model would mean
 * fighting the library instead of using it for what it's good at.
 */
export function InquiryForm() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const inquiry = useVendorInquiry();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InquiryFormFields>();

  /**
   * Runs only after React Hook Form's own field validation (required,
   * email pattern) already passed — RHF won't call this if validation
   * fails, so we don't need to re-check field values here, only the
   * Turnstile token, which RHF has no knowledge of.
   */
  function onSubmit(fields: InquiryFormFields) {
    if (!turnstileToken) {
      // Defensive guard: the submit button is disabled without a token,
      // so in practice this should be unreachable. Kept anyway because
      // relying solely on a disabled button to prevent an invalid
      // submission is fragile — a future change to the button's disabled
      // logic shouldn't be able to silently reopen this gap.
      return;
    }

    inquiry.mutate({ ...fields, turnstileToken });
  }

  // Once the mutation has succeeded, replace the form entirely with a
  // confirmation message rather than leaving a stale, already-submitted
  // form visible — prevents confused double-submits and matches GLPDX-129's
  // spec of a simple "we got it" acknowledgment.
  if (inquiry.isSuccess) {
    return (
      <div className={styles.confirmation} role="status">
        <p>We got it! Thanks for reaching out — we'll be in touch soon.</p>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {inquiry.isError && (
        <p className={styles.errorBanner} role="alert">
          Something went wrong submitting your inquiry. Please try again.
        </p>
      )}

      <div className={styles.field}>
        <label htmlFor="businessName">Business name</label>
        <input
          id="businessName"
          type="text"
          {...register("businessName", {
            required: "Business name is required.",
          })}
          aria-invalid={errors.businessName ? "true" : "false"}
        />
        {errors.businessName && (
          <p className={styles.fieldError} role="alert">
            {errors.businessName.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="contactEmail">Contact email</label>
        <input
          id="contactEmail"
          type="email"
          {...register("contactEmail", {
            required: "A valid email is required.",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Please enter a valid email address.",
            },
          })}
          aria-invalid={errors.contactEmail ? "true" : "false"}
        />
        {errors.contactEmail && (
          <p className={styles.fieldError} role="alert">
            {errors.contactEmail.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          rows={5}
          {...register("message", { required: "Message is required." })}
          aria-invalid={errors.message ? "true" : "false"}
        />
        {errors.message && (
          <p className={styles.fieldError} role="alert">
            {errors.message.message}
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
        disabled={!turnstileToken || inquiry.isPending}
      >
        {inquiry.isPending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}