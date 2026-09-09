import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  formatTimer,
  initialTimer,
  TimerError,
  timerParts,
  transitionTimer,
} from "@workspace/tools/time/timer";

const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const timerStateSchema = z.strictObject({
  durationMs: ms,
  remainingMs: ms,
  endTime: ms,
  phase: z.enum(["idle", "running", "paused", "complete"]),
});
export const timerSchema = z
  .strictObject({
    state: timerStateSchema.default(initialTimer),
    action: z
      .enum(["inspect", "start", "pause", "reset", "set-duration"])
      .default("inspect"),
    durationMs: ms.optional(),
    nowMs: ms.optional(),
  })
  .refine(
    (p) =>
      p.action === "set-duration"
        ? p.durationMs !== undefined
        : p.durationMs === undefined,
    { message: "durationMs is required only for set-duration." },
  );
export const timerOperation: Operation = {
  id: "timer",
  name: "tooltab_timer",
  description:
    "Inspect, start/resume, pause, reset or set a countdown using explicit caller-owned state. Pass returned state on the next call. Defaults to5minutes. nowMs is optional Unix milliseconds, default current time. Returns precise remaining time, deadline, formatted hundredths, and completedNow when this call observes a running timer expire. Does not wait, persist server state, create a scheduled task, notify the user or control browser sound/vibration/fullscreen. Browser state is separate. Safe-integer milliseconds; overflow and malformed state rejected.",
  inputSchema: timerSchema,
  outputSchema: z.strictObject({
    state: timerStateSchema,
    nowMs: ms,
    remainingMs: ms,
    deadlineMs: ms.nullable(),
    formatted: z.string(),
    completedNow: z.boolean(),
    parts: z.strictObject({ hours: ms, minutes: ms, seconds: ms }),
  }),
  bodyLimit: 4096,
  idempotent: false,
  run(value, signal) {
    signal?.throwIfAborted();
    const p = timerSchema.parse(value),
      nowMs = p.nowMs ?? Date.now();
    try {
      const next = transitionTimer(p.state, p.action, nowMs, p.durationMs);
      return {
        ...next,
        nowMs,
        remainingMs: next.state.remainingMs,
        deadlineMs: next.state.phase === "running" ? next.state.endTime : null,
        formatted: formatTimer(next.state.remainingMs),
        parts: timerParts(next.state.remainingMs),
      };
    } catch (error) {
      if (error instanceof TimerError)
        throw new z.ZodError([
          { code: "custom", path: ["state"], message: error.code },
        ]);
      throw error;
    }
  },
};
