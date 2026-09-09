import { generateKeyPairSync, type KeyObject } from "node:crypto";
import * as asn from "asn1js";
import { expect, it, vi } from "vitest";
import { listJwks, jwkToPem, pemToJwk } from "../../src/crypto/pem";

function pem(key: KeyObject, type: "pkcs1" | "pkcs8" | "sec1" | "spki") {
  return key.export({ type, format: "pem" }).toString();
}

function generateOkp(type: "ed25519" | "ed448" | "x25519" | "x448") {
  switch (type) {
    case "ed25519":
      return generateKeyPairSync("ed25519");
    case "ed448":
      return generateKeyPairSync("ed448");
    case "x25519":
      return generateKeyPairSync("x25519");
    case "x448":
      return generateKeyPairSync("x448");
  }
}

const ed25519 = "1.3.101.112";
const rawEd25519 = new Uint8Array(32).fill(7);
const der = (node: asn.BaseBlock) => new Uint8Array(node.toBER(false));
const sequence = (...value: asn.BaseBlock[]) => new asn.Sequence({ value });
const identifier = (value: string) => new asn.ObjectIdentifier({ value });
const octets = (value: Uint8Array) =>
  new asn.OctetString({ valueHex: value.slice().buffer });
const bitString = (value: Uint8Array, unusedBits = 0) =>
  new asn.BitString({ valueHex: value.slice().buffer, unusedBits });
const pemDer = (label: string, value: asn.BaseBlock) =>
  `-----BEGIN ${label}-----\n${Buffer.from(der(value)).toString("base64")}\n-----END ${label}-----`;
const edAlgorithm = () => sequence(identifier(ed25519));
const edPrivate = (
  version = 0,
  publicKey?: asn.BaseBlock,
  extra: asn.BaseBlock[] = [],
) =>
  sequence(
    new asn.Integer({ value: version }),
    edAlgorithm(),
    octets(der(octets(rawEd25519))),
    ...extra,
    ...(publicKey ? [publicKey] : []),
  );
const context = (tagNumber: number, value: asn.BaseBlock[]) =>
  new asn.Constructed({
    idBlock: { tagClass: 3, tagNumber },
    value,
  });
const primitiveContext = (tagNumber: number, value: Uint8Array) =>
  new asn.Primitive({
    idBlock: { tagClass: 3, tagNumber },
    valueHex: value.slice().buffer,
  });

it("converts Node RSA PKCS#1, PKCS#8, and SPKI keys without changing their JWK material", async () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  for (const [key, type] of [
    [pair.privateKey, "pkcs1"],
    [pair.publicKey, "pkcs1"],
    [pair.privateKey, "pkcs8"],
    [pair.publicKey, "spki"],
  ] as const) {
    const input = pem(key, type);
    const jwk = JSON.parse((await pemToJwk(input)).output) as JsonWebKey;
    const expected = key.export({ format: "jwk" });
    expect(jwk.n).toBe(expected.n);
    expect(jwk.e).toBe(expected.e);
    expect(jwk.d).toBe(expected.d);
    expect(jwk.alg).toBeUndefined();
    expect(jwk.key_ops).toBeUndefined();
    expect(jwk.ext).toBeUndefined();

    const output = await jwkToPem(
      JSON.stringify(jwk),
      0,
      key.type === "private" ? "private" : "public",
    );
    expect(output.warnings).toEqual([]);
    expect(output.output).toBe(
      pem(key, key.type === "private" ? "pkcs8" : "spki"),
    );
  }
});

it("converts all supported EC curves and Node SEC1 private keys", async () => {
  for (const namedCurve of ["prime256v1", "secp384r1", "secp521r1"] as const) {
    const pair = generateKeyPairSync("ec", { namedCurve });
    const privateJwk = pair.privateKey.export({ format: "jwk" });
    const fromSec1 = JSON.parse(
      (await pemToJwk(pem(pair.privateKey, "sec1"))).output,
    ) as JsonWebKey;
    expect(fromSec1).toMatchObject({
      kty: "EC",
      crv: privateJwk.crv,
      x: privateJwk.x,
      y: privateJwk.y,
      d: privateJwk.d,
    });
    expect(
      (await jwkToPem(JSON.stringify(fromSec1), 0, "private")).output,
    ).toBe(pem(pair.privateKey, "pkcs8"));
    expect((await jwkToPem(JSON.stringify(fromSec1), 0, "public")).output).toBe(
      pem(pair.publicKey, "spki"),
    );
  }
});

