import * as z from "zod/v4";
import {
  createNetworkBaseline,
  readNetworkClockTime,
} from "@workspace/tools/time/network-clock";
import type { Operation } from "./operation-contract";

const TRACE_URL = "https://cloudflare.com/cdn-cgi/trace";
export const currentNetworkTimeInputSchema = z.strictObject({});
export const currentNetworkTimeOutputSchema = z.strictObject({
  source: z.literal("cloudflare-trace"),
  networkTime: z.string().datetime(),
  localTime: z.string().datetime(),
  offsetMs: z.number().finite(),
  roundTripTimeMs: z.number().finite().nonnegative(),
  uncertaintyMs: z.number().finite().nonnegative(),
  endpoint: z.literal(TRACE_URL),
});

export class CurrentNetworkTimeError extends Error {
  readonly code = "network_time_unavailable";
}

export async function readCurrentNetworkTime(
  value: unknown,
  signal?: AbortSignal,
) {
  currentNetworkTimeInputSchema.parse(value);
  const timeout = AbortSignal.timeout(5000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const start = performance.now();
    const response = await fetch(TRACE_URL, {
      cache: "no-store",
      headers: { Accept: "text/plain" },
      signal: combined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const trace = await response.text();
    if (trace.length > 64 * 1024)
      throw new Error("Trace response is too large");
    const end = performance.now();
    const localEpochMs = Date.now();
    const baseline = createNetworkBaseline({
      trace,
      startPerformanceMs: start,
      endPerformanceMs: end,
      localEpochMs,
    });
    const networkEpochMs = readNetworkClockTime(baseline, end);
    return {
      source: "cloudflare-trace" as const,
      networkTime: new Date(networkEpochMs).toISOString(),
      localTime: new Date(localEpochMs).toISOString(),
      offsetMs: baseline.offsetMs,
      roundTripTimeMs: baseline.roundTripTimeMs,
      uncertaintyMs: baseline.roundTripTimeMs / 2,
      endpoint: TRACE_URL,
    };
  } catch (cause) {
    if (signal?.aborted) throw signal.reason;
    throw new CurrentNetworkTimeError(
      cause instanceof Error ? cause.message : "Network time unavailable",
    );
  }
}

export const currentNetworkTimeOperation: Operation = {
  id: "current-network-time",
  name: "tooltab_current_network_time",
  description:
    "Read the current timestamp from Cloudflare's fixed trace endpoint and estimate network time at the request midpoint. Returns the deployed service clock comparison, round-trip latency and uncertainty. This is a network estimate, not NTP and not the caller device clock.",
  inputSchema: currentNetworkTimeInputSchema,
  outputSchema: currentNetworkTimeOutputSchema,
  bodyLimit: 1000,
  idempotent: false,
  run: readCurrentNetworkTime,
};
