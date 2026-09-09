import { expect, it } from "vitest";
import {
  createNetworkBaseline,
  parseCloudflareTraceTimestamp,
  readNetworkClockTime,
} from "../../src/time/network-clock";

it("parses integer and fractional trace timestamps and rounds milliseconds", () => {
  expect(parseCloudflareTraceTimestamp("ts=100.5\n")).toBe(100500);
  expect(
    parseCloudflareTraceTimestamp("ip=127.0.0.1\nts=1700000000.1236\n"),
  ).toBe(1700000000124);
  expect(parseCloudflareTraceTimestamp("ts=0\n")).toBe(0);
  for (const trace of ["", "ts=nope", "timestamp=10", "ts="]) {
    expect(() => parseCloudflareTraceTimestamp(trace)).toThrow(
      "Failed to parse Cloudflare trace timestamp",
    );
  }
  expect(() => parseCloudflareTraceTimestamp(`ts=${"9".repeat(400)}`)).toThrow(
    "Failed to parse Cloudflare trace timestamp",
  );
});

it("anchors the clock at the request midpoint and advances using monotonic time", () => {
  const baseline = createNetworkBaseline({
    trace: "ts=100.5",
    startPerformanceMs: 10,
    endPerformanceMs: 50,
    localEpochMs: 100000,
  });
  expect(baseline).toEqual({
    performanceStartMs: 30,
    networkStartMs: 100500,
    roundTripTimeMs: 40,
    offsetMs: 500,
  });
  expect(readNetworkClockTime(baseline, 30)).toBe(100500);
  expect(readNetworkClockTime(baseline, 50)).toBe(100520);
  expect(readNetworkClockTime(baseline, 1030)).toBe(101500);
  expect(
    createNetworkBaseline({
      trace: "ts=0",
      startPerformanceMs: 0,
      endPerformanceMs: 0,
      localEpochMs: 100,
    }),
  ).toEqual({
    performanceStartMs: 0,
    networkStartMs: 0,
    roundTripTimeMs: 0,
    offsetMs: -100,
  });
});

it("rejects negative and non-finite request durations", () => {
  for (const [startPerformanceMs, endPerformanceMs] of [
    [10, 9],
    [0, Infinity],
    [NaN, 10],
  ]) {
    expect(() =>
      createNetworkBaseline({
        trace: "ts=1",
        startPerformanceMs,
        endPerformanceMs,
        localEpochMs: 0,
      }),
    ).toThrow("Invalid request timing");
  }
});