it("converts Node OKP public keys and the private forms whose public key can be recovered", async () => {
  for (const type of ["ed25519", "ed448", "x25519", "x448"] as const) {
    const pair = generateOkp(type);
    const publicJwk = pair.publicKey.export({ format: "jwk" });
    const publicPem = pem(pair.publicKey, "spki");
    expect(JSON.parse((await pemToJwk(publicPem)).output)).toMatchObject(
      publicJwk,
    );
    expect(
      (await jwkToPem(JSON.stringify(publicJwk), 0, "public")).output,
    ).toBe(publicPem);

    const privateJwk = pair.privateKey.export({ format: "jwk" });
    const privatePem = pem(pair.privateKey, "pkcs8");
    expect(
      (await jwkToPem(JSON.stringify(privateJwk), 0, "private")).output,
    ).toBe(privatePem);
    if (type === "ed25519")
      expect(JSON.parse((await pemToJwk(privatePem)).output)).toMatchObject(
        privateJwk,
      );
    else
      await expect(pemToJwk(privatePem)).rejects.toThrow("public_key_missing");
  }
});

it("accepts single JWKs and bounded JWK sets while rejecting malformed selection and key material", async () => {
  const key = { kty: "oct", k: "AQ" };
  expect(listJwks(JSON.stringify(key))).toEqual([key]);
  expect(listJwks(JSON.stringify({ keys: [key] }))).toEqual([key]);
  for (const input of [
    '{"keys":[]}',
    '{"keys":[null]}',
    JSON.stringify({ keys: Array.from({ length: 101 }, () => key) }),
  ])
    expect(() => listJwks(input)).toThrow("invalid_key");
  for (const input of ["[]", "null"])
    expect(() => listJwks(input)).toThrow("object_required");

  await expect(jwkToPem('{"keys":[{}]}', 1, "public")).rejects.toThrow(
    "invalid_key",
  );
  await expect(jwkToPem('{"kty":"RSA"}', 0, "public")).rejects.toThrow(
    "missing_key_field",
  );
  await expect(
    jwkToPem('{"kty":"OKP","crv":"Ed25519","x":"AA"}', 0, "public"),
  ).rejects.toThrow("invalid_key");
  await expect(
    jwkToPem('{"kty":"EC","crv":"P-999","x":"AA","y":"AA"}', 0, "public"),
  ).rejects.toThrow("unsupported_curve");
  await expect(jwkToPem('{"kty":"oct","k":"AQ"}', 0, "public")).rejects.toThrow(
    "unsupported_key_type",
  );
});

it("keeps valid entries from PEM bundles, flags surrounding and unsupported data, and accepts DER base64", async () => {
  const pair = generateKeyPairSync("ed25519");
  const publicPem = pem(pair.publicKey, "spki");
  const result = await pemToJwk(
    `comment\n${publicPem}-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n${publicPem}`,
    false,
  );
  expect(JSON.parse(result.output).keys).toHaveLength(2);
  expect(result.output).not.toContain("\n  ");
  expect(result.warnings).toEqual(["unrecognized_text", "invalid_pem"]);
  const der = pair.publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  expect(JSON.parse((await pemToJwk(der)).output)).toMatchObject(
    pair.publicKey.export({ format: "jwk" }),
  );
});

