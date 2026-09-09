import {
  TimerError,
  transitionTimer,
  validTimer,
} from "@workspace/tools/time/timer";
export type TimerPreferences = {
  sound: boolean;
  vibration: boolean;
  notifications: boolean;
};
export const defaultTimerPreferences = (): TimerPreferences => ({
  sound: true,
  vibration: true,
  notifications: false,
});
export const TIMER_STORAGE = "tooltab:timer:v1";
export function readTimerStorage(raw: string, nowMs: number) {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object")
    throw new TimerError("invalid_state");
  const v = value as { state?: unknown; preferences?: TimerPreferences };
  if (
    !validTimer(v.state) ||
    !v.preferences ||
    typeof v.preferences.sound !== "boolean" ||
    typeof v.preferences.vibration !== "boolean" ||
    typeof v.preferences.notifications !== "boolean"
  )
    throw new TimerError("invalid_state");
  // Hydration resolves overdue timers without replaying historical completion alerts.
  return {
    state: transitionTimer(v.state, "inspect", nowMs).state,
    preferences: v.preferences,
  };
}
