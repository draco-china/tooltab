import * as asn from "asn1js";
import { execFile } from "node:child_process";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  X509Certificate,
} from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
import {
  generateCsr,
  parseCertificateParserInput,
  parseCertificates,
} from "../../src/crypto/certificate";
import {
  type CsrOptions,
  MAX_CERT_INPUT,
} from "../../src/crypto/certificate-contract";

const run = promisify(execFile);

function options(overrides: Partial<CsrOptions> = {}): CsrOptions {
  return {
    keySource: "generate",
    algorithm: "rsa",
    rsaSize: 2048,
    rsaHash: "SHA-384",
    ecCurve: "P-256",
    keyPem: "",
    subject: {
      commonName: "csr.example.test",
      organization: "ToolTab",
      organizationalUnit: "Crypto",
      country: "us",
      state: "California",
      locality: "San Francisco",
      emailAddress: "admin@example.test",
    },
    san: {
      dns: ["csr.example.test"],
      ip: ["2001:db8::1", "192.0.2.8"],
      email: ["admin@example.test"],
      uri: ["https://csr.example.test/status"],
    },
    ...overrides,
  };
}

async function withDirectory(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "tooltab-certificate-"));
  try {
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it("generates an RSA CSR whose subject, SANs, public key, and signature OpenSSL verifies", async () => {
  await withDirectory(async (directory) => {
    const result = await generateCsr(options());
    const path = join(directory, "request.csr");
    await writeFile(path, result.csrPem);

    const inspected = await run("openssl", [
      "req",
      "-in",
      path,
      "-noout",
      "-verify",
      "-subject",
      "-text",
    ]);
    expect(`${inspected.stdout}${inspected.stderr}`).toContain("verify OK");
    expect(inspected.stdout).toContain("CN=csr.example.test");
    expect(inspected.stdout).toContain("O=ToolTab");
    expect(inspected.stdout).toContain("C=US");
    expect(inspected.stdout).toContain("sha384WithRSAEncryption");
    for (const name of [
      "DNS:csr.example.test",
      "IP Address:2001:DB8:0:0:0:0:0:1",
      "IP Address:192.0.2.8",
      "email:admin@example.test",
      "URI:https://csr.example.test/status",
    ])
      expect(inspected.stdout).toContain(name);

    const csrPublicKey = (
      await run("openssl", ["req", "-in", path, "-noout", "-pubkey"])
    ).stdout;
    expect(
      createPublicKey(csrPublicKey).export({ type: "spki", format: "der" }),
    ).toEqual(
      // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
      createPublicKey(result.privateKeyPem!).export({
        type: "spki",
        format: "der",
      }),
    );
    expect(result.keyAlgorithm).toBe("RSA 2048 / SHA-384");
  });
}, 30000);

it.each([
  {
    algorithm: "ecdsa" as const,
    signature: "ecdsa-with-SHA256",
    label: "ECDSA P-256",
  },
  {
    algorithm: "rsa" as const,
    signature: "sha384WithRSAEncryption",
    label: "RSA 2048 / SHA-384",
  },
])(
  "uses imported $algorithm PKCS#8 without returning its private key",
  async ({ algorithm, signature, label }) => {
    await withDirectory(async (directory) => {
      const pair =
        algorithm === "rsa"
          ? generateKeyPairSync("rsa", { modulusLength: 2048 })
          : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const privateKeyPem = pair.privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString();
      const result = await generateCsr(
        options({
          keySource: "import",
          algorithm,
          keyPem: privateKeyPem,
          subject: {
            ...options().subject,
            commonName: "imported.example.test",
          },
        }),
      );
      const path = join(directory, "request.csr");
      await writeFile(path, result.csrPem);
      const inspected = await run("openssl", [
        "req",
        "-in",
        path,
        "-noout",
        "-verify",
        "-text",
      ]);
      expect(`${inspected.stdout}${inspected.stderr}`).toContain("verify OK");
      expect(inspected.stdout).toContain(signature);
      const csrPublicKey = (
        await run("openssl", ["req", "-in", path, "-noout", "-pubkey"])
      ).stdout;
      expect(
        createPublicKey(csrPublicKey).export({ type: "spki", format: "der" }),
      ).toEqual(pair.publicKey.export({ type: "spki", format: "der" }));
      expect(result).toMatchObject({
        privateKeyPem: null,
        keyAlgorithm: label,
      });
    });
  },
);

it("parses real OpenSSL certificates and public keys with native fingerprints", async () => {
  await withDirectory(async (directory) => {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const keyPath = join(directory, "key.pem");
    const certificatePath = join(directory, "certificate.pem");
    await writeFile(
      keyPath,
      pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    await run("openssl", [
      "req",
      "-x509",
      "-new",
      "-key",
      keyPath,
      "-subj",
      "/C=US/O=ToolTab/CN=parser.example.test",
      "-addext",
      "subjectAltName=DNS:parser.example.test,IP:2001:db8::1,email:ops@example.test,URI:https://parser.example.test/status",
      "-addext",
      "subjectKeyIdentifier=hash",
      "-addext",
      "authorityKeyIdentifier=keyid",
      "-addext",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "-days",
      "1",
      "-out",
      certificatePath,
    ]);
    const certificatePem = await readFile(certificatePath, "utf8");
    const publicKeyPem = pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const parsed = await parseCertificates(`${certificatePem}${publicKeyPem}`);
    const certificate = new X509Certificate(certificatePem);
    const pageBundle = await parseCertificateParserInput(
      `-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n${certificatePem.replaceAll("CERTIFICATE", "FOO CERTIFICATE")}${publicKeyPem}`,
    );
    expect(
      pageBundle.entries.map((entry) => ({
        type: entry.type,
        ordinal: entry.ordinal,
      })),
    ).toEqual([
      { type: "certificate", ordinal: 2 },
      { type: "publicKey", ordinal: 1 },
    ]);
    expect(pageBundle.entries[0].sha256).toBe(certificate.fingerprint256);
    expect(pageBundle.warnings).toEqual([
      { label: "CERTIFICATE", code: "parse_failed" },
    ]);
    const strictBundle = await parseCertificates(
      certificatePem.replaceAll("CERTIFICATE", "FOO CERTIFICATE"),
    );
    expect(strictBundle.entries).toEqual([]);
    expect(strictBundle.warnings).toEqual([
      { index: 1, label: "FOO CERTIFICATE", code: "unsupported_block" },
    ]);

    const certificateEntry = parsed.entries[0];
    const publicKeyEntry = parsed.entries[1];

    expect(parsed).toMatchObject({ warnings: [], trustChecked: false });
    expect(certificateEntry).toMatchObject({
      index: 1,
      type: "certificate",
      label: "CERTIFICATE",
      subject: expect.stringContaining("CN=parser.example.test"),
      issuer: expect.stringContaining("CN=parser.example.test"),
      publicKeySize: 2048,
      publicKeyCurve: null,
      extensions: expect.objectContaining({ ca: true }),
    });
    expect(certificateEntry.sha1).toBe(certificate.fingerprint);
    expect(certificateEntry.sha256).toBe(certificate.fingerprint256);
    expect(certificateEntry.extensions.subjectAlternativeNames).toEqual(
      expect.arrayContaining([
        "dns: parser.example.test",
        "ip: 2001:db8::1",
        "email: ops@example.test",
        "url: https://parser.example.test/status",
      ]),
    );
    expect(certificateEntry.extensions.subjectKeyIdentifier).toMatch(
      /^[0-9A-F:]+$/,
    );
    const publicDer = createPublicKey(publicKeyPem).export({
      type: "spki",
      format: "der",
    });
    expect(publicKeyEntry).toMatchObject({
      index: 2,
      type: "publicKey",
      label: "PUBLIC KEY",
      subject: null,
      issuer: null,
      publicKeySize: 2048,
    });
    expect(publicKeyEntry.sha1).toBe(
      createHash("sha1")
        .update(publicDer)
        .digest("hex")
        .toUpperCase()
        .replace(/(..)(?=.)/g, "$1:"),
    );
    expect(publicKeyEntry.sha256).toBe(
      createHash("sha256")
        .update(publicDer)
        .digest("hex")
        .toUpperCase()
        .replace(/(..)(?=.)/g, "$1:"),
    );
    const plainBase64 = await parseCertificates(
      Buffer.from(publicDer).toString("base64"),
    );
    expect(plainBase64.entries).toHaveLength(1);
    expect(plainBase64.entries[0]).toMatchObject({ type: "publicKey" });
  });
}, 30000);

it("returns typed errors for invalid CSR input and bounded certificate input", async () => {
  await expect(
    generateCsr(
      options({
        subject: {
          commonName: "",
          organization: "",
          organizationalUnit: "",
          country: "",
          state: "",
          locality: "",
          emailAddress: "",
        },
        san: { dns: [], ip: [], email: [], uri: [] },
      }),
    ),
  ).rejects.toMatchObject({ code: "missing_subject" });
  await expect(
    generateCsr(options({ subject: { ...options().subject, country: "USA" } })),
  ).rejects.toMatchObject({ code: "invalid_subject" });
  await expect(
    generateCsr(options({ san: { ...options().san, ip: ["010.0.0.1"] } })),
  ).rejects.toMatchObject({ code: "invalid_ip" });
  await expect(
    generateCsr(
      options({
        san: {
          dns: Array.from({ length: 1001 }, () => "limit.example.test"),
          ip: [],
          email: [],
          uri: [],
        },
      }),
    ),
  ).rejects.toMatchObject({ code: "too_large" });
  await expect(parseCertificates("not a certificate")).rejects.toMatchObject({
    code: "invalid_pem",
  });
  await expect(parseCertificates("\ud800")).rejects.toMatchObject({
    code: "invalid_unicode",
  });
  await expect(
    parseCertificates("x".repeat(MAX_CERT_INPUT + 1)),
  ).rejects.toMatchObject({
    code: "too_large",
  });
  await expect(
    parseCertificates(
      "-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----",
    ),
  ).resolves.toMatchObject({
    entries: [],
    warnings: [{ index: 1, label: "CERTIFICATE", code: "invalid_der" }],
  });
  await expect(parseCertificates("MAA=")).rejects.toMatchObject({
    code: "invalid_der",
  });
});

it("preserves the certificate page PEM block and ordinal behavior in core", async () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyPem = pair.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const badPublicKey =
    "-----BEGIN PUBLIC KEY-----\nMAA=\n-----END PUBLIC KEY-----\n";

  const parsed = await parseCertificateParserInput(
    `${badPublicKey}${publicKeyPem}`,
  );
  expect(parsed.entries).toMatchObject([
    { type: "publicKey", ordinal: 2, label: "PUBLIC KEY" },
  ]);
  expect(parsed.warnings).toEqual([
    { label: "PUBLIC KEY", code: "parse_failed" },
  ]);

  const certificateLabeledKey = publicKeyPem.replaceAll(
    "PUBLIC KEY",
    "FOO CERTIFICATE",
  );
  await expect(
    parseCertificateParserInput(certificateLabeledKey),
  ).resolves.toEqual({
    entries: [],
    warnings: [{ label: "FOO CERTIFICATE", code: "parse_failed" }],
  });
  await expect(
    parseCertificateParserInput(
      "-----BEGIN CERTIFICATE REQUEST-----\nAA==\n-----END CERTIFICATE REQUEST-----",
    ),
  ).resolves.toEqual({
    entries: [],
    warnings: [{ label: "CERTIFICATE REQUEST", code: "unsupported_block" }],
  });
  await expect(
    parseCertificateParserInput(
      "-----BEGIN CERTIFICATE-----\nnot base64!\n-----END CERTIFICATE-----",
    ),
  ).rejects.toMatchObject({ code: "invalid_pem" });
});

it("keeps certificate page input errors and binary DER parsing separate from the protocol parser", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const der = new Uint8Array(
    pair.publicKey.export({ type: "spki", format: "der" }),
  );
  await expect(
    parseCertificateParserInput("not a certificate!"),
  ).rejects.toMatchObject({ code: "invalid_input" });
  await expect(
    parseCertificateParserInput(new Uint8Array(MAX_CERT_INPUT + 1)),
  ).rejects.toMatchObject({ code: "too_large" });
  await expect(parseCertificateParserInput(der)).resolves.toMatchObject({
    entries: [{ type: "publicKey", ordinal: 1, label: "DER" }],
    warnings: [],
  });
  await expect(
    parseCertificateParserInput(
      "-----BEGIN UNKNOWN-----\nAA==\n-----END UNKNOWN-----",
    ),
  ).resolves.toEqual({
    entries: [],
    warnings: [{ label: "UNKNOWN", code: "unsupported_block" }],
  });
});