it("rejects malformed, oversized, and excessively many PEM inputs with typed errors", async () => {
  await expect(pemToJwk("")).rejects.toThrow("invalid_pem");
  await expect(
    pemToJwk(
      "-----BEGIN PUBLIC KEY-----\nnot base64!\n-----END PUBLIC KEY-----",
    ),
  ).rejects.toThrow("invalid_base64");
  await expect(
    pemToJwk("-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----"),
  ).rejects.toThrow("invalid_pem");
  await expect(pemToJwk("x".repeat(1_048_577))).rejects.toThrow("too_large");
  await expect(
    pemToJwk(
      "-----BEGIN PUBLIC KEY-----\nAA==\n-----END PUBLIC KEY-----\n".repeat(
        101,
      ),
    ),
  ).rejects.toThrow("too_large");
});

it("rejects incomplete ASN.1 structures and unsupported algorithm identifiers", async () => {
  // These are actual DER encodings, not substitutes for the ASN.1 parser.
  for (const [derHex, code] of [
    ["020100", "invalid_pem"], // INTEGER instead of a key SEQUENCE.
    ["3000", "invalid_pem"], // Empty key SEQUENCE.
    ["30023000", "invalid_pem"], // Empty AlgorithmIdentifier.
    ["30053003020100", "invalid_pem"], // INTEGER instead of an algorithm OID.
    ["3009300506032b65700300", "invalid_key"], // Ed25519 with no public-key bytes.
    ["300b300706032b657005000300", "invalid_pem"], // Ed25519 with forbidden NULL parameters.
  ]) {
    const input = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(derHex, "hex").toString("base64")}\n-----END PUBLIC KEY-----`;
    await expect(pemToJwk(input)).rejects.toThrow(code);
  }
  const unknown = Buffer.from("3008300406022a030300", "hex").toString("base64");
  await expect(
    pemToJwk(
      `-----BEGIN PUBLIC KEY-----\n${unknown}\n-----END PUBLIC KEY-----`,
    ),
  ).rejects.toThrow("unsupported_curve");
});

it("validates output selection and rejects incomplete or invalid JWK material", async () => {
  for (const index of [-1, 0.5, Number.NaN])
    await expect(jwkToPem("{}", index, "public")).rejects.toThrow(
      "invalid_key",
    );
  await expect(jwkToPem("{}", 0, "der" as never)).rejects.toThrow(
    "invalid_key",
  );
  await expect(
    jwkToPem('{"kty":"OKP","crv":"unknown","x":"AA"}', 0, "public"),
  ).rejects.toThrow("unsupported_curve");
  await expect(
    jwkToPem('{"kty":"EC","crv":"P-256","x":"AA","y":"AA"}', 0, "public"),
  ).rejects.toThrow("invalid_key");
  await expect(jwkToPem('{"kty":null}', 0, "public")).rejects.toThrow(
    "unsupported_key_type",
  );
  const rsa = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey.export({ format: "jwk" });
  for (const field of ["d", "p", "q", "dp", "dq", "qi"] as const) {
    const incomplete = { ...rsa };
    delete incomplete[field];
    await expect(
      jwkToPem(JSON.stringify(incomplete), 0, "private"),
    ).rejects.toThrow("missing_key_field");
  }
});

it("rejects malformed ASN.1 key fields and unsupported EC parameters", async () => {
  const cases: [string, asn.BaseBlock, string][] = [
    [
      "PRIVATE KEY",
      sequence(
        new asn.Integer({ value: 0 }),
        edAlgorithm(),
        bitString(rawEd25519),
      ),
      "invalid_pem",
    ],
    [
      "PUBLIC KEY",
      sequence(sequence(new asn.Null()), bitString(rawEd25519)),
      "invalid_pem",
    ],
    [
      "PUBLIC KEY",
      sequence(sequence(identifier(ed25519)), bitString(rawEd25519, 1)),
      "invalid_pem",
    ],
    [
      "PUBLIC KEY",
      sequence(
        sequence(identifier("1.2.840.10045.2.1"), identifier("1.2.3")),
        bitString(rawEd25519),
      ),
      "unsupported_curve",
    ],
    [
      "EC PRIVATE KEY",
      sequence(new asn.Integer({ value: 1 }), octets(rawEd25519)),
      "unsupported_curve",
    ],
  ];
  for (const [label, value, code] of cases)
    await expect(pemToJwk(pemDer(label, value))).rejects.toThrow(code);
});

it("parses DER private keys and validates PKCS#8 version and public-key context", async () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateDer = pair.privateKey.export({ type: "pkcs8", format: "der" });
  expect(
    JSON.parse((await pemToJwk(privateDer.toString("base64"))).output),
  ).toMatchObject(pair.privateKey.export({ format: "jwk" }));

  await expect(pemToJwk(pemDer("PRIVATE KEY", edPrivate(2)))).rejects.toThrow(
    "invalid_pem",
  );
  await expect(
    pemToJwk(
      pemDer("PRIVATE KEY", edPrivate(0, context(1, [bitString(rawEd25519)]))),
    ),
  ).rejects.toThrow("invalid_pem");

  const unrelatedContext = context(0, []);
  expect(
    JSON.parse(
      (
        await pemToJwk(
          pemDer("PRIVATE KEY", edPrivate(1, undefined, [unrelatedContext])),
        )
      ).output,
    ),
  ).toMatchObject({ kty: "OKP", crv: "Ed25519" });
});

it("parses constructed and primitive OKP public-key contexts", async () => {
  const publicKey = new Uint8Array(32).fill(9);
  const constructed = context(1, [bitString(publicKey)]);
  expect(
    JSON.parse(
      (await pemToJwk(pemDer("PRIVATE KEY", edPrivate(1, constructed)))).output,
    ),
  ).toMatchObject({
    kty: "OKP",
    crv: "Ed25519",
    x: Buffer.from(publicKey).toString("base64url"),
  });

  const primitive = primitiveContext(1, new Uint8Array([0, ...publicKey]));
  expect(
    JSON.parse(
      (await pemToJwk(pemDer("PRIVATE KEY", edPrivate(1, primitive)))).output,
    ),
  ).toMatchObject({ x: Buffer.from(publicKey).toString("base64url") });
  await expect(
    pemToJwk(
      pemDer(
        "PRIVATE KEY",
        edPrivate(1, primitiveContext(1, new Uint8Array([1, ...publicKey]))),
      ),
    ),
  ).rejects.toThrow("invalid_pem");
  await expect(
    pemToJwk(
      pemDer(
        "PRIVATE KEY",
        edPrivate(1, context(1, [bitString(new Uint8Array(31))])),
      ),
    ),
  ).rejects.toThrow("invalid_key");
});

it("preserves valid public EC PEMs and maps unexpected WebCrypto failures in bundles", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  expect(
    JSON.parse((await pemToJwk(pem(pair.publicKey, "spki"))).output).crv,
  ).toBe("P-256");

  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockRejectedValueOnce(new Error("WebCrypto unavailable"));
  try {
    const bundle = `${pemDer("PRIVATE KEY", edPrivate(1))}${pem(pair.publicKey, "spki")}`;
    const result = await pemToJwk(bundle);
    expect(JSON.parse(result.output)).toMatchObject({
      kty: "EC",
      crv: "P-256",
    });
    expect(result.warnings).toEqual(["invalid_pem"]);
  } finally {
    digest.mockRestore();
  }
});

it("keeps usable bundle entries when a PEM label or RSA key is invalid", async () => {
  const pair = generateKeyPairSync("ed25519");
  const valid = pem(pair.publicKey, "spki");
  const labeled = valid
    .replace("BEGIN PUBLIC KEY", "BEGIN CERTIFICATE")
    .replace("END PUBLIC KEY", "END CERTIFICATE");
  const invalidRsa = pemDer(
    "PUBLIC KEY",
    sequence(
      sequence(identifier("1.2.840.113549.1.1.1"), new asn.Null()),
      bitString(new Uint8Array([0])),
    ),
  );
  const result = await pemToJwk(`${labeled}${invalidRsa}${valid}`);
  expect(JSON.parse(result.output)).toMatchObject({
    kty: "OKP",
    crv: "Ed25519",
  });
  expect(result.warnings).toEqual(["unsupported_pem", "invalid_key"]);
});
