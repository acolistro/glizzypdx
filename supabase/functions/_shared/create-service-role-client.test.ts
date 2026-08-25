import { describe, it, expect, vi } from "vitest";
import { createServiceRoleClient } from "./create-service-role-client";

function makeFakeCreateClient() {
  const marker = { __fake: "supabase-client" };
  const createClient = vi.fn().mockReturnValue(marker);
  return { createClient, marker };
}

const validSecretKeysRaw = JSON.stringify({
  default: "sb_secret_old_value",
  default_2: "sb_secret_current_value",
});

describe("createServiceRoleClient", () => {
  it("returns 'success' with a client built from the named key entry", () => {
    const { createClient, marker } = makeFakeCreateClient();

    const result = createServiceRoleClient({
      supabaseUrl: "https://tvgbnvwogxqgncybmbxt.supabase.co",
      secretKeysRaw: validSecretKeysRaw,
      secretKeyName: "default_2",
      createClient,
    });

    expect(result).toEqual({ outcome: "success", supabase: marker });
    expect(createClient).toHaveBeenCalledWith(
      "https://tvgbnvwogxqgncybmbxt.supabase.co",
      "sb_secret_current_value",
    );
  });

  it("returns 'missing_supabase_url' and never calls createClient when the URL env var is unset", () => {
    const { createClient } = makeFakeCreateClient();

    const result = createServiceRoleClient({
      supabaseUrl: undefined,
      secretKeysRaw: validSecretKeysRaw,
      secretKeyName: "default_2",
      createClient,
    });

    expect(result).toEqual({ outcome: "missing_supabase_url" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns 'missing_secret_keys' and never calls createClient when SUPABASE_SECRET_KEYS is unset", () => {
    const { createClient } = makeFakeCreateClient();

    const result = createServiceRoleClient({
      supabaseUrl: "https://tvgbnvwogxqgncybmbxt.supabase.co",
      secretKeysRaw: undefined,
      secretKeyName: "default_2",
      createClient,
    });

    expect(result).toEqual({ outcome: "missing_secret_keys" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns 'invalid_secret_keys_json' and never calls createClient when SUPABASE_SECRET_KEYS isn't valid JSON", () => {
    const { createClient } = makeFakeCreateClient();

    const result = createServiceRoleClient({
      supabaseUrl: "https://tvgbnvwogxqgncybmbxt.supabase.co",
      secretKeysRaw: "{not valid json",
      secretKeyName: "default_2",
      createClient,
    });

    expect(result).toEqual({ outcome: "invalid_secret_keys_json" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns 'missing_key_entry' and never calls createClient when the named key isn't present", () => {
    const { createClient } = makeFakeCreateClient();

    const result = createServiceRoleClient({
      supabaseUrl: "https://tvgbnvwogxqgncybmbxt.supabase.co",
      secretKeysRaw: validSecretKeysRaw,
      secretKeyName: "default_3",
      createClient,
    });

    expect(result).toEqual({ outcome: "missing_key_entry" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns 'missing_key_entry' when the named key exists but is an empty string", () => {
    const { createClient } = makeFakeCreateClient();

    const result = createServiceRoleClient({
      supabaseUrl: "https://tvgbnvwogxqgncybmbxt.supabase.co",
      secretKeysRaw: JSON.stringify({ default_2: "" }),
      secretKeyName: "default_2",
      createClient,
    });

    expect(result).toEqual({ outcome: "missing_key_entry" });
    expect(createClient).not.toHaveBeenCalled();
  });
});