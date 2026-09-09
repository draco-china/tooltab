import {
  constants,
  createHmac,
  generateKeyPairSync,
  verify as nodeVerify,
  sign as nodeSign,
} from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  decodeToken,
  inspectClaims,
  JWT_ALGORITHMS,
  signToken,
  verifyToken,
} from "../../src/crypto/jwt";

const toUrl64 = (value: string) => Buffer.from(value).toString("base64url");
const hmacKey =
  "a secret used only for deterministic JWT interoperability tests";

function asymmetricKeys(algorithm: string) {
  const pair = algorithm.startsWith("ES")
    ? generateKeyPairSync("ec", {
        // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
        namedCurve: { ES256: "P-256", ES384: "P-384", ES512: "P-521" }[
          algorithm
        ]!,
      })
    : generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privatePem: pair.privateKey.export({
      format: "pem",
      type: "pkcs8",
    }) as string,
    publicPem: pair.publicKey.export({ format: "pem", type: "spki" }) as string,
    privateJwk: pair.privateKey.export({ format: "jwk" }),
    publicJwk: pair.publicKey.export({ format: "jwk" }),
  };
}

it("creates HMAC and public-key JWT signatures accepted by Node crypto", async () => {
  for (const algorithm of JWT_ALGORITHMS) {
    const asymmetric = algorithm.startsWith("HS")
      ? undefined
      : asymmetricKeys(algorithm);
    const signed = await signToken({
      algorithm,
      key: asymmetric?.privatePem ?? hmacKey,
      keyFormat: asymmetric ? "pem" : "secret",
      payload: '{"sub":"interoperable","exp":1}',
      header: '{"kid":"test-key"}',
    });
    const [header, payload, signature] = signed.token.split(".");
    const signingInput = Buffer.from(`${header}.${payload}`);
    const signatureBytes = Buffer.from(signature, "base64url");
    const hash = `sha${algorithm.slice(2)}`;

    if (algorithm.startsWith("HS"))
      expect(createHmac(hash, hmacKey).update(signingInput).digest()).toEqual(
        signatureBytes,
      );
    else
      expect(
        nodeVerify(
          hash,
          signingInput,
          {
            // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
            key: asymmetric!.publicPem,
            dsaEncoding: "ieee-p1363",
            ...(algorithm.startsWith("PS")
              ? {
                  padding: constants.RSA_PKCS1_PSS_PADDING,
                  saltLength: Number(algorithm.slice(2)) / 8,
                }
              : {}),
          },
          signatureBytes,
        ),
      ).toBe(true);

    const verified = await verifyToken({
      token: signed.token,
      key: asymmetric?.publicPem ?? hmacKey,
      algorithm,
      now: 2,
    });
    expect(verified).toMatchObject({ algorithm, signatureValid: true });
    expect(verified.claims).toContainEqual(
      expect.objectContaining({ claim: "exp", status: "expired" }),
    );
    expect(
      (
        await verifyToken({
          token: `${header}.${toUrl64('{"sub":"tampered"}')}.${signature}`,
          key: asymmetric?.publicPem ?? hmacKey,
          algorithm,
        })
      ).signatureValid,
    ).toBe(false);
  }
}, 30000);

it("decodes canonical compact tokens and classifies numeric time claims", () => {
  const token = `${toUrl64('{"alg":"HS256"}')}.${toUrl64(
    '{"exp":100,"nbf":101,"iat":102,"name":"Jane"}',
  )}.`;
  const decoded = decodeToken(token, 100);
  expect(decoded).toMatchObject({
    token,
    header: { alg: "HS256" },
    payload: { name: "Jane" },
    signature: "",
  });
  expect(decoded.headerJson).toBe('{\n  "alg": "HS256"\n}');
  expect(decoded.claims).toEqual([
    expect.objectContaining({ claim: "exp", status: "expired" }),
    expect.objectContaining({ claim: "nbf", status: "future" }),
    expect.objectContaining({ claim: "iat", status: "future" }),
  ]);
  expect(inspectClaims(null)).toEqual([]);
  expect(
    inspectClaims({ exp: "tomorrow", nbf: Infinity, iat: 8640000000001 }),
  ).toEqual([
    { claim: "exp", status: "invalid", value: "tomorrow", date: null },
    { claim: "nbf", status: "invalid", value: Infinity, date: null },
    { claim: "iat", status: "invalid", value: 8640000000001, date: null },
  ]);
  expect(inspectClaims({ exp: 101, nbf: 100, iat: 100 }, 100)).toEqual([
    expect.objectContaining({ claim: "exp", status: "valid" }),
    expect.objectContaining({ claim: "nbf", status: "valid" }),
    expect.objectContaining({ claim: "iat", status: "valid" }),
  ]);
});

