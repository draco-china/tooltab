import { scanInvisible } from "@workspace/tools/text/invisible";
import { generateLorem, type LoremOptions } from "@workspace/tools/text/lorem";
import { convertMorse, createMorseWav } from "@workspace/tools/text/morse";

export {
  MAX_UTILITY_INPUT,
  MAX_UTILITY_OUTPUT,
  TextUtilityError,
} from "@workspace/tools/text/shared";
export type UtilityJob =
  | { kind: "invisible"; input: string; categories?: string[] }
  | { kind: "morse"; input: string; mode: "encode" | "decode" }
  | { kind: "audio"; input: string }
  | ({ kind: "lorem" } & LoremOptions);
export async function runUtility(job: UtilityJob) {
  switch (job.kind) {
    case "invisible":
      return scanInvisible(job.input, job.categories);
    case "morse":
      return convertMorse(job.input, job.mode);
    case "audio":
      return { kind: "audio" as const, ...createMorseWav(job.input) };
    case "lorem":
      return generateLorem(job);
  }
}
export type UtilityResult = Awaited<ReturnType<typeof runUtility>>;
export function utilityFiles(
  result: Exclude<UtilityResult, { kind: "audio" }>,
) {
  if (result.kind === "invisible")
    return [
      { filename: "cleaned.txt", text: result.cleanedText },
      { filename: "annotated.txt", text: result.annotatedText },
      { filename: "findings.tsv", text: result.findingsTsv },
    ];
  if (result.kind === "morse")
    return [
      { filename: "morse.txt", text: result.morse },
      { filename: "decoded.txt", text: result.text },
      { filename: "unsupported.txt", text: result.unsupported.join("\n") },
    ];
  return [{ filename: "lorem.txt", text: result.output }];
}
