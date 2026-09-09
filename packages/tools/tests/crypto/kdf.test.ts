import { pbkdf2Sync, scryptSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type KdfError,
  MAX_SALT,
  encode64,
  executeKdf,
  randomSalt,
  saltBytes,
  utf8,
  validateJob,
} from "../../src/crypto/kdf";

const expectKdfError = async (
  run: () => unknown | Promise<unknown>,
  code: KdfError["code"],
) => {
  await expect(run()).rejects.toMatchObject({ code });
};

describe("KDF", () => {
  it("matches Node PBKDF2 for every supported digest and exposes both output formats", async () => {
    const password = "pásswörd 😀";
    const salt = "盐🧂";

    for (const [hash, digest] of [
      ["SHA-1", "sha1"],
      ["SHA-256", "sha256"],
      ["SHA-384", "sha384"],
      ["SHA-512", "sha512"],
    ] as const) {
      const expected = pbkdf2Sync(password, salt, 2, 32, digest);
      const result = await executeKdf({
        kind: "pbkdf2",
        password,
        salt,
        saltFormat: "utf-8",
        hash,
        iterations: 2,
        lengthBytes: 32,
      });

      expect(result).toEqual({
        hex: expected.toString("hex"),
        base64: expected.toString("base64"),
        saltBytes: Buffer.byteLength(salt),
        lengthBytes: 32,
        memoryBytes: null,
      });
    }
  });

  it("matches Node scrypt with low-cost parameters", async () => {
    const password = "correct horse battery staple";
    const salt = Buffer.from("00010203feff", "hex");
    const expected = scryptSync(password, salt, 32, {
      N: 16,
      r: 1,
      p: 1,
      maxmem: 72 * 1024 * 1024,
    });

    await expect(
      executeKdf({
        kind: "scrypt",
        password,
        salt: salt.toString("base64url"),
        saltFormat: "base64",
        costFactor: 16,
        blockSize: 1,
        parallelism: 1,
        lengthBytes: 32,
      }),
    ).resolves.toEqual({
      hex: expected.toString("hex"),
      base64: expected.toString("base64"),
      saltBytes: salt.length,
      lengthBytes: 32,
      memoryBytes: 2048,
    });
  });

  it("decodes UTF-8, hex, URL-safe base64, and Blob salts", async () => {
    const utf8Salt = "盐🧂";
    const bytes = Uint8Array.from([0, 1, 254, 255]);

    expect(utf8(utf8Salt)).toEqual(new TextEncoder().encode(utf8Salt));
    await expect(saltBytes(utf8Salt, "utf-8")).resolves.toEqual(
      new TextEncoder().encode(utf8Salt),
    );
    await expect(saltBytes("0001feff", "hex")).resolves.toEqual(bytes);
    await expect(saltBytes(" AAH-_w== ", "base64")).resolves.toEqual(bytes);
    await expect(saltBytes(new Blob([bytes]), "hex")).resolves.toEqual(bytes);
    expect(encode64(bytes)).toBe("AAH+/w==");
  });

  it("creates fresh 16-byte salts in each supported textual format", () => {
    const hex = randomSalt("hex");
    const base64 = randomSalt("base64");
    const text = randomSalt("utf-8");

    expect(hex).toMatch(/^[0-9a-f]{32}$/);
    expect(Buffer.from(base64, "base64")).toHaveLength(16);
    expect(Buffer.from(text, "base64")).toHaveLength(16);
    expect(hex).not.toBe(randomSalt("hex"));
  });

  it("enforces derivation parameter and resource boundaries before computation", () => {
    const pbkdf2 = {
      kind: "pbkdf2" as const,
      password: "password",
      salt: "salt",
      saltFormat: "utf-8" as const,
      hash: "SHA-256" as const,
      iterations: 1,
      lengthBytes: 16,
    };
    const scrypt = {
      kind: "scrypt" as const,
      password: "password",
      salt: "salt",
      saltFormat: "utf-8" as const,
      costFactor: 2,
      blockSize: 1,
      parallelism: 1,
      lengthBytes: 16,
    };

    expect(() => validateJob(pbkdf2)).not.toThrow();
    expect(() => validateJob(scrypt)).not.toThrow();
    for (const invalid of [
      { ...pbkdf2, lengthBytes: 15 },
      { ...pbkdf2, iterations: 0 },
      { ...pbkdf2, iterations: 1_000_001 },
      { ...pbkdf2, hash: "SHA-0" as never },
      { ...scrypt, costFactor: 3 },
      { ...scrypt, costFactor: 2, blockSize: 0 },
      { ...scrypt, parallelism: 33 },
      { ...scrypt, costFactor: 65_536, blockSize: 1 },
    ])
      expect(() => validateJob(invalid)).toThrow("invalid_parameters");

    expect(() =>
      validateJob({ ...scrypt, costFactor: 524_288, blockSize: 2 }),
    ).toThrow("resource_limit");
    expect(() =>
      validateJob({ ...pbkdf2, password: "x".repeat(1_048_577) }),
    ).toThrow("resource_limit");
  });

  it("rejects malformed strings and oversized salts with the domain error codes", async () => {
    const job = {
      kind: "pbkdf2" as const,
      password: "password",
      salt: "salt",
      saltFormat: "utf-8" as const,
      hash: "SHA-256" as const,
      iterations: 1,
      lengthBytes: 16,
    };

    expect(() => utf8("\ud800")).toThrow("invalid_input");
    for (const [salt, format] of [
      ["0", "hex"],
      ["00xz", "hex"],
      ["A", "base64"],
      ["AA==x", "base64"],
    ] as const)
      await expectKdfError(() => saltBytes(salt, format), "invalid_salt");
    await expectKdfError(
      () => executeKdf({ ...job, password: "\ud800" }),
      "invalid_input",
    );
    expect(() =>
      validateJob({ ...job, saltFormat: "binary" as never }),
    ).toThrow("invalid_salt");

    const oversized = new Blob([new Uint8Array(MAX_SALT + 1)]);
    expect(() => validateJob({ ...job, salt: oversized })).toThrow(
      "resource_limit",
    );
    await expectKdfError(() => saltBytes(oversized, "utf-8"), "resource_limit");
  });
});

