import {
  type GeneratorOptions,
  generatePassword,
} from "@workspace/tools/password/generator";
import { checkPassword } from "@workspace/tools/password/strength";

export { PasswordToolError } from "@workspace/tools/password/generator";
export type PasswordJob =
  | { kind: "generate"; options: GeneratorOptions }
  | { kind: "check"; password: string; locale: "en-US" | "zh-CN" };
export async function runPasswordJob(job: PasswordJob) {
  return job.kind === "generate"
    ? generatePassword(job.options)
    : checkPassword(job.password, job.locale);
}
export type PasswordResult = Awaited<ReturnType<typeof runPasswordJob>>;