it("adds selected claims without losing exact number lexemes when no mutation is requested", async () => {
  const base = {
    algorithm: "HS256" as const,
    key: hmacKey,
    keyFormat: "secret" as const,
    header: '{"alg":"none","typ":"custom"}',
    payload: '{"sub":"a"}',
  };
  const withClaims = await signToken({
    ...base,
    iatNow: true,
    expirationOffset: 900,
    now: 1000,
  });
  expect(withClaims).toMatchObject({
    algorithm: "HS256",
    header: { alg: "HS256", typ: "custom" },
    payload: { sub: "a", iat: 1000, exp: 1900 },
  });
  const lexeme = await signToken({
    ...base,
    payload: '{"n":9007199254740993}',
  });
  expect(lexeme.payloadJson).toContain("9007199254740993");
  for (const invalid of [
    { payload: '{"n":9007199254740993}', iatNow: true },
    { expirationOffset: 1 },
    { now: Infinity, iatNow: true },
    { payload: '{"iat":"bad"}', expirationOffset: 900 },
  ])
    await expect(signToken({ ...base, ...invalid })).rejects.toThrow();
});

it("uses JWK and kid-selected JWKS keys while rejecting ambiguous or incompatible metadata", async () => {
  const keys = asymmetricKeys("RS256");
  const token = await signToken({
    algorithm: "RS256",
    key: JSON.stringify({ ...keys.privateJwk, kid: "chosen", use: "sig" }),
    keyFormat: "jwk",
    payload: "{}",
    header: '{"kid":"chosen"}',
  });
  await expect(
    verifyToken({
      token: token.token,
      algorithm: "auto",
      key: JSON.stringify({
        keys: [
          { ...keys.publicJwk, kid: "other" },
          { ...keys.publicJwk, kid: "chosen", use: "sig", key_ops: ["verify"] },
        ],
      }),
    }),
  ).resolves.toMatchObject({ signatureValid: true, algorithm: "RS256" });
  const oct = {
    kty: "oct",
    k: Buffer.from(hmacKey).toString("base64url"),
    alg: "HS256",
    use: "sig",
  };
  const hmac = await signToken({
    algorithm: "HS256",
    key: JSON.stringify(oct),
    keyFormat: "jwk",
    payload: "{}",
    header: "{}",
  });
  await expect(
    verifyToken({
      token: hmac.token,
      algorithm: "HS256",
      key: JSON.stringify(oct),
    }),
  ).resolves.toMatchObject({ signatureValid: true });
  for (const key of [
    JSON.stringify({ keys: [keys.publicJwk, keys.publicJwk] }),
    JSON.stringify({ ...keys.publicJwk, alg: "RS384" }),
    JSON.stringify({ ...keys.publicJwk, use: "enc" }),
    JSON.stringify({ ...oct, key_ops: ["sign"] }),
  ])
    await expect(
      verifyToken({ token: token.token, algorithm: "auto", key }),
    ).rejects.toThrow();
  await expect(
    signToken({
      algorithm: "RS256",
      key: JSON.stringify(keys.publicJwk),
      keyFormat: "jwk",
      payload: "{}",
      header: "{}",
    }),
  ).rejects.toThrow("private_key_required");
});

