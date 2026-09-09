import {
  arch,
  availableParallelism,
  cpus,
  freemem,
  platform,
  release,
  totalmem,
  type,
  uptime,
} from "node:os";
import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";

export const deviceInformationSchema = z.strictObject({});
const unavailable = z.strictObject({
  status: z.literal("unavailable"),
  reason: z.string(),
});
export const deviceInformationOutputSchema = z.strictObject({
  source: z.literal("service-runtime"),
  capturedAt: z.string(),
  runtime: z.strictObject({
    name: z.enum(["Bun", "Node.js"]),
    version: z.string(),
    pid: z.number().int().positive(),
  }),
  host: z.strictObject({
    operatingSystem: z.string(),
    platform: z.string(),
    release: z.string(),
    architecture: z.string(),
    logicalCpuCount: z.number().int().nonnegative(),
    cpuModel: z.string().nullable(),
    totalMemoryBytes: z.number().int().nonnegative(),
    freeMemoryBytes: z.number().int().nonnegative(),
    uptimeSeconds: z.number().nonnegative(),
  }),
  browserOnly: z.strictObject({
    browser: unavailable,
    display: unavailable,
    gpu: unavailable,
    browserStorage: unavailable,
    browserPermissions: unavailable,
  }),
  notice: z.string(),
});

const reason = "The deployed service cannot inspect an unrelated browser tab.";
export const deviceInformationOperation: Operation = {
  id: "device-information",
  name: "tooltab_device_information",
  description:
    "Return an actual snapshot of the deployed ToolTab service runtime and host. Browser, screen, GPU, origin storage and permission values are explicitly unavailable because a remote API or MCP server cannot inspect the caller's browser tab. No supplied browser identity is echoed or presented as independently observed data. No persistence.",
  inputSchema: deviceInformationSchema,
  outputSchema: deviceInformationOutputSchema,
  bodyLimit: 1000,
  idempotent: false,
  run(input, signal) {
    signal?.throwIfAborted();
    deviceInformationSchema.parse(input);
    const cpu = cpus();
    return {
      source: "service-runtime",
      capturedAt: new Date().toISOString(),
      runtime: {
        name: process.versions.bun ? "Bun" : "Node.js",
        version: process.versions.bun ?? process.version,
        pid: process.pid,
      },
      host: {
        operatingSystem: type(),
        platform: platform(),
        release: release(),
        architecture: arch(),
        logicalCpuCount: availableParallelism(),
        cpuModel: cpu[0]?.model ?? null,
        totalMemoryBytes: totalmem(),
        freeMemoryBytes: freemem(),
        uptimeSeconds: uptime(),
      },
      browserOnly: {
        browser: { status: "unavailable", reason },
        display: { status: "unavailable", reason },
        gpu: { status: "unavailable", reason },
        browserStorage: { status: "unavailable", reason },
        browserPermissions: { status: "unavailable", reason },
      },
      notice:
        "This report describes the deployed service process and host, not the calling user's device.",
    };
  },
};
