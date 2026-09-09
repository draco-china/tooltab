import * as openpgp from "openpgp";
import {
  MAX_EXPIRATION_DAYS,
  PGP_RSA_SIZES,
  type PgpOptions,
  type PgpResult,
  PgpToolError,
} from "./pgp-contract";

function checked(value: string, max: number) {
  if (/[\uD800-\uDFFF]/u.test(value)) throw new PgpToolError("invalid_unicode");
  if (value.length > max || new TextEncoder().encode(value).length > max)
    throw new PgpToolError("too_large");
  return value;
}
export async function generatePgp(p: PgpOptions): Promise<PgpResult> {
  if (
    !["ecc", "rsa"].includes(p.algorithm) ||
    !PGP_RSA_SIZES.includes(p.rsaSize) ||
    !Number.isInteger(p.expirationDays) ||
    p.expirationDays < 0 ||
    p.expirationDays > MAX_EXPIRATION_DAYS
  )
    throw new PgpToolError("invalid_options");
  const name = checked(p.name, 4096).trim(),
    email = checked(p.email, 4096).trim(),
    comment = checked(p.comment, 4096).trim(),
    passphrase = checked(p.passphrase, 65536);
  if (!name && !email) throw new PgpToolError("invalid_identity");
  for (const v of [name, email, comment])
    if (
      Array.from(v).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      throw new PgpToolError("invalid_identity");
  let userID: openpgp.UserIDPacket;
  try {
    userID = openpgp.UserIDPacket.fromObject({ name, email, comment });
  } catch {
    throw new PgpToolError("invalid_identity");
  }
  try {
    const result = await openpgp.generateKey({
      type: p.algorithm,
      curve: p.algorithm === "ecc" ? "curve25519Legacy" : undefined,
      rsaBits: p.algorithm === "rsa" ? p.rsaSize : undefined,
      userIDs: [{ name, email, comment }],
      passphrase: passphrase || undefined,
      keyExpirationTime: p.expirationDays * 86400,
      format: "armored",
      config: { v6Keys: false, aeadProtect: false, maxUserIDLength: 16384 },
    });
    const key = await openpgp.readKey({
      armoredKey: result.publicKey,
      config: { maxUserIDLength: 16384 },
    });
    const expiration = await key.getExpirationTime();
    const expiresAt =
      expiration instanceof Date ? expiration.toISOString() : null;
    return {
      createdAt: key.getCreationTime().toISOString(),
      expiresAt,
      legacyExpiryOverflow:
        expiration instanceof Date && expiration.getTime() / 1000 > 0xffffffff,
      publicKey: result.publicKey,
      privateKey: result.privateKey,
      revocationCertificate: result.revocationCertificate,
      fingerprint: key
        .getFingerprint()
        .toUpperCase()
        .replace(/.{4}(?=.)/g, "$& "),
      keyID: key.getKeyID().toHex().toUpperCase(),
      userID: userID.userID,
      passphraseProtected: passphrase.length > 0,
    };
  } catch {
    throw new PgpToolError("generation_failed");
  }
}
