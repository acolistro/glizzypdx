import { describe, it, expect } from "vitest";
import { extractBearerToken } from "./extract-bearer-token";

function makeRequest(authorizationHeader: string | null): Request {
  const headers = new Headers();
  if (authorizationHeader !== null) {
    headers.set("Authorization", authorizationHeader);
  }
  return new Request("https://example.com", { headers });
}

describe("extractBearerToken", () => {
  it("returns the token when the header is a well-formed 'Bearer <token>' value", () => {
    const req = makeRequest("Bearer abc.def.ghi");
    expect(extractBearerToken(req)).toBe("abc.def.ghi");
  });

  it("is case-insensitive on the 'Bearer' scheme keyword", () => {
    const req = makeRequest("bearer abc.def.ghi");
    expect(extractBearerToken(req)).toBe("abc.def.ghi");
  });

  it("returns null when there is no Authorization header at all", () => {
    const req = makeRequest(null);
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when the header doesn't use the Bearer scheme", () => {
    const req = makeRequest("Basic dXNlcjpwYXNz");
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when the header is just 'Bearer' with no token", () => {
    const req = makeRequest("Bearer");
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when the header is 'Bearer ' with only trailing whitespace and no token", () => {
    const req = makeRequest("Bearer    ");
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when the header is an empty string", () => {
    const req = makeRequest("");
    expect(extractBearerToken(req)).toBeNull();
  });
});