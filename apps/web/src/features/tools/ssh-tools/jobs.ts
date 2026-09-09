import {
  fingerprintSsh,
  type GenerateOptions,
  generateSsh,
} from "@workspace/tools/crypto/ssh";
export type SshJob =
  | { mode: "generate"; options: GenerateOptions }
  | { mode: "fingerprint"; input: string };
export type SshResult =
  | Awaited<ReturnType<typeof generateSsh>>
  | Awaited<ReturnType<typeof fingerprintSsh>>;
export function executeSsh(job: SshJob): Promise<SshResult> {
  return job.mode === "generate"
    ? generateSsh(job.options)
    : fingerprintSsh(job.input);
}