it("rejects malformed tokens, unsupported headers and incorrect key modes", async () => {
  for (const token of ["", "one.two", ".e30.", "e30..", "@@.e30."])
    expect(() => decodeToken(token)).toThrow();
  const hmac = await signToken({
    algorithm: "HS256",
    key: hmacKey,
    keyFormat: "secret",
    payload: "{}",
    header: "{}",
  });
  for (const options of [
    {
      token: `${toUrl64('{"alg":"none"}')}.e30.`,
      algorithm: "auto" as const,
      key: hmacKey,
    },
    { token: hmac.token, algorithm: "HS384" as const, key: hmacKey },
    {
      token: `${toUrl64('{"alg":"HS256","b64":false}')}.e30.`,
      algorithm: "auto" as const,
      key: hmacKey,
    },
    {
      token: `${toUrl64('{"alg":"HS256","crit":[]}')}.e30.`,
      algorithm: "auto" as const,
      key: hmacKey,
    },
    { token: hmac.token, algorithm: "auto" as const, key: "" },
    {
      token: hmac.token,
      algorithm: "auto" as const,
      key: "-----BEGIN PUBLIC KEY-----\ninvalid\n-----END PUBLIC KEY-----",
    },
  ])
    await expect(verifyToken(options)).rejects.toThrow();
  await expect(
    signToken({
      algorithm: "HS256",
      key: "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----",
      keyFormat: "pem",
      payload: "{}",
      header: "{}",
    }),
  ).rejects.toThrow("key_mismatch");
  await expect(
    signToken({
      algorithm: "HS256",
      key: hmacKey,
      keyFormat: "secret",
      payload: "{}",
      header: '{"crit":[]}',
    }),
  ).rejects.toThrow("unsupported_header");
});

it("rejects malformed key material and filters incompatible JWKS candidates", async () => {
  const base = {
    algorithm: "HS256" as const,
    key: hmacKey,
    keyFormat: "secret" as const,
    payload: "{}",
    header: "{}",
  };
  const signed = await signToken(base);
  const oct = { kty: "oct", k: Buffer.from(hmacKey).toString("base64url") };
  for (const key of [
    { ...oct, key_ops: ["sign"] },
    { ...oct, key_ops: "verify" },
  ])
    await expect(
      verifyToken({
        token: signed.token,
        algorithm: "auto",
        key: JSON.stringify(key),
      }),
    ).rejects.toThrow("key_mismatch");
  await expect(
    signToken({ ...base, keyFormat: "jwk", key: '{"kty":"oct"}' }),
  ).rejects.toThrow("invalid_key");
  for (const keys of [
    [],
    Array.from({ length: 101 }, () => oct),
    [null],
    "bad",
  ])
    await expect(
      verifyToken({
        token: signed.token,
        algorithm: "auto",
        key: JSON.stringify({ keys }),
      }),
    ).rejects.toThrow("invalid_key");
  await expect(
    signToken({
      ...base,
      keyFormat: "jwk",
      key: JSON.stringify({ keys: [oct] }),
    }),
  ).rejects.toThrow("invalid_key");
  await expect(
    verifyToken({
      token: signed.token,
      algorithm: "auto",
      key: JSON.stringify({ keys: [{ ...oct, use: "enc" }, oct] }),
    }),
  ).resolves.toMatchObject({ signatureValid: true });
  await expect(signToken({ ...base, algorithm: "RS256" })).rejects.toThrow(
    "key_mismatch",
  );
  await expect(
    signToken({
      ...base,
      key: "-----BEGIN PRIVATE KEY-----invalid",
      keyFormat: "secret",
    }),
  ).rejects.toThrow("key_mismatch");
  for (const key of [
    "not PEM",
    "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----",
  ])
    await expect(
      signToken({ ...base, algorithm: "RS256", keyFormat: "pem", key }),
    ).rejects.toThrow("invalid_key");
  await expect(
    signToken({
      ...base,
      algorithm: "ES256",
      keyFormat: "jwk",
      key: JSON.stringify({ kty: "EC", crv: "P-384", d: "AA" }),
    }),
  ).rejects.toThrow("key_mismatch");
  await expect(
    signToken({
      ...base,
      algorithm: "RS256",
      keyFormat: "jwk",
      key: JSON.stringify({ kty: "RSA", d: "AA" }),
    }),
  ).rejects.toThrow("invalid_key");
});

