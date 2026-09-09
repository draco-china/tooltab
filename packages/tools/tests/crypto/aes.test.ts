import { type CipherGCM, createCipheriv, pbkdf2Sync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  aesDefaults,
  decryptAes,
  encryptAes,
  fromBase64,
  hex,
  hexBytes,
  inspectEnvelope,
  MAX_AES_BYTES,
  MAX_AES_ENVELOPE,
  toBase64,
  utf8,
} from "../../src/crypto/aes";

const nistGcmEnvelope = JSON.stringify({
  version: "inbrowser-aes-v1",
  algorithm: "AES-GCM",
  key: { source: "raw", lengthBits: 128 },
  iv: "000000000000000000000000",
  ciphertext: "A4jazmC2o5LzKMK5cbL+eKtuR9Qs7BO99TpnshJXvd8=",
  encoding: "base64",
  plaintext: { type: "text" },
});
const nativeCiphertext = (
  mode: "GCM" | "CBC" | "CTR",
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
) => {
  const cipher = createCipheriv(
    `aes-${key.length * 8}-${mode.toLowerCase()}`,
    key,
    iv,
  );
  return Buffer.concat([
    cipher.update(data),
    cipher.final(),
    ...(mode === "GCM" ? [(cipher as CipherGCM).getAuthTag()] : []),
  ]);
};

