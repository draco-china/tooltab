import { argon2d, argon2i, argon2id } from "hash-wasm";
import { describe, expect, it, vi } from "vitest";
import {
  type Algorithm,
  base64,
  decode64,
  executeArgon,
  parsePHC,
  randomSalt,
  validateJob,
  validateParams,
} from "../../src/crypto/argon2";

const salt = new Uint8Array(16).fill(2);
const password = "password";
const secret = "pepper";
const params = {
  algorithm: "argon2id" as Algorithm,
  iterations: 1,
  memorySize: 32,
  parallelism: 1,
  hashLength: 32,
};

const reference = { argon2id, argon2i, argon2d };

describe("Argon2", () => {
  it("matches the independent hash-wasm implementation for every variant and a secret", async () => {
    for (const algorithm of ["argon2id", "argon2i", "argon2d"] as const) {
      const expected = await reference[algorithm]({
        password,
        secret,
        salt,
        iterations: params.iterations,
        memorySize: params.memorySize,
        parallelism: params.parallelism,
        hashLength: params.hashLength,
        outputType: "binary",
      });
      const result = executeArgon({
        kind: "hash",
        ...params,
        algorithm,
        password,
        secret,
        salt: base64(salt),
      });

      expect(result).toMatchObject({
        algorithm,
        version: 19,
        iterations: 1,
        memorySize: 32,
        parallelism: 1,
        saltLength: 16,
        hashLength: 32,
        matches: null,
      });
      expect(parsePHC(result.hash).digest).toEqual(expected);
      expect(
        executeArgon({
          kind: "verify",
          password,
          secret,
          hash: result.hash,
        }).matches,
      ).toBe(true);
      expect(
        executeArgon({
          kind: "verify",
          password,
          secret: "different pepper",
          hash: result.hash,
        }).matches,
      ).toBe(false);
    }
  });

  it("encodes salts canonically and decodes only complete standard or URL-safe base64", () => {
    const bytes = Uint8Array.from([0, 1, 254, 255]);
    expect(base64(bytes)).toBe("AAH+/w");
    expect(decode64("AAH+/w==")).toEqual(bytes);
    expect(decode64(" AAH-_w== ")).toEqual(bytes);
    expect(() => decode64("AAH+/w=x")).toThrow("invalid_salt");
    expect(() => decode64("A")).toThrow("invalid_salt");
    expect(() => decode64(" AAH-_w== ", true)).toThrow("invalid_hash");
  });

  it("creates fresh, decodable 16-byte salts", () => {
    const first = randomSalt();
    const second = randomSalt();

    expect(decode64(first)).toHaveLength(16);
    expect(decode64(second)).toHaveLength(16);
    expect(first).not.toBe(second);
  });

  it("validates parameter relationships and resource caps before hashing", () => {
    expect(() => validateParams(params)).not.toThrow();
    expect(() => validateParams({ ...params, memorySize: 7 })).toThrow(
      "invalid_parameters",
    );
    expect(() =>
      validateParams({ ...params, memorySize: 8, parallelism: 2 }),
    ).toThrow("invalid_parameters");
    expect(() => validateParams({ ...params, hashLength: 3 })).toThrow(
      "invalid_parameters",
    );
    expect(() => validateParams({ ...params, iterations: 13 })).toThrow(
      "resource_limit",
    );
    expect(() => validateParams({ ...params, memorySize: 262145 })).toThrow(
      "resource_limit",
    );
    expect(() => validateParams({ ...params, hashLength: 65 })).toThrow(
      "resource_limit",
    );
    expect(() =>
      validateParams({ ...params, hashLength: 1024 }, true),
    ).not.toThrow();
    expect(() => validateParams({ ...params, hashLength: 1025 }, true)).toThrow(
      "resource_limit",
    );
  });

  it("parses canonical PHC values and rejects malformed or over-limit metadata", () => {
    const hash = executeArgon({
      kind: "hash",
      ...params,
      password,
      secret,
      salt: base64(salt),
    }).hash;
    const parsed = parsePHC(`  ${hash}  `);

    expect(parsed).toMatchObject({
      hash,
      ...params,
      salt,
      digest: expect.any(Uint8Array),
    });
    expect(parsed.digest).toHaveLength(32);
    for (const invalid of [
      hash.replace("v=19", "v=16"),
      hash.replace("m=32", "m=032"),
      hash.replace("m=32", "m=32,m=32"),
      hash.replace("m=32", "x=32"),
      hash.replace("t=1", "t=13"),
      hash.replace("p=1", "p=17"),
      hash.replace("$", ""),
    ])
      expect(() => parsePHC(invalid)).toThrow();
  });

  it("validates hash and verify jobs without treating untrusted input as a derivation request", () => {
    const job = {
      kind: "hash" as const,
      ...params,
      password,
      secret,
      salt: base64(salt),
    };
    expect(validateJob(job)).toMatchObject({ ...job, salt });
    expect(() => validateJob({ ...job, password: "" })).toThrow(
      "invalid_input",
    );
    expect(() => validateJob({ ...job, password: "\ud800" })).toThrow(
      "invalid_input",
    );
    expect(() =>
      validateJob({ ...job, salt: base64(new Uint8Array(7)) }),
    ).toThrow("invalid_salt");
    expect(() =>
      validateJob({
        kind: "verify",
        password,
        secret,
        hash: "$argon2id$v=19$m=262145,t=1,p=1$AgICAgICAgICAgICAgICAg$AAAAAA",
      }),
    ).toThrow("resource_limit");
  });
});