it("compacts large decoded JSON without losing content and preserves existing issuance time", async () => {
  const header = JSON.stringify({ alg: "HS256", extra: "h".repeat(65536) });
  const payload = JSON.stringify({ text: "p".repeat(65536) });
  const decoded = decodeToken(`${toUrl64(header)}.${toUrl64(payload)}.`);
  expect(decoded.headerJson).toBe(header);
  expect(decoded.payloadJson).toBe(payload);
  for (const expirationOffset of [900, 3600, 86400, 604800]) {
    const signed = await signToken({
      algorithm: "HS256",
      key: hmacKey,
      keyFormat: "secret",
      header: "",
      payload: '{"iat":100}',
      expirationOffset,
      now: 200,
    });
    expect(signed.payload).toEqual({ iat: 100, exp: 100 + expirationOffset });
  }
});

it("uses a signing key operation and the supplied time when only one claim is requested", async () => {
  const keys = asymmetricKeys("RS256");
  await expect(
    signToken({
      algorithm: "RS256",
      key: JSON.stringify({ ...keys.privateJwk, key_ops: ["verify"] }),
      keyFormat: "jwk",
      payload: "{}",
      header: "{}",
    }),
  ).rejects.toThrow("key_mismatch");
  const signed = await signToken({
    algorithm: "HS256",
    key: hmacKey,
    keyFormat: "secret",
    payload: "{}",
    header: "{}",
    iatNow: true,
    now: 123,
  });
  expect(signed.payload).toMatchObject({ iat: 123 });
  const expiring = await signToken({
    algorithm: "HS256",
    key: hmacKey,
    keyFormat: "secret",
    payload: "{}",
    header: "{}",
    expirationOffset: 900,
    now: 123,
  });
  expect(expiring.payload).toMatchObject({ exp: 1023 });
});

it("maps malformed asymmetric signatures and native signing failures to domain errors", async () => {
  const keys = asymmetricKeys("ES256");
  const signed = await signToken({
    algorithm: "ES256",
    key: keys.privatePem,
    keyFormat: "pem",
    payload: "{}",
    header: "{}",
  });
  const [header, payload] = signed.token.split(".");
  await expect(
    verifyToken({
      token: `${header}.${payload}.AA`,
      key: keys.publicPem,
      algorithm: "ES256",
    }),
  ).resolves.toMatchObject({ signatureValid: false });

  const sign = vi.spyOn(crypto.subtle, "sign").mockRejectedValueOnce(Error());
  await expect(
    signToken({
      algorithm: "HS256",
      key: hmacKey,
      keyFormat: "secret",
      payload: "{}",
      header: "{}",
    }),
  ).rejects.toThrow("sign_failed");
  sign.mockRestore();
});

it("rejects a correctly signed RSA token whose imported key is below the JOSE minimum", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
  });
  const input = `${toUrl64('{"alg":"RS256","typ":"JWT"}')}.${toUrl64('{"sub":"weak-key-regression"}')}`;
  const signature = nodeSign("RSA-SHA256", Buffer.from(input), privateKey);
  expect(
    nodeVerify("RSA-SHA256", Buffer.from(input), publicKey, signature),
  ).toBe(true);
  const token = `${input}.${signature.toString("base64url")}`;
  for (const key of [
    publicKey.export({ format: "pem", type: "spki" }).toString(),
    JSON.stringify(publicKey.export({ format: "jwk" })),
  ]) {
    await expect(
      verifyToken({ token, key, algorithm: "auto" }),
    ).rejects.toMatchObject({ code: "invalid_key" });
  }
});
