export type NetworkTimeBaseline = Readonly<{
  performanceStartMs: number;
  networkStartMs: number;
  roundTripTimeMs: number;
  offsetMs: number;
}>;

const TRACE_TIMESTAMP = /\bts=([0-9]+(?:\.[0-9]+)?)\b/u;

export function parseCloudflareTraceTimestamp(trace: string) {
  const match = TRACE_TIMESTAMP.exec(trace);
  if (!match) throw new Error("Failed to parse Cloudflare trace timestamp");
  const value = Number.parseFloat(match[1]) * 1000;
  if (!Number.isFinite(value))
    throw new Error("Failed to parse Cloudflare trace timestamp");
  return Math.round(value);
}

export function createNetworkBaseline({
  trace,
  startPerformanceMs,
  endPerformanceMs,
  localEpochMs,
}: {
  trace: string;
  startPerformanceMs: number;
  endPerformanceMs: number;
  localEpochMs: number;
}): NetworkTimeBaseline {
  const networkStartMs = parseCloudflareTraceTimestamp(trace);
  const roundTripTimeMs = endPerformanceMs - startPerformanceMs;
  if (!Number.isFinite(roundTripTimeMs) || roundTripTimeMs < 0)
    throw new Error("Invalid request timing");
  return {
    performanceStartMs: startPerformanceMs + roundTripTimeMs / 2,
    networkStartMs,
    roundTripTimeMs,
    offsetMs: networkStartMs - localEpochMs,
  };
}

export function readNetworkClockTime(
  baseline: NetworkTimeBaseline,
  currentPerformanceMs: number,
) {
  return (
    baseline.networkStartMs +
    (currentPerformanceMs - baseline.performanceStartMs)
  );
}
