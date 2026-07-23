// verify-webhook-secret.ts
//
// WHAT THIS FILE DOES: compares the shared secret sent by the
// vendor-invite-acceptance Database Webhook trigger against the secret this
// Edge Function expects, in a way that doesn't leak information about the
// expected secret through response timing.
//
// WHERE ITS DATA COMES FROM: the caller (index.ts) passes in two plain
// strings -- the value read from the incoming request's X-Webhook-Secret
// header, and the value read from the WEBHOOK_SHARED_SECRET environment
// variable (set via `supabase secrets set`).
//
// WHERE ITS OUTPUT GOES: a boolean back to index.ts, which uses it to
// decide whether to process the webhook payload or return 401.
//
// WHY THIS IS ITS OWN FILE (non-obvious pattern, Android background note):
// this module intentionally uses nothing but TextEncoder, which exists
// identically in both Deno (where this actually runs, as part of the
// deployed Edge Function) and Node (where Vitest runs it in CI). Keeping
// this logic out of the Deno.serve() handler in index.ts is what makes it
// unit-testable at all -- Deno.serve() itself can't run under Vitest, but
// a plain exported function with no Deno-only imports can. This is the
// same split used for verify-turnstile.ts.
//
// WHY "CONSTANT-TIME" MATTERS HERE (GLPDX-163):
// A naive comparison like `received === expected` or a hand-rolled loop
// that returns false as soon as it finds a mismatched character will, on
// average, take slightly longer to run the more characters match at the
// start of the string. An attacker who can measure response time
// precisely enough (and is willing to make many requests) can use that
// timing difference to recover the secret one byte at a time, entirely
// without ever seeing its value. The loop below always inspects every
// byte of both inputs before returning, regardless of where -- or
// whether -- a mismatch occurred, so the comparison takes the same
// number of steps no matter what's being compared.
export function verifyWebhookSecret(receivedSecret: string | null, expectedSecret: string): boolean {
  // An empty expected secret is never a valid comparison target -- if
  // WEBHOOK_SHARED_SECRET were ever misconfigured to an empty string,
  // every request must still be rejected, not treated as "nothing to
  // check against." This early return is safe (doesn't leak anything
  // about receivedSecret) because it depends only on expectedSecret's
  // length, never on any byte of what the caller sent.
  if (expectedSecret.length === 0) {
    return false;
  }

  // No header present at all -- reject immediately. Also safe: this
  // depends only on whether the header exists, not on any byte of it.
  if (receivedSecret === null) {
    return false;
  }

  const encoder = new TextEncoder();
  const receivedBytes = encoder.encode(receivedSecret);
  const expectedBytes = encoder.encode(expectedSecret);

  // Track length equality separately from the byte-by-byte comparison
  // below, and fold it into the result with bitwise OR at the very end --
  // never with an early `if (lengths differ) return false`, which would
  // reintroduce a timing shortcut for the length-mismatch case.
  let mismatch = receivedBytes.length === expectedBytes.length ? 0 : 1;

  // Always loop the same number of times (the longer of the two inputs),
  // substituting 0 for any out-of-range byte, so the loop's iteration
  // count never depends on which input is shorter.
  const maxLength = Math.max(receivedBytes.length, expectedBytes.length);
  for (let i = 0; i < maxLength; i++) {
    const receivedByte = i < receivedBytes.length ? receivedBytes[i] : 0;
    const expectedByte = i < expectedBytes.length ? expectedBytes[i] : 0;
    // XOR is 0 only when both bytes are identical. OR-ing the running
    // mismatch value means one differing byte anywhere permanently flips
    // the result, but we still keep comparing every remaining byte.
    mismatch |= receivedByte ^ expectedByte;
  }

  return mismatch === 0;
}