it("rejects oversized and noncanonical inputs before derivation", () => {
  expect(() => decode64("A".repeat(100001))).toThrow("resource_limit");
  expect(() => parsePHC("x".repeat(200001))).toThrow("resource_limit");
  for (const phc of [false, true])
    expect(() => decode64("AB", phc)).toThrow(
      phc ? "invalid_hash" : "invalid_salt",
    );
  const job = {
    kind: "hash" as const,
    ...params,
    password,
    secret,
    salt: base64(salt),
  };
  expect(() => validateJob({ ...job, password: "x".repeat(1048577) })).toThrow(
    "resource_limit",
  );
  expect(() => validateJob({ ...job, secret: "x".repeat(1048577) })).toThrow(
    "resource_limit",
  );
  expect(() =>
    validateJob({ ...job, salt: base64(new Uint8Array(65537)) }),
  ).toThrow("invalid_salt");
  for (const changed of [
    { algorithm: "invalid" as Algorithm },
    { iterations: Number.NaN },
    { parallelism: 17 },
    { iterations: 1.5 },
  ])
    expect(() => validateParams({ ...params, ...changed })).toThrow();
});

it("validates required PHC parameters and decoded salt bounds", () => {
  const hash = executeArgon({
    kind: "hash",
    ...params,
    password,
    secret,
    salt: base64(salt),
  }).hash;
  expect(() => parsePHC(hash.replace("m=32,t=1,p=1", "m=32,t=1"))).toThrow(
    "invalid_hash",
  );
  for (const length of [7, 65537]) {
    const parts = hash.split("$");
    parts[4] = base64(new Uint8Array(length));
    expect(() => parsePHC(parts.join("$"))).toThrow("invalid_salt");
  }
  const reordered = hash.replace("m=32,t=1,p=1", "p=1,t=1,m=32");
  expect(parsePHC(reordered)).toMatchObject(params);
  expect(
    executeArgon({ kind: "verify", password, secret, hash: reordered }).matches,
  ).toBe(true);
});

it("maps entropy-source failures without entering the derivation primitive", () => {
  const randomValues = vi
    .spyOn(crypto, "getRandomValues")
    .mockImplementation(() => {
      throw Error("entropy unavailable");
    });
  expect(() => randomSalt()).toThrow("random_failed");
  randomValues.mockRestore();
});