it("rejects noncanonical base64 padding bits and text exceeding the encoded salt limit", async () => {
  await expect(saltBytes("AB==", "base64")).rejects.toMatchObject({
    code: "invalid_salt",
  });
  const salt = "x".repeat(MAX_SALT * 2 + 1);
  await expect(saltBytes(salt, "utf-8")).rejects.toMatchObject({
    code: "resource_limit",
  });
  expect(() =>
    validateJob({
      kind: "pbkdf2",
      password: "",
      salt,
      saltFormat: "utf-8",
      hash: "SHA-256",
      iterations: 1,
      lengthBytes: 16,
    }),
  ).toThrow("resource_limit");
});

it("derives empty inputs and preserves byte content across salt representations", async () => {
  const job = {
    kind: "pbkdf2" as const,
    password: "",
    salt: "",
    saltFormat: "utf-8" as const,
    hash: "SHA-256" as const,
    iterations: 1,
    lengthBytes: 16,
  };
  const expected = pbkdf2Sync("", "", 1, 16, "sha256").toString("hex");
  for (const saltFormat of ["utf-8", "hex", "base64"] as const)
    expect((await executeKdf({ ...job, saltFormat })).hex).toBe(expected);
  expect((await executeKdf({ ...job, salt: new Blob([]) })).hex).toBe(expected);
  const bytes = Uint8Array.from({ length: 8193 }, (_, i) => i % 256);
  expect(encode64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
});

it("enforces the decoded byte cap even when the salt text is below the character cap", async () => {
  const salt = "界".repeat(Math.floor(MAX_SALT / 3) + 1);
  expect(salt.length).toBeLessThan(MAX_SALT * 2);
  await expect(saltBytes(salt, "utf-8")).rejects.toMatchObject({
    code: "resource_limit",
  });
}, 30000);

it("reports entropy-source failure for generated salts", () => {
  const randomValues = vi
    .spyOn(crypto, "getRandomValues")
    .mockImplementation(() => {
      throw Error("entropy unavailable");
    });
  expect(() => randomSalt("hex")).toThrow("random_failed");
  randomValues.mockRestore();
});