it("rejects unsupported CSR options, unsafe subject text, and invalid SAN values", async () => {
  for (const invalid of [
    { rsaSize: 512 as never },
    { rsaHash: "SHA-1" as never },
    { ecCurve: "P-999" as never },
    { algorithm: "ed25519" as never },
    { keySource: "remote" as never },
  ])
    await expect(generateCsr(options(invalid))).rejects.toMatchObject({
      code: "invalid_options",
    });
  for (const subject of [
    { ...options().subject, commonName: "bad\nname" },
    { ...options().subject, emailAddress: "用户@example.test" },
  ])
    await expect(generateCsr(options({ subject }))).rejects.toMatchObject({
      code: "invalid_subject",
    });
  await expect(
    generateCsr(options({ san: { ...options().san, dns: ["bad name"] } })),
  ).rejects.toMatchObject({ code: "invalid_san" });
  await expect(
    generateCsr(
      options({
        subject: { ...options().subject, commonName: "x".repeat(4097) },
      }),
    ),
  ).rejects.toMatchObject({ code: "too_large" });
});

it("distinguishes missing, encrypted, legacy, malformed and unsupported imported keys", async () => {
  for (const [keyPem, code] of [
    ["", "missing_key"],
    ["-----BEGIN ENCRYPTED PRIVATE KEY-----", "encrypted_key"],
    ["-----BEGIN RSA PRIVATE KEY-----", "legacy_key"],
    ["-----BEGIN EC PRIVATE KEY-----", "legacy_key"],
    ["not PEM", "invalid_pem"],
    [
      "-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----",
      "invalid_der",
    ],
  ])
    await expect(
      generateCsr(options({ keySource: "import", keyPem })),
    ).rejects.toMatchObject({ code });
  const unsupported = generateKeyPairSync("ed25519")
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
  await expect(
    generateCsr(options({ keySource: "import", keyPem: unsupported })),
  ).rejects.toMatchObject({ code: "unsupported_key" });
  const small = generateKeyPairSync("rsa", { modulusLength: 512 })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();
  await expect(
    generateCsr(options({ keySource: "import", keyPem: small })),
  ).rejects.toMatchObject({ code: "unsupported_key" });
});

