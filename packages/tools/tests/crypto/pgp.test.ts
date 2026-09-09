import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as openpgp from "openpgp";
import { expect, it } from "vitest";
import { generatePgp } from "../../src/crypto/pgp";
import type { PgpOptions } from "../../src/crypto/pgp-contract";

const base: PgpOptions = {
  name: "ToolTab Test",
  email: "test@example.com",
  comment: "synthetic identity",
  passphrase: "",
  algorithm: "ecc",
  rsaSize: 4096,
  expirationDays: 0,
};
function command(file: string, args: string[], input = "") {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { maxBuffer: 1048576 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`Interop command failed: ${stderr}`));
        else resolve({ stdout, stderr });
      },
    );
    child.stdin?.end(input);
  });
}
it("all algorithms interoperate with isolated GnuPG: protected import/decryption, signatures, expiry and revocation", async () => {
  for (const variant of [
    { algorithm: "ecc", rsaSize: 4096 },
    { algorithm: "rsa", rsaSize: 2048 },
    { algorithm: "rsa", rsaSize: 3072 },
    { algorithm: "rsa", rsaSize: 4096 },
  ] as const) {
    const dir = await mkdtemp(join(tmpdir(), "tooltab-pgp-"));
    const gpg = (args: string[], input = "") =>
      command(
        "gpg",
        [
          "--homedir",
          dir,
          "--batch",
          "--no-tty",
          "--no-auto-key-retrieve",
          "--auto-key-locate",
          "clear",
          "--pinentry-mode",
          "loopback",
          ...args,
        ],
        input,
      );
    try {
      await writeFile(
        join(dir, "gpg-agent.conf"),
        "default-cache-ttl 0\nmax-cache-ttl 0\nignore-cache-for-signing\nallow-loopback-pinentry\n",
      );
      const passphrase = "  synthetic test 口令  ",
        expiry = variant.algorithm === "ecc" ? 365 : 30;
      const pair = await generatePgp({
        ...base,
        ...variant,
        passphrase,
        expirationDays: expiry,
      });
      const publicPath = join(dir, "public.asc"),
        privatePath = join(dir, "private.asc"),
        revokePath = join(dir, "revoke.asc");
      await writeFile(publicPath, pair.publicKey);
      await writeFile(privatePath, pair.privateKey, { mode: 0o600 });
      await writeFile(revokePath, pair.revocationCertificate, { mode: 0o600 });
      await gpg(["--import", publicPath]);
      await gpg(
        ["--passphrase-fd", "0", "--import", privatePath],
        `${passphrase}\n`,
      );
      const info = (await gpg(["--with-colons", "--list-keys"])).stdout.split(
          "\n",
        ),
        pub = info.find((s) => s.startsWith("pub:"))?.split(":"),
        sub = info.find((s) => s.startsWith("sub:"))?.split(":");
      expect(
        info.some(
          (s) =>
            s.startsWith("fpr:") &&
            s.includes(pair.fingerprint.replace(/ /g, "")),
        ),
      ).toBe(true);
      expect(pub?.[3]).toBe(variant.algorithm === "ecc" ? "22" : "1");
      expect(sub?.[3]).toBe(variant.algorithm === "ecc" ? "18" : "1");
      expect(Number(pub?.[6]) - Number(pub?.[5])).toBe(expiry * 86400);
      const privateKey = await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({
          armoredKey: pair.privateKey,
        }),
        passphrase,
      });
      await expect(
        openpgp.decryptKey({
          privateKey: await openpgp.readPrivateKey({
            armoredKey: pair.privateKey,
          }),
          passphrase: passphrase.trim(),
        }),
      ).rejects.toThrow();
      const message = await openpgp.createMessage({
          text: "synthetic interoperability payload",
        }),
        ciphertext = await openpgp.encrypt({
          message,
          encryptionKeys: await openpgp.readKey({ armoredKey: pair.publicKey }),
          format: "armored",
        });
      const encryptedPath = join(dir, "encrypted.asc");
      await writeFile(encryptedPath, ciphertext);
      expect(
        (
          await gpg(
            ["--passphrase-fd", "0", "--decrypt", encryptedPath],
            `${passphrase}\n`,
          )
        ).stdout,
      ).toBe("synthetic interoperability payload");
      const signed = await openpgp.sign({
        message: await openpgp.createCleartextMessage({
          text: "synthetic signed payload",
        }),
        signingKeys: privateKey,
      });
      const signedPath = join(dir, "signed.asc");
      await writeFile(signedPath, signed);
      expect((await gpg(["--verify", signedPath])).stderr).toContain(
        "Good signature",
      );
      await gpg(["--import", revokePath]);
      expect((await gpg(["--with-colons", "--list-keys"])).stdout).toMatch(
        /pub:r:/,
      );
    } finally {
      await command("gpgconf", ["--homedir", dir, "--kill", "gpg-agent"]).catch(
        () => {},
      );
      await rm(dir, { recursive: true, force: true });
    }
  }
}, 60000);
it("unprotected/no-expiry output and input errors are explicit", async () => {
  const pair = await generatePgp(base);
  expect(pair.passphraseProtected).toBe(false);
  expect(pair.fingerprint).toMatch(/^[0-9A-F]{4}(?: [0-9A-F]{4}){9}$/);
  expect(
    (
      await openpgp.readPrivateKey({ armoredKey: pair.privateKey })
    ).isDecrypted(),
  ).toBe(true);
  expect(
    await (
      await openpgp.readKey({ armoredKey: pair.publicKey })
    ).getExpirationTime(),
  ).toBe(Infinity);
  await expect(generatePgp({ ...base, name: "", email: "" })).rejects.toThrow(
    "invalid_identity",
  );
  await expect(generatePgp({ ...base, expirationDays: 36501 })).rejects.toThrow(
    "invalid_options",
  );
  await expect(generatePgp({ ...base, passphrase: "\ud800" })).rejects.toThrow(
    "invalid_unicode",
  );
  await expect(generatePgp({ ...base, email: "not-an-email" })).rejects.toThrow(
    "invalid_identity",
  );
});
it("retains the full 36500-day option and explicitly reports GnuPG uint32 absolute-expiry wrap", async () => {
  const pair = await generatePgp({ ...base, expirationDays: 36500 });
  expect(pair.legacyExpiryOverflow).toBe(true);
  expect(Date.parse(pair.expiresAt ?? "") - Date.parse(pair.createdAt)).toBe(
    36500 * 86400000,
  );
  const dir = await mkdtemp(join(tmpdir(), "tooltab-pgp-expiry-"));
  try {
    const path = join(dir, "pub.asc");
    await writeFile(path, pair.publicKey);
    const result = await command("gpg", [
      "--homedir",
      dir,
      "--batch",
      "--no-auto-key-retrieve",
      "--auto-key-locate",
      "clear",
      "--with-colons",
      "--show-keys",
      path,
    ]);
    const pub = result.stdout
      .split("\n")
      .find((l) => l.startsWith("pub:"))
      ?.split(":");
    expect(Number(pub?.[6])).toBe(
      Math.floor(Date.parse(pair.expiresAt ?? "") / 1000) % 4294967296,
    );
  } finally {
    await command("gpgconf", ["--homedir", dir, "--kill", "gpg-agent"]).catch(
      () => {},
    );
    await rm(dir, { recursive: true, force: true });
  }
});
