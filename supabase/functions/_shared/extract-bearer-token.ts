// -----------------------------------------------------------------------
// WHAT THIS FILE DOES
// -----------------------------------------------------------------------
// Pulls the bearer token out of an incoming Request's Authorization
// header. Shared by all three GLPDX-130 admin functions, each of which
// needs this token to hand to requireAdmin() for server-side role
// verification.
//
// Where its data comes from: the raw Request object each Edge Function's
// index.ts receives from Deno.serve.
//
// Where its output goes: passed straight into requireAdmin(token, ...)
// by the caller. Returning null (rather than throwing) for every
// malformed/missing case keeps this a pure parsing function — deciding
// what a null token MEANS (401 vs proceeding) is the caller's job, not
// this function's.
// -----------------------------------------------------------------------

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(\S.*)$/i);
  if (!match) {
    return null;
  }

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}