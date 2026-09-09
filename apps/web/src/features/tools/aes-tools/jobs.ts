import {
  encryptAes,
  decryptAes,
  inspectEnvelope,
  type EncryptOptions,
  type Envelope,
  type AesMaterial,
} from "@workspace/tools/crypto/aes";
export type AesJob =
  | {
      kind: "encrypt";
      input: string | Uint8Array;
      options: EncryptOptions;
      metadata?: Envelope["plaintext"];
    }
  | { kind: "decrypt"; input: string; material: AesMaterial }
  | { kind: "inspect"; input: string };
export async function runAesJob(job: AesJob) {
  if (job.kind === "encrypt") {
    const { envelope, json, bytes, outputBytes } = await encryptAes(
      job.input,
      job.options,
      job.metadata,
    );
    return {
      kind: "encrypted" as const,
      json,
      bytes,
      outputBytes,
      algorithm: envelope.algorithm,
      key: envelope.key,
      metadata: envelope.plaintext,
    };
  }
  if (job.kind === "decrypt") return decryptAes(job.input, job.material);
  const { envelope, ciphertext } = inspectEnvelope(job.input);
  return {
    kind: "inspected" as const,
    algorithm: envelope.algorithm,
    key: envelope.key,
    metadata: envelope.plaintext,
    cipherBytes: ciphertext.length,
  };
}
export type AesResult = Awaited<ReturnType<typeof runAesJob>>;

export function aesDownloadName(name: string) {
  return (
    name
      .split(/[\\/]/)
      .pop()
      ?.split("")
      .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? "_" : c))
      .join("")
      .slice(0, 200) || "decrypted.bin"
  );
}
