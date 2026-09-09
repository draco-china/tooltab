import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
import {
  fingerprintSsh,
  generateSsh,
  joinBytes,
  MAX_SSH_INPUT,
  RSA_SIZES,
  type SshError,
  sshString,
} from "../../src/crypto/ssh";

const run = promisify(execFile);
const publicLine = (type: string, ...parts: Uint8Array[]) =>
  `${type} ${Buffer.from(joinBytes(sshString(type), ...parts)).toString("base64")}`;
it("generated Ed25519 private key imports in OpenSSH; SHA256 and MD5 match native ssh-keygen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tooltab-ssh-"));
  try {
    const key = await generateSsh({
      algorithm: "ed25519",
      comment: "  user\n device  ",
    });
    const path = join(dir, "id_ed25519");
    await writeFile(path, key.privateKey, { mode: 0o600 });
    await writeFile(`${path}.pub`, key.publicKey);
    const extracted = (
      await run("ssh-keygen", ["-y", "-f", path])
    ).stdout.trim();
    expect(extracted).toBe(key.publicKey);
    expect(key.comment).toBe("user device");
    const info = await fingerprintSsh(key.publicKey);
    expect(info.errors).toEqual([]);
    expect(info.results[0].sha256).toBe(key.fingerprintSha256);
    for (const kind of ["sha256", "md5"] as const) {
      const output = (
        await run("ssh-keygen", ["-lf", `${path}.pub`, "-E", kind])
      ).stdout;
      expect(output).toContain(info.results[0][kind]);
    }
    const rfc = (
      await run("ssh-keygen", ["-e", "-m", "RFC4716", "-f", `${path}.pub`])
    ).stdout;
    expect((await fingerprintSsh(rfc)).results[0].sha256).toBe(
      key.fingerprintSha256,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("authorized options honor quotes, comments remain literal, RFC4716 continuation and mixed errors survive", async () => {
  const key = await generateSsh({ algorithm: "ed25519" });
  const line = `command="echo hello",no-pty ${key.publicKey} unmatched " comment\\`;
  const body = key.publicKey.split(" ")[1];
  const rfc = `---- BEGIN SSH2 PUBLIC KEY ----\r\nComment: "continued\\\r\n comment"\r\nUnknown: ignored\r\n${body}\r\n---- END SSH2 PUBLIC KEY ----`;
  const result = await fingerprintSsh(`# ignored\n${line}\ninvalid\n${rfc}`);
  expect(result.results).toHaveLength(2);
  expect(result.errors).toEqual([{ line: 3, code: "invalid_line" }]);
  expect(result.results[0].comment).toBe('unmatched " comment\\');
  expect(result.results[1].comment).toBe("continued comment");
  expect(result.results[1].sha256).toBe(key.fingerprintSha256);
});
it("rejects mismatch, malformed base64, truncated fields and recognized trailing data; unknown formats are explicit", async () => {
  const ed = publicLine("ssh-ed25519", sshString(new Uint8Array(32)));
  for (const input of [
    ed.replace("ssh-ed25519 ", "ssh-rsa "),
    ed.replace(/.$/, "!"),
    publicLine("ssh-ed25519", sshString(new Uint8Array(31))),
    publicLine(
      "ssh-ed25519",
      sshString(new Uint8Array(32)),
      new Uint8Array([1]),
    ),
  ])
    expect((await fingerprintSsh(input)).errors).toHaveLength(1);
  const unknown = publicLine("ssh-example", sshString("data"));
  expect((await fingerprintSsh(unknown)).results[0].detailsChecked).toBe(false);
  const cert = publicLine(
    "ecdsa-sha2-nistp256-cert-v01@openssh.com",
    sshString("data"),
  );
  expect((await fingerprintSsh(cert)).results[0].detailsChecked).toBe(false);
  const sk = publicLine(
    "sk-ssh-ed25519@openssh.com",
    sshString(new Uint8Array(32)),
    sshString("ssh:"),
  );
  expect((await fingerprintSsh(sk)).results[0]).toMatchObject({
    bits: 256,
    curve: "ed25519",
    detailsChecked: true,
  });
  await expect(fingerprintSsh("\ud800")).rejects.toThrow("invalid_unicode");
  await expect(
    generateSsh({ algorithm: "ed25519", comment: "a\0b" }),
  ).rejects.toThrow("invalid_comment");
});
it("all supported RSA lengths produce OpenSSH-readable private/public pairs and native fingerprints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tooltab-ssh-rsa-"));
  try {
    for (const rsaSize of [2048, 3072, 4096] as const) {
      const key = await generateSsh({
        algorithm: "rsa",
        rsaSize,
        comment: "interop",
      });
      const path = join(dir, `rsa${rsaSize}`);
      await writeFile(path, key.privateKey, { mode: 0o600 });
      await writeFile(`${path}.pub`, key.publicKey);
      expect((await run("ssh-keygen", ["-y", "-f", path])).stdout.trim()).toBe(
        key.publicKey,
      );
      const output = (await run("ssh-keygen", ["-lf", `${path}.pub`])).stdout;
      expect(output).toContain(key.fingerprintSha256);
      expect(output.startsWith(`${rsaSize} `)).toBe(true);
      expect((await fingerprintSsh(key.publicKey)).results[0].bits).toBe(
        rsaSize,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
it("native ECDSA key curve and MD5 are decoded correctly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tooltab-ssh-ec-"));
  try {
    const path = join(dir, "ec");
    await run("ssh-keygen", [
      "-t",
      "ecdsa",
      "-b",
      "384",
      "-N",
      "",
      "-f",
      path,
      "-q",
    ]);
    const { readFile } = await import("node:fs/promises");
    const result = await fingerprintSsh(await readFile(`${path}.pub`, "utf8"));
    expect(result.results[0]).toMatchObject({
      bits: 384,
      curve: "nistp384",
      detailsChecked: true,
    });
    expect(
      (await run("ssh-keygen", ["-lf", `${path}.pub`, "-E", "md5"])).stdout,
    ).toContain(result.results[0].md5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("bounds malformed entry amplification and UTF8 bytes while retaining valid Unicode comments", async () => {
  await expect(fingerprintSsh("bad\n".repeat(10001))).rejects.toThrow(
    "too_many_keys",
  );
  await expect(fingerprintSsh("😀".repeat(2097153))).rejects.toThrow(
    "too_large",
  );
  const key = await generateSsh({ algorithm: "ed25519", comment: "密钥 🔑" });
  expect((await fingerprintSsh(key.publicKey)).results[0].comment).toBe(
    "密钥 🔑",
  );
});
it("accepts the comment and size boundaries while preserving typed failures", async () => {
  const key = await generateSsh({ algorithm: "ed25519", comment: "" });
  expect(key.publicKey.split(" ")).toHaveLength(2);
  expect(await fingerprintSsh("\n# comment\n")).toEqual({
    results: [],
    errors: [],
  });
  expect(RSA_SIZES).toEqual([2048, 3072, 4096]);
  expect(MAX_SSH_INPUT).toBe(8 * 1024 * 1024);
  await expect(
    generateSsh({ algorithm: "ed25519", comment: "x".repeat(4097) }),
  ).rejects.toMatchObject({ code: "too_large" } satisfies Partial<SshError>);
  await expect(
    generateSsh({ algorithm: "rsa", rsaSize: 1024 as never }),
  ).rejects.toMatchObject({ code: "invalid_size" } satisfies Partial<SshError>);
  await expect(
    generateSsh({ algorithm: "dsa" as never }),
  ).rejects.toMatchObject({
    code: "invalid_algorithm",
  } satisfies Partial<SshError>);
});

it("validates all supported public-key field families and malformed boundaries", async () => {
  const dss = publicLine(
    "ssh-dss",
    sshString(new Uint8Array([1])),
    sshString(new Uint8Array([1])),
    sshString(new Uint8Array([1])),
    sshString(new Uint8Array([1])),
  );
  expect((await fingerprintSsh(dss)).results[0]).toMatchObject({
    bits: 1,
    detailsChecked: true,
  });

  const compressedPoint = joinBytes(new Uint8Array([2]), new Uint8Array(32));
  const skEcdsa = publicLine(
    "sk-ecdsa-sha2-nistp256@openssh.com",
    sshString("nistp256"),
    sshString(compressedPoint),
    sshString("ssh:"),
  );
  expect((await fingerprintSsh(skEcdsa)).results[0]).toMatchObject({
    bits: 256,
    curve: "nistp256",
    detailsChecked: true,
  });

  const malformed = [
    publicLine("ssh-ed25519"),
    `${"ssh-ed25519"} ${Buffer.from(
      joinBytes(sshString("ssh-ed25519"), new Uint8Array([0, 0, 0, 33])),
    ).toString("base64")}`,
    publicLine("ssh-rsa", sshString(new Uint8Array())),
    publicLine(
      "ecdsa-sha2-nistp256",
      sshString("not-a-curve"),
      sshString(compressedPoint),
    ),
    publicLine(
      "ecdsa-sha2-nistp256",
      sshString("nistp256"),
      sshString(new Uint8Array([4])),
    ),
    publicLine("ssh-example"),
  ];
  for (const input of malformed)
    expect((await fingerprintSsh(input)).errors).toEqual([
      { line: 1, code: "invalid_blob" },
    ]);
});

it("keeps parser recovery boundaries explicit for unterminated public-key records", async () => {
  const key = await generateSsh({ algorithm: "ed25519" });
  const parsed = await fingerprintSsh(
    `command="echo\\ hi" ${key.publicKey}\ncommand="unterminated ${key.publicKey}\n---- BEGIN SSH2 PUBLIC KEY ----\n${key.publicKey.split(" ")[1]}`,
  );
  expect(parsed.results).toHaveLength(1);
  expect(parsed.errors).toEqual([
    { line: 2, code: "invalid_line" },
    { line: 3, code: "invalid_line" },
  ]);
});

it("uses the default RSA size and retains authorized-key and RFC header fallbacks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tooltab-ssh-default-rsa-"));
  try {
    const key = await generateSsh({ algorithm: "rsa" });
    const path = join(dir, "id_rsa");
    await writeFile(path, key.privateKey, { mode: 0o600 });
    expect(key.bits).toBe(4096);
    expect((await run("ssh-keygen", ["-y", "-f", path])).stdout.trim()).toBe(
      key.publicKey,
    );

    const [type, body] = key.publicKey.split(" ");
    const [, unknownBody] = publicLine("ssh-example", sshString("data")).split(
      " ",
    );
    const prefixedUnknown = `permitopen="host:22" ssh-example ${unknownBody}`;
    const parsed = await fingerprintSsh(
      `${prefixedUnknown}\nnot-a-key\n---- BEGIN SSH2 PUBLIC KEY ----\nComment: "not closed"\n${body}\n---- END SSH2 PUBLIC KEY ----\n---- BEGIN SSH2 PUBLIC KEY ----\nComment: ends-with-backslash\\`,
    );
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toMatchObject({ keyType: "ssh-example" });
    expect(parsed.results[1].comment).toBe("not closed");
    expect(parsed.errors).toEqual([
      { line: 2, code: "invalid_line" },
      { line: 7, code: "invalid_line" },
    ]);
    expect(type).toBe("ssh-rsa");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);

it("rejects incomplete RSA exports from the crypto runtime instead of returning a partial key", async () => {
  const exportKey = crypto.subtle.exportKey.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "exportKey");
  spy.mockImplementationOnce(async (format, key) => {
    expect(format).toBe("jwk");
    const jwk = await exportKey("jwk", key);
    delete jwk.n;
    return jwk;
  });
  try {
    await expect(
      generateSsh({ algorithm: "rsa", rsaSize: 2048 }),
    ).rejects.toMatchObject({ code: "generation_failed" });
    expect(spy).toHaveBeenCalledOnce();
  } finally {
    spy.mockRestore();
  }
  const retry = await generateSsh({ algorithm: "rsa", rsaSize: 2048 });
  expect((await fingerprintSsh(retry.publicKey)).results[0]).toMatchObject({
    bits: 2048,
    keyType: "ssh-rsa",
  });
});

it("recovers after records containing only escapes or incomplete quoted options", async () => {
  const key = await generateSsh({ algorithm: "ed25519" });
  const result = await fingerprintSsh(`\\\n"\n${key.publicKey}`);
  expect(result.errors).toEqual([
    { line: 1, code: "invalid_line" },
    { line: 2, code: "invalid_line" },
  ]);
  expect(result.results).toHaveLength(1);
  expect(result.results[0]).toMatchObject({
    line: 3,
    sha256: key.fingerprintSha256,
  });
});

it("accepts repeated whitespace between authorized-key options and key fields", async () => {
  const key = await generateSsh({
    algorithm: "ed25519",
    comment: "spaced key",
  });
  const [type, body] = key.publicKey.split(" ");
  const result = await fingerprintSsh(
    `  no-port-forwarding   ${type}\t  ${body}   spaced key  `,
  );
  expect(result.errors).toEqual([]);
  expect(result.results[0]).toMatchObject({
    comment: "spaced key",
    sha256: key.fingerprintSha256,
  });
});

it("normalizes leading-zero RSA export integers into OpenSSH-readable keys", async () => {
  const exportKey = crypto.subtle.exportKey.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "exportKey");
  spy.mockImplementationOnce(async (format, key) => {
    expect(format).toBe("jwk");
    const jwk = await exportKey("jwk", key);
    for (const field of ["n", "e", "d", "qi", "p", "q"] as const) {
      const value = jwk[field];
      if (!value) throw new Error("Native RSA export missing an integer");
      jwk[field] = Buffer.concat([
        Buffer.from([0, 0]),
        Buffer.from(value, "base64url"),
      ]).toString("base64url");
    }
    return jwk;
  });
  const directory = await mkdtemp(join(tmpdir(), "tooltab-ssh-leading-zero-"));
  try {
    const key = await generateSsh({ algorithm: "rsa", rsaSize: 2048 });
    const path = join(directory, "id_rsa");
    await writeFile(path, key.privateKey, { mode: 0o600 });
    expect((await run("ssh-keygen", ["-y", "-f", path])).stdout.trim()).toBe(
      key.publicKey,
    );
    expect((await fingerprintSsh(key.publicKey)).results[0]).toMatchObject({
      bits: 2048,
      sha256: key.fingerprintSha256,
    });
  } finally {
    spy.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
