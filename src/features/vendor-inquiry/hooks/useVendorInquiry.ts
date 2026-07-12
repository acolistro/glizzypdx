import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";

/**
 * The shape of data this hook sends to the submit-vendor-inquiry Edge
 * Function. Mirrors VendorInquiryInput on the backend (supabase/functions/
 * submit-vendor-inquiry/create-vendor-inquiry.ts) — kept as a separate
 * type here rather than importing across the frontend/backend boundary,
 * since Deno Edge Function code and Vite frontend code are built and
 * type-checked independently.
 */
export interface VendorInquiryFormData {
  businessName: string;
  contactEmail: string;
  message: string;
  turnstileToken: string;
}

/**
 * The JSON body the Edge Function responds with. Only the fields the
 * frontend actually needs to react to are modeled here.
 */
export interface VendorInquiryResponse {
  outcome:
    | "created"
    | "invalid_captcha"
    | "validation_error"
    | "verification_error"
    | "database_error";
  inquiryId?: string;
  message?: string;
}

/**
 * A React Query mutation hook that submits the public vendor inquiry form.
 *
 * Where its data comes from: whatever object the caller passes to
 * `mutate()` — typically the validated output of a React Hook Form
 * <form onSubmit>, plus the Turnstile token from the widget's callback.
 *
 * Where its data goes: POSTed to the `submit-vendor-inquiry` Supabase Edge
 * Function via `supabase.functions.invoke`, which handles auth headers
 * and the request/response plumbing for us (no anon key/JWT is required
 * here since this function is meant to be publicly callable — RLS on
 * vendor_inquiries doesn't come into play because we insert with
 * service_role INSIDE the function, not from this client).
 *
 * Why useMutation instead of useQuery: this is a one-shot POST triggered
 * by a user action (form submit), not data we want cached or
 * automatically refetched — that's exactly what TanStack Query's
 * mutation API is for, as opposed to its query API.
 *
 * supabase-js's functions.invoke() treats any non-2xx response as
 * `{ data: null, error }` rather than throwing — we re-throw here so
 * TanStack Query's mutation correctly reports isError/onError instead of
 * silently treating a 400 (invalid captcha) as a success.
 */
export function useVendorInquiry() {
  return useMutation<VendorInquiryResponse, Error, VendorInquiryFormData>({
    mutationFn: async (formData: VendorInquiryFormData) => {
      const { data, error } = await supabase.functions.invoke(
        "submit-vendor-inquiry",
        { body: formData },
      );

      if (error) {
        throw error;
      }

      return data as VendorInquiryResponse;
    },
  });
}