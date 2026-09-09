import * as z from "zod/v4";
import type { Operation } from "./operation-contract";
import {
  elapsed,
  emptyStopwatch,
  formatElapsed,
  LAP_LIMIT,
  lapCsv,
  lapRows,
  transition,
} from "@workspace/tools/time/stopwatch";

const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stateSchema = z.strictObject({
  running: z.boolean(),
  startedAt: ms,
  accumulatedMs: ms,
  laps: z.array(ms).max(LAP_LIMIT),
});
export const stopwatchSchema = z.strictObject({
  state: stateSchema.default(emptyStopwatch),
  action: z
    .enum(["inspect", "start", "pause", "lap", "reset", "clear-laps"])
    .default("inspect"),
  nowMs: ms.optional(),
});
export const stopwatchOperation: Operation = {
  id: "stopwatch",
  name: "tooltab_stopwatch",
  description:
    "Start, pause, resume, record laps, inspect, reset or clear a stopwatch using explicit caller-owned state. Pass the returned state on the next request; there is no server persistence or sleeping task. nowMs is optional Unix milliseconds (defaults to current time). Returns full lap splits, hundredths display and UTF-8 CSV including exact milliseconds. Maximum10000laps. Browser local state is separate.",
  inputSchema: stopwatchSchema,
  outputSchema: z.strictObject({
    state: stateSchema,
    nowMs: ms,
    elapsedMs: ms,
    formatted: z.string(),
    rows: z.array(z.strictObject({ index: ms, lapMs: ms, totalMs: ms })),
    csv: z.string(),
  }),
  idempotent: false,
  bodyLimit: 512000,
  async run(value, signal) {
    signal?.throwIfAborted();
    const p = stopwatchSchema.parse(value),
      nowMs = p.nowMs ?? Date.now();
    let state: ReturnType<typeof transition>;
    try {
      state = transition(p.state, p.action, nowMs);
    } catch {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["state"],
          message:
            "Invalid stopwatch state, elapsed overflow or lap capacity exceeded.",
        },
      ]);
    }
    const elapsedMs = elapsed(state, nowMs);
    return {
      state,
      nowMs,
      elapsedMs,
      formatted: formatElapsed(elapsedMs),
      rows: lapRows(state.laps),
      csv: lapCsv(state.laps),
    };
  },
};