it("bounds binary and PEM block inputs and rejects invalid UTF-8 PEM bytes", async () => {
  await expect(
    parseCertificates(new Uint8Array(MAX_CERT_INPUT + 1)),
  ).rejects.toMatchObject({ code: "too_large" });
  const prefix = new TextEncoder().encode("-----BEGIN CERTIFICATE-----\n");
  const invalid = new Uint8Array(prefix.length + 1);
  invalid.set(prefix);
  invalid[prefix.length] = 255;
  await expect(parseCertificates(invalid)).rejects.toMatchObject({
    code: "invalid_unicode",
  });
  await expect(
    parseCertificates(
      "-----BEGIN UNKNOWN-----\nAA==\n-----END UNKNOWN-----\n".repeat(1001),
    ),
  ).rejects.toMatchObject({ code: "too_large" });
  await expect(
    parseCertificates("-----BEGIN CERTIFICATE-----"),
  ).rejects.toMatchObject({ code: "invalid_pem" });
  await expect(parseCertificates(" ")).resolves.toEqual({
    entries: [],
    warnings: [],
    trustChecked: false,
  });
});

it("rejects malformed PKCS#8 fields before importing cryptographic material", async () => {
  const seq = (...value: asn.BaseBlock[]) => new asn.Sequence({ value });
  const oid = (value: string) => new asn.ObjectIdentifier({ value });
  const octets = (value: asn.BaseBlock) =>
    new asn.OctetString({ valueHex: value.toBER(false) });
  const zero = () => new asn.Integer({ value: 0 });
  const cases = [
    { node: seq(), code: "invalid_pem" },
    { node: seq(zero(), seq(zero()), octets(seq())), code: "invalid_pem" },
    {
      node: seq(zero(), seq(oid("1.2.840.113549.1.1.1")), octets(seq(zero()))),
      code: "invalid_pem",
    },
    {
      node: seq(
        zero(),
        seq(oid("1.2.840.10045.2.1"), oid("1.3.132.0.10")),
        octets(seq()),
      ),
      code: "unsupported_key",
    },
    {
      node: seq(
        zero(),
        seq(oid("1.2.840.113549.1.1.1")),
        octets(seq(zero(), zero())),
      ),
      code: "unsupported_key",
    },
    {
      node: seq(
        zero(),
        seq(oid("1.2.840.10045.2.1"), oid("1.2.840.10045.3.1.7")),
        octets(seq()),
      ),
      code: "import_failed",
    },
  ];
  for (const { node, code } of cases) {
    const keyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(node.toBER(false)).toString("base64")}\n-----END PRIVATE KEY-----`;
    await expect(
      generateCsr(options({ keySource: "import", keyPem })),
    ).rejects.toMatchObject({ code });
  }
});

it("generates EC CSRs for every supported curve while skipping blank SAN entries", async () => {
  for (const ecCurve of ["P-256", "P-384", "P-521"] as const)
    await withDirectory(async (directory) => {
      const result = await generateCsr(
        options({
          algorithm: "ecdsa",
          ecCurve,
          san: {
            dns: ["", "  ", "ec.example.test"],
            ip: [],
            email: [],
            uri: [],
          },
        }),
      );
      const path = join(directory, "ec.csr");
      await writeFile(path, result.csrPem);
      const inspected = await run("openssl", [
        "req",
        "-in",
        path,
        "-noout",
        "-verify",
        "-text",
      ]);
      expect(`${inspected.stdout}${inspected.stderr}`).toContain("verify OK");
      expect(inspected.stdout).toContain("DNS:ec.example.test");
      expect(result.keyAlgorithm).toBe(`ECDSA ${ecCurve}`);
      expect(result.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    });
});

it("preserves CA path length and extended key usages across PEM and binary certificate inputs", async () => {
  await withDirectory(async (directory) => {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const keyPath = join(directory, "ca.key"),
      certPath = join(directory, "ca.pem");
    await writeFile(
      keyPath,
      pair.privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    await run("openssl", [
      "req",
      "-x509",
      "-new",
      "-key",
      keyPath,
      "-subj",
      "/CN=ca.example.test",
      "-addext",
      "basicConstraints=critical,CA:TRUE,pathlen:2",
      "-addext",
      "extendedKeyUsage=serverAuth,clientAuth",
      "-days",
      "1",
      "-out",
      certPath,
    ]);
    const pem = await readFile(certPath, "utf8");
    const native = new X509Certificate(pem);
    const expected = {
      ca: true,
      pathLength: 2,
      extendedKeyUsage: ["1.3.6.1.5.5.7.3.1", "1.3.6.1.5.5.7.3.2"],
    };
    for (const input of [
      pem,
      new TextEncoder().encode(pem),
      new Uint8Array(native.raw),
    ]) {
      const parsed = await parseCertificates(input);
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].extensions).toMatchObject(expected);
      expect(parsed.entries[0].sha256).toBe(native.fingerprint256);
      expect(parsed.entries[0].publicKeyCurve).toBe("P-256");
      expect(parsed.trustChecked).toBe(false);
    }
    const surrounding = await parseCertificates(`before\n${pem}after`);
    expect(surrounding.entries).toHaveLength(1);
    expect(surrounding.warnings).toEqual([
      { index: 1, label: "", code: "unrecognized_text" },
      { index: 2, label: "", code: "unrecognized_text" },
    ]);
    const rawPublic = pair.publicKey.export({ type: "spki", format: "der" });
    expect(
      (await parseCertificates(new Uint8Array(rawPublic))).entries[0],
    ).toMatchObject({ type: "publicKey", publicKeyCurve: "P-256" });
  });
});

it("rejects valid ASN.1 sequences that are neither certificates nor public keys", async () => {
  for (const label of ["CERTIFICATE", "PUBLIC KEY"])
    await expect(
      parseCertificates(
        `-----BEGIN ${label}-----\nMAA=\n-----END ${label}-----`,
      ),
    ).resolves.toEqual({
      entries: [],
      warnings: [{ index: 1, label, code: "invalid_der" }],
      trustChecked: false,
    });
  await expect(parseCertificates(Uint8Array.of(0x30, 0))).rejects.toMatchObject(
    { code: "invalid_der" },
  );
});

it("generates subject-only and SAN-only CSRs without inventing absent fields", async () => {
  const emptySubject = {
    commonName: "",
    organization: "",
    organizationalUnit: "",
    country: "",
    state: "",
    locality: "",
    emailAddress: "",
  };
  for (const sanOnly of [false, true])
    await withDirectory(async (directory) => {
      const result = await generateCsr(
        options({
          algorithm: "ecdsa",
          subject: sanOnly ? emptySubject : options().subject,
          san: {
            dns: sanOnly ? ["san-only.example.test"] : [],
            ip: [],
            email: [],
            uri: [],
          },
        }),
      );
      const path = join(directory, "minimal.csr");
      await writeFile(path, result.csrPem);
      const inspected = await run("openssl", [
        "req",
        "-in",
        path,
        "-noout",
        "-verify",
        "-text",
      ]);
      expect(`${inspected.stdout}${inspected.stderr}`).toContain("verify OK");
      if (sanOnly) {
        expect(inspected.stdout).toContain("DNS:san-only.example.test");
        expect(inspected.stdout).not.toContain("csr.example.test");
      } else {
        expect(inspected.stdout).toContain("csr.example.test");
        expect(inspected.stdout).not.toContain(
          "X509v3 Subject Alternative Name",
        );
      }
    });
});

it("maps native signing failures and permits a fresh CSR attempt after recovery", async () => {
  const spy = vi
    .spyOn(crypto.subtle, "sign")
    .mockRejectedValueOnce(new Error("signing unavailable"));
  try {
    await expect(
      generateCsr(options({ algorithm: "ecdsa" })),
    ).rejects.toMatchObject({ code: "generation_failed" });
    expect(spy).toHaveBeenCalledOnce();
  } finally {
    spy.mockRestore();
  }
  const result = await generateCsr(options({ algorithm: "ecdsa" }));
  expect(result.csrPem).toContain("BEGIN CERTIFICATE REQUEST");
  expect(result.privateKeyPem).toContain("BEGIN PRIVATE KEY");
});

it("records unexpected fingerprint failures per PEM block and recovers on the next call", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicPem = pair.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const spy = vi
    .spyOn(crypto.subtle, "digest")
    .mockRejectedValueOnce(new Error("digest unavailable"));
  try {
    const result = await parseCertificates(publicPem);
    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([
      { index: 1, label: "PUBLIC KEY", code: "invalid_der" },
    ]);
  } finally {
    spy.mockRestore();
  }
  const recovered = await parseCertificates(publicPem);
  expect(recovered.entries).toHaveLength(1);
  expect(recovered.warnings).toEqual([]);
});

it("keeps absent authority identifiers and unconstrained CA path lengths absent", async () => {
  await withDirectory(async (directory) => {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const key = join(directory, "key.pem");
    const cert = join(directory, "cert.pem");
    const config = join(directory, "openssl.cnf");
    await writeFile(
      key,
      pair.privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    await writeFile(
      config,
      "[req]\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\n[ext]\nbasicConstraints=critical,CA:TRUE\n",
    );
    await run("openssl", [
      "req",
      "-x509",
      "-new",
      "-key",
      key,
      "-subj",
      "/CN=minimal.example.test",
      "-config",
      config,
      "-days",
      "1",
      "-out",
      cert,
    ]);
    const parsed = await parseCertificates(await readFile(cert, "utf8"));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].extensions.ca).toBe(true);
    expect(parsed.entries[0].extensions).not.toHaveProperty("pathLength");
    expect(parsed.entries[0].extensions).not.toHaveProperty(
      "authorityKeyIdentifier",
    );
  });
});

it("retains unsupported-key errors if the runtime imports an unexpectedly small RSA key", async () => {
  const valid = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const small = generateKeyPairSync("rsa", { modulusLength: 512 });
  const importedSmall = await crypto.subtle.importKey(
    "pkcs8",
    small.privateKey.export({ type: "pkcs8", format: "der" }),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" },
    true,
    ["sign"],
  );
  const spy = vi
    .spyOn(crypto.subtle, "importKey")
    .mockResolvedValueOnce(importedSmall);
  try {
    await expect(
      generateCsr(
        options({
          keySource: "import",
          keyPem: valid.privateKey
            .export({ type: "pkcs8", format: "pem" })
            .toString(),
        }),
      ),
    ).rejects.toMatchObject({ code: "unsupported_key" });
    expect(spy).toHaveBeenCalledTimes(2);
  } finally {
    spy.mockRestore();
  }
});

it("parses a version-one certificate without inventing any extensions", async () => {
  await withDirectory(async (directory) => {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const key = join(directory, "key.pem"),
      cert = join(directory, "cert.pem"),
      config = join(directory, "openssl.cnf");
    await writeFile(
      key,
      pair.privateKey.export({ type: "pkcs8", format: "pem" }),
    );
    await writeFile(
      config,
      "[req]\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\n[ext]\nsubjectKeyIdentifier=none\n",
    );
    await run("openssl", [
      "req",
      "-x509",
      "-new",
      "-key",
      key,
      "-subj",
      "/CN=v1.example.test",
      "-config",
      config,
      "-days",
      "1",
      "-out",
      cert,
    ]);
    const result = await parseCertificates(await readFile(cert, "utf8"));
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].extensions).toEqual({});
    expect(result.warnings).toEqual([]);
  });
});

it("preserves empty input, whitespace base64 and ignored empty PEM blocks", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const der = pair.publicKey.export({ type: "spki", format: "der" });
  const pem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  await expect(parseCertificateParserInput(" \n\t ")).resolves.toEqual({
    entries: [],
    warnings: [],
  });
  const base64 = der.toString("base64").replace(/.{20}/g, "$&\n");
  const parsed = await parseCertificateParserInput(base64);
  expect(parsed.entries[0]).toMatchObject({ type: "publicKey", ordinal: 1 });
  expect(parsed.entries[0].sha256).toBe(
    (await parseCertificateParserInput(new Uint8Array(der))).entries[0].sha256,
  );
  await expect(parseCertificateParserInput("A")).rejects.toMatchObject({
    code: "invalid_input",
  });
  const mixed = await parseCertificateParserInput(
    `-----BEGIN PUBLIC KEY-----\n\n-----END PUBLIC KEY-----\n${pem}`,
  );
  expect(mixed.entries[0].ordinal).toBe(1);
  expect(mixed.warnings).toEqual([]);
});

it("reports invalid DER before unavailable WebCrypto and stops valid PEM on capability failure", async () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const der = new Uint8Array(
    pair.publicKey.export({ type: "spki", format: "der" }),
  );
  const pem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });
  try {
    await expect(
      parseCertificateParserInput(new Uint8Array([0])),
    ).rejects.toMatchObject({ code: "invalid_der" });
    await expect(parseCertificateParserInput(der)).rejects.toMatchObject({
      code: "webcrypto_unavailable",
    });
    await expect(parseCertificateParserInput(pem)).rejects.toMatchObject({
      code: "webcrypto_unavailable",
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
