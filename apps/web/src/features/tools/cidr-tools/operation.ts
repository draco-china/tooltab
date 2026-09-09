import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import { startCidrWorker } from "../../api/runtime/cidr-tools-worker-client";
import type { WebpContext } from "../../api/runtime/image-webp";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  CidrError,
  MAX_CIDR_TEXT,
  normalizeIpCidr,
  parseCidr,
  rangeToCidrs,
} from "@workspace/tools/network/cidr";

const input = z.strictObject({ input: z.string().max(110) }),
  range = z.strictObject({
    start: z.string().max(100),
    end: z.string().max(100),
  });
export const cidrMergeSchema = z
  .strictObject({
    merge: z.string().max(MAX_CIDR_TEXT).optional(),
    mergeUploadId: z.string().min(1).optional(),
    exclude: z.string().max(MAX_CIDR_TEXT).optional(),
    excludeUploadId: z.string().min(1).optional(),
  })
  .refine(
    (p) =>
      (p.merge !== undefined) !== (p.mergeUploadId !== undefined) &&
      !(p.exclude !== undefined && p.excludeUploadId !== undefined),
  );
const summary = z.strictObject({
  mergeInputCount: z.number(),
  excludeInputCount: z.number(),
  familyLabels: z.array(z.string()),
  addressCount: z.string(),
  blockCount: z.number(),
});
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
async function source(
  text: string | undefined,
  id: string | undefined,
  context: WebpContext | undefined,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (text !== undefined) return text;
  if (!id) return "";
  if (!context) throw new CidrError("unsupported");
  const record = await context.artifacts.get(id, "upload");
  if (record.bytes > MAX_CIDR_TEXT) throw new CidrError("too_large");
  const bytes = await readFile(record.path, { signal });
  if (bytes.length > MAX_CIDR_TEXT) throw new CidrError("too_large");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CidrError("invalid_list");
  }
}
export async function runCidrMerge(
  value: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  const p = cidrMergeSchema.parse(value),
    merge = await source(p.merge, p.mergeUploadId, context, signal),
    exclude = await source(p.exclude, p.excludeUploadId, context, signal);
  const worker = startCidrWorker(signal);
  const saved: string[] = [];
  try {
    const ready = await worker.request<{
      inline?: Record<string, unknown>;
      summary?: unknown;
    }>({ merge, exclude });
    if (ready.inline) return ready.inline;
    if (!context) throw new CidrError("unsupported");
    let done = false;
    const artifacts = [];
    while (!done) {
      async function* chunks() {
        let size = 0;
        while (size < 256 * 1024 * 1024 && !done) {
          signal?.throwIfAborted();
          const next = await worker.request<{
            data: Uint8Array;
            done: boolean;
          }>({ pull: true });
          done = next.done;
          size += next.data.length;
          if (next.data.length) yield next.data;
        }
      }
      const record = await context.artifacts.write(
        chunks(),
        {
          limit: 512 * 1024 * 1024,
          mimeType: "text/plain;charset=utf-8",
          filename: `cidrs-${artifacts.length + 1}.txt`,
        },
        signal,
      );
      saved.push(record.id);
      signal?.throwIfAborted();
      const { id, bytes, mimeType, filename, expiresAt } = record;
      artifacts.push({
        id,
        bytes,
        mimeType,
        filename,
        expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${id}` }),
      });
    }
    return { mode: "artifacts", summary: ready.summary, artifacts };
  } catch (e) {
    if (context)
      await Promise.allSettled(saved.map((id) => context.artifacts.remove(id)));
    throw e;
  } finally {
    worker.close();
  }
}

const details = z.strictObject({
  family: z.union([z.literal(4), z.literal(6)]),
  prefix: z.number(),
  hostBits: z.number(),
  inputAddress: z.string(),
  canonicalCidr: z.string(),
  networkAddress: z.string(),
  rangeStart: z.string(),
  rangeEnd: z.string(),
  firstUsable: z.string(),
  lastUsable: z.string(),
  broadcastAddress: z.string().nullable(),
  netmask: z.string().nullable(),
  wildcardMask: z.string().nullable(),
  addressCount: z.string(),
  usableAddressCount: z.string(),
  startInteger: z.string(),
  endInteger: z.string(),
});
export const cidrToolOperations: Operation[] = [
  {
    id: "cidr-parser",
    name: "tooltab_cidr_parser",
    description:
      "Inspect IPv4/IPv6 network, range, integer boundaries and exact address counts. Host bits are normalized. IPv4 /31 and /32 count all addresses as usable.",
    inputSchema: input,
    outputSchema: details,
    bodyLimit: 10000,
    idempotent: true,
    run(v) {
      return parseCidr(input.parse(v).input);
    },
  },
  {
    id: "ip-cidr-normalizer",
    name: "tooltab_ip_cidr_normalizer",
    description:
      "Canonicalize IPv4/IPv6 addresses or CIDRs. Leading-zero IPv4 octets are decimal. Host bits are cleared for CIDRs; zones are rejected.",
    inputSchema: input,
    outputSchema: z.strictObject({ output: z.string() }),
    bodyLimit: 10000,
    idempotent: true,
    run(v) {
      return { output: normalizeIpCidr(input.parse(v).input) };
    },
  },
  {
    id: "ip-range-to-cidr-converter",
    name: "tooltab_ip_range_to_cidr_converter",
    description:
      "Return the minimal IPv4 or IPv6 CIDR cover for an inclusive same-family range without enumerating addresses.",
    inputSchema: range,
    outputSchema: z.strictObject({
      family: z.union([z.literal(4), z.literal(6)]),
      start: z.string(),
      end: z.string(),
      addressCount: z.string(),
      cidrs: z.array(z.string()),
      blockCount: z.number(),
    }),
    bodyLimit: 10000,
    idempotent: true,
    run(v) {
      const p = range.parse(v);
      return rangeToCidrs(p.start, p.end);
    },
  },
  {
    id: "cidrs-merger-excluder",
    name: "tooltab_cidrs_merger_excluder",
    description:
      "Merge CIDR lists and subtract exclusions using exact intervals. Mixed families processed independently. Whitespace/comma separators, strict line errors. Large full results become authenticated TXT artifacts; uploads avoid large JSON.",
    inputSchema: cidrMergeSchema,
    outputSchema: z.union([
      summary.extend({ cidrs: z.array(z.string()) }),
      z.strictObject({
        mode: z.literal("artifacts"),
        summary,
        artifacts: z.array(artifact),
      }),
    ]),
    bodyLimit: 120100000,
    idempotent: false,
    run: runCidrMerge,
  },
];
