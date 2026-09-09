import { expect, test, vi } from "vitest";
import { pgpKeySchema, PgpToolError } from "../../src/crypto/pgp-contract";
import { generatePgp } from "../../src/crypto/pgp";

test("defaults remain optional in the public input contract", () => {
  expect(pgpKeySchema.parse({})).toEqual({
    name: "",
    email: "",
    comment: "",
    passphrase: "",
    algorithm: "ecc",
    rsaSize: 4096,
    expirationDays: 0,
  });
  for (const value of [
    { unknown: true },
    { rsaSize: 1024 },
    { algorithm: "dsa" },
    { expirationDays: -1 },
    { expirationDays: 0.5 },
    { expirationDays: 36501 },
  ]) {
    expect(pgpKeySchema.safeParse(value).success).toBe(false);
  }
});

test("domain validation preserves byte limits, control character rejection and error precedence", async () => {
  const base = pgpKeySchema.parse({ name: "Synthetic" });
  for (const [patch, code] of [
    [{ algorithm: "dsa" }, "invalid_options"],
    [{ rsaSize: 1024 }, "invalid_options"],
    [{ expirationDays: 0.5 }, "invalid_options"],
    [{ expirationDays: -1 }, "invalid_options"],
    [{ name: "x".repeat(4097) }, "too_large"],
    [{ email: "界".repeat(1366) }, "too_large"],
    [{ comment: "x".repeat(4097) }, "too_large"],
    [{ passphrase: "x".repeat(65537) }, "too_large"],
    [{ name: "bad\nname" }, "invalid_identity"],
    [{ comment: "bad\u007fcomment" }, "invalid_identity"],
    [{ name: `\ud800${"x".repeat(4097)}` }, "invalid_unicode"],
  ] as const) {
    await expect(
      generatePgp({ ...base, ...patch } as typeof base),
    ).rejects.toEqual(new PgpToolError(code));
  }
});

test("a failed platform random source maps to a domain error and later calls recover", async () => {
  const input = pgpKeySchema.parse({ name: "Synthetic entropy failure" });
  const platformCrypto = globalThis.crypto;
  let attempts = 0;
  // Replace only the platform entropy boundary; execute the real OpenPGP algorithm.
  vi.stubGlobal("crypto", {
    subtle: platformCrypto.subtle,
    getRandomValues() {
      attempts++;
      throw new Error("synthetic platform entropy failure");
    },
  });
  try {
    await expect(generatePgp(input)).rejects.toEqual(
      new PgpToolError("generation_failed"),
    );
    expect(attempts).toBeGreaterThan(0);
  } finally {
    vi.unstubAllGlobals();
  }
  const recovered = await generatePgp(input);
  expect(recovered.publicKey).toContain("BEGIN PGP PUBLIC KEY BLOCK");
  expect(recovered.userID).toBe(input.name);
});
