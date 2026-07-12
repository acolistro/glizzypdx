import { createClient } from "jsr:@supabase/supabase-js@2";
import { createVendorInquiry } from "./create-vendor-inquiry.ts";
import { verifyTurnstile } from "./verify-turnstile.ts";
import type { VendorInquiryInput } from "./create-vendor-inquiry.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function statusCodeFor(outcome: string): number {
  switch (outcome) {
    case "created":
      return 201;
    case "validation_error":
    case "invalid_captcha":
      return 400;
    case "verification_error":
    case "database_error":
      return 502;
    default:
      return 500;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: VendorInquiryInput;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secretKey) {
    console.error("TURNSTILE_SECRET_KEY is not set");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const result = await createVendorInquiry(body, {
    supabase,
    verifyTurnstile: (token: string) => verifyTurnstile(token, secretKey),
  });

  return new Response(JSON.stringify(result), {
    status: statusCodeFor(result.outcome),
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});