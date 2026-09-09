import { bcrypt, bcryptVerify } from "hash-wasm";
import { describe, expect, it, vi } from "vitest";
import {
  BcryptError,
  DEFAULT_COST,
  executeBcrypt,
  MAX_COST,
  MIN_COST,
  parseBcryptHash,
  parseCostInput,
  parseHash,
  passwordInfo,
  validateBcryptJob,
  validateJob,
} from "../../src/crypto/bcrypt";

const knownHash =
  "$2b$10$9goojv/JvRhQvBIMI6yJNu9mziiWggh4.5/rpJAIhx66y28hq4Ybe";

const expectBcryptError = (run: () => unknown, code: BcryptError["code"]) => {
  expect(run).toThrow(code);
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BcryptError);
    expect((error as BcryptError).code).toBe(code);
  }
};

describe("bcrypt", () => {
  it("exports its supported cost range and stable compatibility aliases", () => {
    expect({ DEFAULT_COST, MIN_COST, MAX_COST }).toEqual({
      DEFAULT_COST: 12,
      MIN_COST: 4,
      MAX_COST: 15,
    });
    expect(parseHash).toBe(parseBcryptHash);
    expect(validateJob).toBe(validateBcryptJob);
  });

  it("parses complete integer cost input without silently accepting invalid values", () => {
    expect(parseCostInput(" 04 ")).toEqual({ value: 4, isValid: true });
    expect(parseCostInput("15")).toEqual({ value: 15, isValid: true });
    expect(parseCostInput("3")).toEqual({ value: 3, isValid: false });
    expect(parseCostInput("16")).toEqual({ value: 16, isValid: false });
    expect(parseCostInput("4.0", 9)).toEqual({ value: 9, isValid: false });
    expect(parseCostInput("", 9)).toEqual({ value: 9, isValid: false });
    expect(parseCostInput("9007199254740992", 9)).toEqual({
      value: 9,
      isValid: false,
    });
  });

  it("counts UTF-8 bytes, rejects malformed text, and requires explicit truncation", () => {
    expect(passwordInfo("😀".repeat(18), false)).toEqual({
      passwordBytes: 72,
      truncated: false,
    });
    expect(passwordInfo("😀".repeat(19), true)).toEqual({
      passwordBytes: 76,
      truncated: true,
    });
    expectBcryptError(
      () => passwordInfo("😀".repeat(19), false),
      "password_too_long",
    );
    expectBcryptError(() => passwordInfo("\ud800", true), "invalid_password");
    expectBcryptError(
      () => passwordInfo("x".repeat(1_048_577), true),
      "invalid_password",
    );
  });

  it("parses canonical bcrypt hashes at supported version and cost boundaries", () => {
    expect(parseBcryptHash(` \n${knownHash}\t`)).toEqual({
      hash: knownHash,
      version: "2b",
      cost: 10,
      salt: "9goojv/JvRhQvBIMI6yJNu",
      checksum: "9mziiWggh4.5/rpJAIhx66y28hq4Ybe",
    });
    for (const version of ["2a", "2b", "2y"])
      for (const cost of ["04", "31"])
        expect(
          parseBcryptHash(knownHash.replace("$2b$10$", `$${version}$${cost}$`)),
        ).toMatchObject({ version, cost: Number(cost) });

    for (const invalid of [
      knownHash.replace("$2b$", "$2x$"),
      knownHash.replace("$10$", "$03$"),
      knownHash.replace("$10$", "$32$"),
      knownHash.slice(0, -1),
      `${knownHash}x`.repeat(5),
    ])
      expectBcryptError(() => parseBcryptHash(invalid), "invalid_hash");
  });

  it("validates hash and verification jobs before bcrypt computation", () => {
    expect(
      validateBcryptJob({
        kind: "hash",
        password: "password",
        cost: MIN_COST,
        truncate: false,
      }),
    ).toEqual({ passwordBytes: 8, truncated: false });
    expect(
      validateBcryptJob({
        kind: "verify",
        password: "",
        hash: knownHash,
        truncate: false,
      }),
    ).toEqual({ passwordBytes: 0, truncated: false });
    for (const cost of [3, 16, 4.5, Number.NaN])
      expectBcryptError(
        () =>
          validateBcryptJob({
            kind: "hash",
            password: "x",
            cost,
            truncate: false,
          }),
        "invalid_cost",
      );
    expectBcryptError(
      () =>
        validateBcryptJob({
          kind: "hash",
          password: "",
          cost: 4,
          truncate: false,
        }),
      "invalid_password",
    );
    expectBcryptError(
      () =>
        validateBcryptJob({
          kind: "verify",
          password: "x",
          hash: "not bcrypt",
          truncate: false,
        }),
      "invalid_hash",
    );
  });

  it("interoperates with the independent hash-wasm bcrypt implementation", async () => {
    const password = "correct horse battery staple";
    const externalHash = await bcrypt({
      password,
      salt: new Uint8Array(16),
      costFactor: 4,
      outputType: "encoded",
    });
    expect(externalHash).toBe(
      "$2a$04$......................DunJ0NhOinbZprl1sCtuSWfJkZJJgCO",
    );
    expect(
      executeBcrypt({
        kind: "verify",
        password,
        hash: externalHash,
        truncate: false,
      }),
    ).toMatchObject({ version: "2a", cost: 4, matches: true });
    expect(
      executeBcrypt({
        kind: "verify",
        password: "different password",
        hash: externalHash,
        truncate: false,
      }).matches,
    ).toBe(false);

    const generated = executeBcrypt({
      kind: "hash",
      password: "héllo 😀",
      cost: 4,
      truncate: false,
    });
    expect(generated).toMatchObject({
      version: "2b",
      cost: 4,
      passwordBytes: 11,
      truncated: false,
      matches: null,
    });
    expect(generated.hash).toHaveLength(60);
    await expect(
      bcryptVerify({ password: "héllo 😀", hash: generated.hash }),
    ).resolves.toBe(true);
    await expect(
      bcryptVerify({ password: "different", hash: generated.hash }),
    ).resolves.toBe(false);
  });

  it("preserves bcrypt's explicit 72-byte truncation compatibility mode", () => {
    const hash = executeBcrypt({
      kind: "hash",
      password: `${"a".repeat(72)}x`,
      cost: 4,
      truncate: true,
    });
    expect(hash.truncated).toBe(true);
    expect(
      executeBcrypt({
        kind: "verify",
        password: `${"a".repeat(72)}y`,
        hash: hash.hash,
        truncate: true,
      }).matches,
    ).toBe(true);
    expectBcryptError(
      () =>
        executeBcrypt({
          kind: "verify",
          password: "a".repeat(73),
          hash: hash.hash,
          truncate: false,
        }),
      "password_too_long",
    );
  });

  it("reports entropy failures before calling bcrypt", () => {
    const randomValues = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(() => {
        throw Error("entropy unavailable");
      });
    expectBcryptError(
      () =>
        executeBcrypt({
          kind: "hash",
          password: "password",
          cost: MIN_COST,
          truncate: false,
        }),
      "random_failed",
    );
    randomValues.mockRestore();
  });
});
