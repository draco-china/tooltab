import { cleanImage } from "@workspace/tools/image/metadata-containers";
import { inspectImage } from "@workspace/tools/image/metadata";
export type ImageMetadataJob = { kind: "inspect" | "clean"; bytes: Uint8Array };
export async function runImageMetadataJob(job: ImageMetadataJob) {
  return job.kind === "clean" ? cleanImage(job.bytes) : inspectImage(job.bytes);
}
export type ImageMetadataResult = Awaited<
  ReturnType<typeof runImageMetadataJob>
>;
