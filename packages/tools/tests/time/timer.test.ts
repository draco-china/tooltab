import { expect, it } from "vitest";
import {
  durationFromParts,
  formatTimer,
  initialTimer,
  transitionTimer,
  validTimer,
} from "../../src/time/timer";
it("counts exact milliseconds across pause/resume and completes once at the absolute deadline", () => {
  let state = transitionTimer(initialTimer(1000), "start", 100).state;
  expect(state.endTime).toBe(1100);
  state = transitionTimer(state, "pause", 350).state;
  expect(state.remainingMs).toBe(750);
  expect(state.phase).toBe("paused");
  state = transitionTimer(state, "start", 2000).state;
  expect(state.endTime).toBe(2750);
  const done = transitionTimer(state, "inspect", 2750);
  expect(done.completedNow).toBe(true);
  expect(done.state.phase).toBe("complete");
  expect(transitionTimer(done.state, "inspect", 9000).completedNow).toBe(false);
  expect(transitionTimer(done.state, "start", 9000).state.endTime).toBe(10000);
  expect(transitionTimer(done.state, "reset", 9000).state).toEqual(
    initialTimer(1000),
  );
});
it("catches delayed ticks/sleep, caps clock rollback and validates zero/overflow/state", () => {
  let state = transitionTimer(initialTimer(1000), "start", 2000).state;
  state = transitionTimer(state, "inspect", 2500).state;
  expect(transitionTimer(state, "inspect", 1500).state.remainingMs).toBe(500);
  expect(transitionTimer(state, "inspect", 100000).state.remainingMs).toBe(0);
  expect(() => transitionTimer(initialTimer(0), "start", 0)).toThrow(
    "no_duration",
  );
  expect(() =>
    transitionTimer(initialTimer(1000), "start", Number.MAX_SAFE_INTEGER),
  ).toThrow("overflow");
  expect(() => transitionTimer(state, "set-duration", 2500, 100)).toThrow(
    "running",
  );
  expect(validTimer({ ...initialTimer(), phase: "complete" })).toBe(false);
  expect(validTimer({ ...initialTimer(), phase: "running", endTime: 0 })).toBe(
    false,
  );
  expect(() => durationFromParts(0, 60, 0)).toThrow("invalid_duration");
  expect(() => durationFromParts(Number.MAX_SAFE_INTEGER, 0, 0)).toThrow(
    "invalid_duration",
  );
  expect(durationFromParts(100000, 59, 59)).toBe(360003599000);
  expect(formatTimer(3723456)).toBe("01:02:03.45");
});

it("validates all persisted timer phases and rejects impossible state", () => {
  for (const value of [
    null,
    false,
    1,
    {},
    { ...initialTimer(), durationMs: -1 },
    { ...initialTimer(), remainingMs: -1 },
    { ...initialTimer(), endTime: -1 },
    { ...initialTimer(), remainingMs: 300001 },
    { ...initialTimer(), phase: "invalid" },
  ])
    expect(validTimer(value)).toBe(false);
  expect(
    validTimer({ ...initialTimer(1000), phase: "paused", remainingMs: 500 }),
  ).toBe(true);
  expect(
    validTimer({ ...initialTimer(1000), phase: "paused", remainingMs: 0 }),
  ).toBe(false);
  expect(
    validTimer({ ...initialTimer(1000), phase: "paused", endTime: 1 }),
  ).toBe(false);
  expect(validTimer({ ...initialTimer(1000), remainingMs: 500 })).toBe(false);
  expect(validTimer({ ...initialTimer(1000), endTime: 1 })).toBe(false);
  expect(
    validTimer({
      ...initialTimer(1000),
      phase: "complete",
      remainingMs: 0,
      endTime: 1,
    }),
  ).toBe(false);
  expect(
    validTimer({
      ...initialTimer(1000),
      phase: "running",
      endTime: 1000,
      remainingMs: 0,
    }),
  ).toBe(false);
});

it("handles every action without duplicate completion alerts", () => {
  const idle = initialTimer(1000);
  expect(transitionTimer(idle, "pause", 0)).toEqual({
    state: idle,
    completedNow: false,
  });
  expect(transitionTimer(idle, "set-duration", 0, 500).state).toEqual(
    initialTimer(500),
  );
  expect(() => transitionTimer(idle, "set-duration", 0)).toThrow(
    "invalid_duration",
  );
  expect(() => transitionTimer(idle, "inspect", -1)).toThrow("invalid_state");
  expect(() =>
    transitionTimer({ ...idle, remainingMs: -1 }, "inspect", 0),
  ).toThrow("invalid_state");
  expect(() => transitionTimer(idle, "bad" as "inspect", 0)).toThrow(
    "invalid_action",
  );
  expect(() => initialTimer(NaN)).toThrow("invalid_duration");
  expect(() => durationFromParts(-1, 0, 0)).toThrow("invalid_duration");
  expect(() => durationFromParts(0, 0, 60)).toThrow("invalid_duration");
  const running = transitionTimer(idle, "start", 10).state;
  expect(transitionTimer(running, "start", 20).state.endTime).toBe(1010);
  expect(transitionTimer(running, "pause", 1010).completedNow).toBe(true);
  expect(transitionTimer(running, "reset", 1010)).toEqual({
    state: idle,
    completedNow: false,
  });
});
