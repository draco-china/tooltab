export const TIMER_PRESETS = [1, 5, 10, 25, 30, 60] as const;
export type TimerPhase = "idle" | "running" | "paused" | "complete";
export type TimerState = {
  durationMs: number;
  remainingMs: number;
  endTime: number;
  phase: TimerPhase;
};
export type TimerAction =
  | "inspect"
  | "start"
  | "pause"
  | "reset"
  | "set-duration";
export class TimerError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TimerError";
  }
}
const integer = (n: unknown): n is number =>
  Number.isSafeInteger(n) && Number(n) >= 0;
export function initialTimer(durationMs = 300000): TimerState {
  if (!integer(durationMs)) throw new TimerError("invalid_duration");
  return { durationMs, remainingMs: durationMs, endTime: 0, phase: "idle" };
}
export function validTimer(value: unknown): value is TimerState {
  if (!value || typeof value !== "object") return false;
  const v = value as TimerState;
  if (
    !integer(v.durationMs) ||
    !integer(v.remainingMs) ||
    !integer(v.endTime) ||
    v.remainingMs > v.durationMs
  )
    return false;
  switch (v.phase) {
    case "idle":
      return v.endTime === 0 && v.remainingMs === v.durationMs;
    case "paused":
      return v.endTime === 0 && v.remainingMs > 0;
    case "complete":
      return v.endTime === 0 && v.remainingMs === 0;
    case "running":
      return v.endTime > 0 && v.remainingMs > 0;
    default:
      return false;
  }
}
export function durationFromParts(
  hours: number,
  minutes: number,
  seconds: number,
) {
  if (![hours, minutes, seconds].every(integer) || minutes > 59 || seconds > 59)
    throw new TimerError("invalid_duration");
  const value = (hours * 3600 + minutes * 60 + seconds) * 1000;
  if (!integer(value)) throw new TimerError("invalid_duration");
  return value;
}
export function timerParts(ms: number) {
  return {
    hours: Math.floor(ms / 3600000),
    minutes: Math.floor(ms / 60000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  };
}
export function formatTimer(ms: number) {
  const p = timerParts(ms),
    pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}.${pad(Math.floor(ms / 10) % 100)}`;
}
export function transitionTimer(
  state: TimerState,
  action: TimerAction,
  nowMs: number,
  durationMs?: number,
): { state: TimerState; completedNow: boolean } {
  if (!validTimer(state) || !integer(nowMs))
    throw new TimerError("invalid_state");
  let next = { ...state };
  if (state.phase === "running") {
    const remainingMs = Math.min(
      state.remainingMs,
      Math.max(0, state.endTime - nowMs),
    );
    next =
      remainingMs === 0
        ? { ...state, phase: "complete", remainingMs: 0, endTime: 0 }
        : { ...state, remainingMs };
  }
  const completedNow =
    state.phase === "running" &&
    next.phase === "complete" &&
    (action === "inspect" || action === "pause");
  switch (action) {
    case "inspect":
      return { state: next, completedNow };
    case "reset":
      return { state: initialTimer(state.durationMs), completedNow: false };
    case "set-duration":
      if (state.phase === "running") throw new TimerError("running");
      if (durationMs === undefined) throw new TimerError("invalid_duration");
      return { state: initialTimer(durationMs), completedNow: false };
    case "pause":
      return {
        state:
          next.phase === "running"
            ? { ...next, phase: "paused", endTime: 0 }
            : next,
        completedNow,
      };
    case "start": {
      if (next.phase === "running") return { state: next, completedNow: false };
      const remainingMs =
        next.phase === "complete" ? next.durationMs : next.remainingMs;
      if (!remainingMs) throw new TimerError("no_duration");
      const endTime = nowMs + remainingMs;
      if (!integer(endTime)) throw new TimerError("overflow");
      return {
        state: { ...next, remainingMs, endTime, phase: "running" },
        completedNow: false,
      };
    }
    default:
      throw new TimerError("invalid_action");
  }
}
