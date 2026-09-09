export const LAP_LIMIT = 10000;
export interface StopwatchState {
  running: boolean;
  startedAt: number;
  accumulatedMs: number;
  laps: number[];
}
export type StopwatchAction =
  | "inspect"
  | "start"
  | "pause"
  | "lap"
  | "reset"
  | "clear-laps";
export const emptyStopwatch = (): StopwatchState => ({
  running: false,
  startedAt: 0,
  accumulatedMs: 0,
  laps: [],
});
export function validStopwatch(value: unknown): value is StopwatchState {
  if (!value || typeof value !== "object") return false;
  const v = value as StopwatchState;
  const integer = (n: unknown): n is number =>
    Number.isSafeInteger(n) && Number(n) >= 0;
  return (
    typeof v.running === "boolean" &&
    integer(v.startedAt) &&
    integer(v.accumulatedMs) &&
    Array.isArray(v.laps) &&
    v.laps.length <= LAP_LIMIT &&
    v.laps.every((n, i) => integer(n) && (i === 0 || n >= v.laps[i - 1])) &&
    (v.running || (v.laps.at(-1) ?? 0) <= v.accumulatedMs)
  );
}
export function elapsed(state: StopwatchState, now: number): number {
  const value = Math.max(
    state.laps.at(-1) ?? 0,
    state.accumulatedMs +
      (state.running ? Math.max(0, now - state.startedAt) : 0),
  );
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("invalid_state");
  return value;
}
export function transition(
  state: StopwatchState,
  action: StopwatchAction,
  now: number,
): StopwatchState {
  if (!validStopwatch(state) || !Number.isSafeInteger(now) || now < 0)
    throw new Error("invalid_state");
  const current = elapsed(state, now);
  switch (action) {
    case "reset":
      return emptyStopwatch();
    case "clear-laps":
      return { ...state, laps: [] };
    case "start":
      return state.running
        ? state
        : { ...state, running: true, startedAt: now };
    case "pause":
      return state.running
        ? { ...state, running: false, accumulatedMs: current, startedAt: 0 }
        : state;
    case "lap":
      if (!state.running || !current) return state;
      if (state.laps.length >= LAP_LIMIT) throw new Error("lap_limit");
      return { ...state, laps: [...state.laps, current] };
    case "inspect":
      return state;
    default:
      throw new Error("invalid_action");
  }
}
export function formatElapsed(ms: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(Math.floor(ms / 10) % 100)}`;
}
export function lapRows(laps: number[]) {
  return laps.map((totalMs, i) => ({
    index: i + 1,
    lapMs: totalMs - (laps[i - 1] ?? 0),
    totalMs,
  }));
}
export function lapCsv(
  laps: number[],
  labels = ["Lap", "Total", "Lap (ms)", "Total (ms)"],
) {
  if (!laps.length) return "";
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      ["#", ...labels].map(quote).join(","),
      ...lapRows(laps).map((r) =>
        [
          r.index,
          formatElapsed(r.lapMs),
          formatElapsed(r.totalMs),
          r.lapMs,
          r.totalMs,
        ].join(","),
      ),
    ].join("\r\n")
  );
}
