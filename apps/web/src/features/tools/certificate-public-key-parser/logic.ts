import type { parseCertificateParserInput } from "@workspace/tools/crypto/certificate";
import type { ParsedEntry } from "@workspace/tools/crypto/certificate-contract";
import type {
  CertificateEntry,
  CertificateParseResult,
  CertificateParserMessages,
  PublicKeyEntry,
} from "./types";

export async function parseCertificateInput(
  input: string | File,
  messages: CertificateParserMessages,
): Promise<CertificateParseResult> {
  // Keep the browser-only certificate implementation out of the SSR bundle.
  if (import.meta.env.SSR) throw new Error(messages.parseFailed);
  let value: string | Uint8Array;
  let label = messages.certificateLabel(1);
  if (typeof input === "string") {
    value = input;
  } else {
    const preview = await input.slice(0, 2048).text();
    value = preview.includes("-----BEGIN")
      ? await input.text()
      : new Uint8Array(await input.arrayBuffer());
    label = input.name || label;
  }
  let parsed: Awaited<ReturnType<typeof parseCertificateParserInput>>;
  try {
    const { parseCertificateParserInput } = await import(
      "@workspace/tools/crypto/certificate"
    );
    parsed = await parseCertificateParserInput(value);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    throw new Error(
      code === "invalid_input"
        ? messages.invalidInput
        : code === "invalid_pem"
          ? messages.invalidPem
          : code === "webcrypto_unavailable"
            ? messages.webCryptoUnavailable
            : messages.parseFailed,
    );
  }
  const warnings = parsed.warnings.map((warning) =>
    warning.code === "unsupported_block"
      ? messages.unsupportedPemBlock(warning.label)
      : `${messages.parseFailed} (${warning.label})`,
  );
  const isPem = typeof value === "string" && value.includes("-----BEGIN");
  if (!parsed.entries.length && isPem)
    throw new Error(warnings[0] || messages.parseFailed);
  const entries = parsed.entries.map((entry) => {
    const entryLabel = isPem
      ? entry.type === "certificate"
        ? messages.certificateLabel(entry.ordinal)
        : messages.publicKeyLabel(entry.ordinal)
      : label;
    return entry.type === "certificate"
      ? certificateEntry(entry, entryLabel, messages)
      : publicKeyEntry(entry, entryLabel, messages);
  });
  return { entries, warnings };
}

function certificateEntry(
  entry: ParsedEntry,
  label: string,
  messages: CertificateParserMessages,
): CertificateEntry {
  if (entry?.type !== "certificate") throw new Error(messages.parseFailed);
  const extensions = entry.extensions;
  const keyUsage = Array.isArray(extensions.keyUsage)
    ? extensions.keyUsage.map(
        (value) =>
          ({
            digitalSignature: "Digital Signature",
            nonRepudiation: "Non Repudiation",
            keyEncipherment: "Key Encipherment",
            dataEncipherment: "Data Encipherment",
            keyAgreement: "Key Agreement",
            keyCertSign: "Key Cert Sign",
            cRLSign: "CRL Sign",
            encipherOnly: "Encipher Only",
            decipherOnly: "Decipher Only",
          })[value] ?? value,
      )
    : undefined;
  const eku = Array.isArray(extensions.extendedKeyUsage)
    ? extensions.extendedKeyUsage.map(
        (value) =>
          ({
            "1.3.6.1.5.5.7.3.1": "TLS Web Server Authentication",
            "1.3.6.1.5.5.7.3.2": "TLS Web Client Authentication",
            "1.3.6.1.5.5.7.3.3": "Code Signing",
            "1.3.6.1.5.5.7.3.4": "Email Protection",
            "1.3.6.1.5.5.7.3.8": "Time Stamping",
            "1.3.6.1.5.5.7.3.9": "OCSP Signing",
          })[value] ?? value,
      )
    : undefined;

  return {
    type: "certificate",
    label,
    subject: entry.subject ?? "",
    issuer: entry.issuer ?? "",
    serialNumber: entry.serialNumber ?? "",
    notBefore: entry.notBefore ?? "",
    notAfter: entry.notAfter ?? "",
    signatureAlgorithm: entry.signatureAlgorithm ?? messages.notAvailable,
    publicKeyAlgorithm: entry.publicKeyAlgorithm,
    publicKeySize: entry.publicKeySize ?? undefined,
    publicKeyCurve: entry.publicKeyCurve ?? undefined,
    fingerprints: { sha1: entry.sha1, sha256: entry.sha256 },
    extensions: {
      subjectAlternativeNames: Array.isArray(extensions.subjectAlternativeNames)
        ? extensions.subjectAlternativeNames.map((name) => {
            const separator = name.indexOf(": ");
            const type = name.slice(0, separator);
            const labels: Readonly<Record<string, string>> = {
              dns: "DNS",
              dn: "DN",
              email: "Email",
              ip: "IP",
              url: "URI",
              guid: "GUID",
              upn: "UPN",
              id: "Registered ID",
            };
            return `${labels[type] ?? type}${name.slice(separator)}`;
          })
        : undefined,
      keyUsage,
      extendedKeyUsage: eku,
      basicConstraints:
        extensions.ca === undefined
          ? undefined
          : `CA: ${extensions.ca}${typeof extensions.pathLength === "number" ? `, Path Length: ${extensions.pathLength}` : ""}`,
      subjectKeyIdentifier: extensions.subjectKeyIdentifier as
        | string
        | undefined,
      authorityKeyIdentifier: extensions.authorityKeyIdentifier as
        | string
        | undefined,
    },
  };
}

function publicKeyEntry(
  entry: ParsedEntry,
  label: string,
  messages: CertificateParserMessages,
): PublicKeyEntry {
  if (entry?.type !== "publicKey") throw new Error(messages.parseFailed);

  return {
    type: "publicKey",
    label,
    algorithm: entry.publicKeyAlgorithm,
    keySize: entry.publicKeySize ?? undefined,
    curve: entry.publicKeyCurve ?? undefined,
    fingerprints: { sha1: entry.sha1, sha256: entry.sha256 },
  };
}
