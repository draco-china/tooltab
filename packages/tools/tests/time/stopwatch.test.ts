import { expect, it } from "vitest";
import {
  elapsed,
  emptyStopwatch,
  formatElapsed,
  lapCsv,
  lapRows,
  LAP_LIMIT,
  transition,
  validStopwatch,
} from "../../src/time/stopwatch";

it("runs, pauses, resumes, records laps, clears laps, and resets", () => {
  let state = transition(emptyStopwatch(), "start", 1000);
  state = transition(state, "lap", 2250);
  state = transition(state, "pause", 3500);
  expect(state).toMatchObject({
    running: false,
    accumulatedMs: 2500,
    startedAt: 0,
    laps: [1250],
  });
  expect(elapsed(state, 9999)).toBe(2500);
  state = transition(JSON.parse(JSON.stringify(state)), "start", 10000);
  state = transition(state, "lap", 11000);
  expect(state.laps).toEqual([1250, 3500]);
  expect(transition(state, "clear-laps", 11000).laps).toEqual([]);
  expect(transition(state, "reset", 12000)).toEqual(emptyStopwatch());
});

it("handles repeated actions and clock rollback without negative elapsed values", () => {
  expect(transition(emptyStopwatch(), "pause", 0)).toEqual(emptyStopwatch());
  let state = transition(emptyStopwatch(), "start", 1000);
  expect(transition(state, "start", 900)).toBe(state);
  expect(transition(state, "lap", 1000)).toBe(state);
  state = transition(state, "lap", 2000);
  state = transition(state, "lap", 1500);
  expect(state.laps).toEqual([1000, 1000]);
  expect(elapsed(transition(state, "pause", 1400), 1400)).toBe(1000);
  expect(transition(state, "pause", 1500)).toMatchObject({
    running: false,
    accumulatedMs: 1000,
  });
  expect(transition(state, "inspect", 1500)).toBe(state);
});

it("validates persisted state and action/time boundaries", () => {
  expect(validStopwatch(null)).toBe(false);
  expect(validStopwatch({ ...emptyStopwatch(), running: "yes" })).toBe(false);
  expect(validStopwatch({ ...emptyStopwatch(), startedAt: -1 })).toBe(false);
  expect(validStopwatch({ ...emptyStopwatch(), laps: [4, 3] })).toBe(false);
  expect(validStopwatch({ ...emptyStopwatch(), laps: ["3"] })).toBe(false);
  expect(
    validStopwatch({
      ...emptyStopwatch(),
      running: false,
      accumulatedMs: 2,
      laps: [3],
    }),
  ).toBe(false);
  expect(
    validStopwatch({
      ...emptyStopwatch(),
      laps: Array.from({ length: LAP_LIMIT + 1 }, () => 1),
    }),
  ).toBe(false);
  expect(() => transition(emptyStopwatch(), "inspect", -1)).toThrow(
    "invalid_state",
  );
  expect(() => transition(emptyStopwatch(), "inspect", 1.5)).toThrow(
    "invalid_state",
  );
  expect(() => transition(emptyStopwatch(), "unknown" as never, 0)).toThrow(
    "invalid_action",
  );
});

it("rejects elapsed overflow and enforces the lap limit", () => {
  expect(() =>
    elapsed(
      {
        ...emptyStopwatch(),
        running: true,
        accumulatedMs: Number.MAX_SAFE_INTEGER,
        startedAt: 0,
      },
      100,
    ),
  ).toThrow("invalid_state");
  const state = {
    ...emptyStopwatch(),
    running: true,
    startedAt: 0,
    laps: Array.from({ length: LAP_LIMIT }, (_, i) => i + 1),
  };
  expect(() => transition(state, "lap", LAP_LIMIT + 1)).toThrow("lap_limit");
});

it("formats elapsed values and exports quoted CSV rows", () => {
  expect(formatElapsed(0)).toBe("00:00:00.00");
  expect(formatElapsed(360000000 + 61239)).toBe("100:01:01.23");
  expect(lapRows([1250, 3500])).toEqual([
    { index: 1, lapMs: 1250, totalMs: 1250 },
    { index: 2, lapMs: 2250, totalMs: 3500 },
  ]);
  expect(lapCsv([])).toBe("");
  expect(lapCsv([1000])).toBe(
    '\uFEFF"#","Lap","Total","Lap (ms)","Total (ms)"\r\n1,00:00:01.00,00:00:01.00,1000,1000',
  );
  expect(lapCsv([1000], ['A,"B', "T", "ms", "total"])).toContain('"A,""B"');
  expect(lapCsv([1250, 3500])).toContain("2,00:00:02.25,00:00:03.50,2250,3500");
});