describe("AES envelopes", () => {
  it("decrypts the fixed NIST AES-128-GCM zero vector", async () => {
    const result = await decryptAes(nistGcmEnvelope, {
      rawKeyHex: "00".repeat(16),
    });
    expect(result.bytes).toEqual(new Uint8Array(16));
    expect(result.text).toBe("\0".repeat(16));
    expect(result.authenticated).toBe(true);
  });

  it("uses fresh random IVs and salts without serializing secret material", async () => {
    const options = {
      ...aesDefaults,
      password: "password used only in this test",
      pbkdf2Iterations: 1000,
    };
    const [first, second] = await Promise.all([
      encryptAes("same message", options),
      encryptAes("same message", options),
    ]);
    expect(first.envelope.iv).not.toBe(second.envelope.iv);
    expect(first.envelope.key).not.toEqual(second.envelope.key);
    expect(first.json).not.toContain(options.password);
  });

  it("matches Node crypto with the encryptor's actual IV for every mode and raw key size", async () => {
    const plaintext = utf8("AES cross-runtime \u2713");
    for (const mode of ["GCM", "CBC", "CTR"] as const)
      for (const keyLengthBits of [128, 192, 256] as const) {
        const keyHex = "a5".repeat(keyLengthBits / 8);
        const encrypted = await encryptAes(plaintext, {
          ...aesDefaults,
          mode,
          keySource: "raw",
          keyLengthBits,
          rawKeyHex: keyHex,
        });
        expect(fromBase64(encrypted.envelope.ciphertext)).toEqual(
          new Uint8Array(
            nativeCiphertext(
              mode,
              hexBytes(keyHex, keyLengthBits / 8),
              hexBytes(encrypted.envelope.iv, mode === "GCM" ? 12 : 16),
              plaintext,
            ),
          ),
        );
        expect(
          (await decryptAes(encrypted.json, { rawKeyHex: keyHex })).bytes,
        ).toEqual(plaintext);
      }
  });

  it("matches Node PBKDF2 and AES for each password hash, key size, and mode", async () => {
    const password = "password with unicode \ud83d\udd10";
    const plaintext = utf8("plaintext \u5bc6\u7801");
    for (const mode of ["GCM", "CBC", "CTR"] as const)
      for (const keyLengthBits of [128, 192, 256] as const)
        for (const pbkdf2Hash of ["SHA-256", "SHA-384", "SHA-512"] as const) {
          const encrypted = await encryptAes(plaintext, {
            ...aesDefaults,
            mode,
            keyLengthBits,
            password,
            pbkdf2Hash,
            pbkdf2Iterations: 1000,
          });
          if (encrypted.envelope.key.source !== "password") throw Error();
          const key = pbkdf2Sync(
            password,
            Buffer.from(encrypted.envelope.key.salt, "hex"),
            1000,
            keyLengthBits / 8,
            pbkdf2Hash.replace("-", "").toLowerCase(),
          );
          expect(fromBase64(encrypted.envelope.ciphertext)).toEqual(
            new Uint8Array(
              nativeCiphertext(
                mode,
                key,
                hexBytes(encrypted.envelope.iv, mode === "GCM" ? 12 : 16),
                plaintext,
              ),
            ),
          );
          expect(
            (await decryptAes(encrypted.json, { password })).bytes,
          ).toEqual(plaintext);
        }
  });

  it("round-trips empty file bytes in every mode and reports file metadata", async () => {
    for (const mode of ["GCM", "CBC", "CTR"] as const) {
      const encrypted = await encryptAes(
        new Uint8Array(),
        {
          ...aesDefaults,
          mode,
          keySource: "raw",
          rawKeyHex: "ab".repeat(32),
        },
        { type: "file", name: "empty.bin", mimeType: "", size: 0 },
      );
      const decrypted = await decryptAes(encrypted.json, {
        rawKeyHex: "ab".repeat(32),
      });
      expect(decrypted).toMatchObject({
        bytes: new Uint8Array(),
        text: null,
        authenticated: mode === "GCM",
        metadataAuthenticated: false,
        sizeMatches: true,
      });
    }
  });

  it("rejects wrong keys, GCM tampering, malformed envelopes, and invalid options", async () => {
    const encrypted = await encryptAes("secret", {
      ...aesDefaults,
      password: "right password",
      pbkdf2Iterations: 1000,
    });
    await expect(
      decryptAes(encrypted.json, { password: "wrong password" }),
    ).rejects.toThrow("decrypt_failed");
    const tampered = fromBase64(encrypted.envelope.ciphertext);
    tampered[0] ^= 1;
    await expect(
      decryptAes(
        JSON.stringify({
          ...encrypted.envelope,
          ciphertext: toBase64(tampered),
        }),
        { password: "right password" },
      ),
    ).rejects.toThrow("decrypt_failed");
    for (const input of [
      "not json",
      JSON.stringify({ ...encrypted.envelope, algorithm: "AES-ECB" }),
      JSON.stringify({ ...encrypted.envelope, iv: "00" }),
      JSON.stringify({ ...encrypted.envelope, password: "leaked" }),
    ])
      expect(() => inspectEnvelope(input)).toThrow("invalid_envelope");
    await expect(
      encryptAes("x", { ...aesDefaults, keySource: "raw", rawKeyHex: "aa" }),
    ).rejects.toThrow("invalid_key");
    await expect(
      encryptAes("x", { ...aesDefaults, pbkdf2Iterations: 999 }),
    ).rejects.toThrow("invalid_options");
  });

  it("accepts canonical base64 and hex helpers, rejecting malformed encodings and UTF-8", () => {
    expect(fromBase64(" Zg \n")).toEqual(new Uint8Array([102]));
    expect(fromBase64("AA==")).toEqual(new Uint8Array([0]));
    expect(fromBase64("AAA=")).toEqual(new Uint8Array([0, 0]));
    expect(toBase64(new Uint8Array([102]))).toBe("Zg==");
    expect(hex(hexBytes("00:ff", 2))).toBe("00ff");
    for (const value of ["AB==", "A===", "AA=A", "A", "!!!!"])
      expect(() => fromBase64(value)).toThrow("invalid_envelope");
    expect(() => hexBytes("gg", 1)).toThrow("invalid_key");
    expect(() => hexBytes("00".repeat(524289), 1)).toThrow("invalid_key");
    expect(() => utf8("\ud800")).toThrow("invalid_utf8");
  });

  it("uses available typed-array base64 capabilities and maps unavailable crypto boundaries", async () => {
    const native = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
    Object.defineProperty(Uint8Array, "fromBase64", {
      configurable: true,
      value: (input: string) => Uint8Array.of(input.length),
    });
    expect(fromBase64("Zg==")).toEqual(Uint8Array.of(4));
    Object.defineProperty(Uint8Array, "fromBase64", {
      configurable: true,
      value: () => {
        throw Error("native decode failure");
      },
    });
    expect(() => fromBase64("Zg==")).toThrow("invalid_envelope");
    if (native) Object.defineProperty(Uint8Array, "fromBase64", native);
    else Reflect.deleteProperty(Uint8Array, "fromBase64");

    const bytes = Object.assign(Uint8Array.of(1), { toBase64: () => "AQ==" });
    expect(toBase64(bytes)).toBe("AQ==");
    expect(() => fromBase64(null as never)).toThrow("too_large");

    const cryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "crypto",
    );
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    await expect(
      decryptAes(nistGcmEnvelope, { rawKeyHex: "00".repeat(16) }),
    ).rejects.toThrow("unsupported");
    if (cryptoDescriptor)
      Object.defineProperty(globalThis, "crypto", cryptoDescriptor);

    const randomValues = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(() => {
        throw Error("entropy unavailable");
      });
    await expect(encryptAes("x", aesDefaults)).rejects.toThrow(
      "random_unavailable",
    );
    randomValues.mockRestore();
  });

  it("rejects unsupported envelope shapes, missing key material, and invalid option variants", async () => {
    const valid = await encryptAes("x", {
      ...aesDefaults,
      keySource: "raw",
      rawKeyHex: "ab".repeat(32),
    });
    for (const envelope of [
      { ...valid.envelope, ciphertext: "" },
      {
        ...valid.envelope,
        algorithm: "AES-CBC",
        iv: "00".repeat(16),
        ciphertext: "",
      },
      {
        ...valid.envelope,
        algorithm: "AES-CBC",
        iv: "00".repeat(16),
        ciphertext: toBase64(new Uint8Array(15)),
      },
    ])
      expect(() => inspectEnvelope(JSON.stringify(envelope))).toThrow(
        "invalid_envelope",
      );
    await expect(decryptAes(valid.json, {})).rejects.toThrow("invalid_key");
    await expect(
      encryptAes("x", { ...aesDefaults, mode: "ECB" as never }),
    ).rejects.toThrow("invalid_options");
    await expect(
      encryptAes("x", { ...aesDefaults, keyLengthBits: 64 as never }),
    ).rejects.toThrow("invalid_options");
    await expect(
      encryptAes("x", { ...aesDefaults, keySource: "pem" as never }),
    ).rejects.toThrow("invalid_options");
    await expect(
      encryptAes("x", { ...aesDefaults, pbkdf2Hash: "SHA-1" as never }),
    ).rejects.toThrow("invalid_options");
    await expect(
      encryptAes("x", { ...aesDefaults, password: "" }),
    ).rejects.toThrow("invalid_key");
    await expect(
      encryptAes("x", { ...aesDefaults, password: "p".repeat(1048577) }),
    ).rejects.toThrow("too_large");
  });

  it("validates runtime input and file metadata before encryption", async () => {
    for (const input of [null, 123, {}, new ArrayBuffer(1)])
      await expect(encryptAes(input as never, aesDefaults)).rejects.toThrow(
        "invalid_input",
      );
    const options = {
      ...aesDefaults,
      keySource: "raw" as const,
      rawKeyHex: "ab".repeat(32),
    };
    for (const metadata of [
      { type: "unknown" },
      {
        type: "file",
        name: "data.bin",
        mimeType: "application/octet-stream",
        size: 2,
      },
      {
        type: "file",
        name: "data.bin",
        mimeType: "application/octet-stream",
        size: -1,
      },
    ])
      await expect(
        encryptAes(Uint8Array.of(1), options, metadata as never),
      ).rejects.toThrow("invalid_options");
  });

  it("limits envelope UTF-8 bytes independently of JavaScript string length", () => {
    const oversized = "中".repeat(Math.floor(MAX_AES_ENVELOPE / 3) + 1);
    expect(oversized.length).toBeLessThan(MAX_AES_ENVELOPE);
    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(
      MAX_AES_ENVELOPE,
    );
    expect(() => inspectEnvelope(oversized)).toThrow("too_large");
  });

  it("keeps invalid UTF-8 bytes, detects changed file size, and applies bounded size limits", async () => {
    const encrypted = await encryptAes(
      new Uint8Array([255]),
      {
        ...aesDefaults,
        mode: "CTR",
        keySource: "raw",
        rawKeyHex: "ab".repeat(32),
      },
      { type: "text" },
    );
    expect(
      (await decryptAes(encrypted.json, { rawKeyHex: "ab".repeat(32) })).text,
    ).toBeNull();
    const file = await encryptAes(
      new Uint8Array([1, 2, 3]),
      {
        ...aesDefaults,
        keySource: "raw",
        rawKeyHex: "ab".repeat(32),
      },
      {
        type: "file",
        name: "data.bin",
        mimeType: "application/octet-stream",
        size: 3,
      },
    );
    expect(
      (
        await decryptAes(
          JSON.stringify({
            ...file.envelope,
            plaintext: {
              type: "file",
              name: "changed.bin",
              mimeType: "application/octet-stream",
              size: 4,
            },
          }),
          { rawKeyHex: "ab".repeat(32) },
        )
      ).sizeMatches,
    ).toBe(false);
    await expect(
      encryptAes(new Uint8Array(MAX_AES_BYTES + 1), aesDefaults),
    ).rejects.toThrow("too_large");
    await expect(
      encryptAes("中".repeat(Math.floor(MAX_AES_BYTES / 3) + 1), aesDefaults),
    ).rejects.toThrow("too_large");
    expect(() => fromBase64("A".repeat(64), 1)).toThrow("too_large");
    expect(() => inspectEnvelope(" ".repeat(MAX_AES_ENVELOPE + 1))).toThrow(
      "too_large",
    );
  });
});

it.each(["CTR", "CBC"] as const)(
  "rejects native %s plaintext exceeding the limit despite fitting the ciphertext allowance",
  async (mode) => {
    const key = new Uint8Array(16);
    const iv = new Uint8Array(16);
    const ciphertext = nativeCiphertext(
      mode,
      key,
      iv,
      new Uint8Array(MAX_AES_BYTES + 1),
    );
    const envelope = JSON.stringify({
      version: "inbrowser-aes-v1",
      algorithm: `AES-${mode}`,
      key: { source: "raw", lengthBits: 128 },
      iv: hex(iv),
      ciphertext: ciphertext.toString("base64"),
      encoding: "base64",
      plaintext: { type: "text" },
    });
    const outcome = await decryptAes(envelope, { rawKeyHex: hex(key) }).then(
      (result) => ({ bytes: result.bytes.length }),
      (error) => ({ code: error.code }),
    );
    expect(outcome).toEqual({ code: "too_large" });
  },
);
