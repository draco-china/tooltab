import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  Modal,
  Switch,
  useOverlayState,
} from "@heroui/react";
import { Expand, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { useTimerAlerts } from "./alerts";
import {
  durationFromParts,
  formatTimer,
  initialTimer,
  TIMER_PRESETS,
  type TimerAction,
  TimerError,
  type TimerState,
  timerParts,
  transitionTimer,
} from "@workspace/tools/time/timer";
import {
  defaultTimerPreferences,
  readTimerStorage,
  TIMER_STORAGE,
  type TimerPreferences,
} from "./logic";
function TimerContent() {
  const id = useId(),
    [state, setState] = useState(initialTimer),
    stateRef = useRef(state),
    [preferences, setPreferences] = useState(defaultTimerPreferences),
    preferencesRef = useRef(preferences),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState(false),
    [native, setNative] = useState(false),
    [fallback, setFallback] = useState(false),
    ownsFullscreen = useRef(false);
  const fallbackState = useOverlayState({
    isOpen: fallback,
    onOpenChange: (open) => {
      if (open) setFallback(true);
      else void exit();
    },
  });
  const alerts = useTimerAlerts(
    preferences,
    m["tools.timer.finished"](),
    m["tools.timer.timeUp"](),
  );
  function persist(value: TimerState, prefs = preferencesRef.current) {
    try {
      if (
        value.phase === "idle" &&
        value.durationMs === 300000 &&
        prefs.sound &&
        prefs.vibration &&
        !prefs.notifications
      )
        localStorage.removeItem(TIMER_STORAGE);
      else
        localStorage.setItem(
          TIMER_STORAGE,
          JSON.stringify({ state: value, preferences: prefs }),
        );
    } catch {
      setStorageError(true);
    }
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_STORAGE);
      if (raw) {
        if (raw.length > 16384) throw Error("storage");
        const restored = readTimerStorage(raw, Date.now());
        stateRef.current = restored.state;
        preferencesRef.current = restored.preferences;
        setState(restored.state);
        setPreferences(restored.preferences);
      }
    } catch {
      setStorageError(true);
    }
    setReady(true);
  }, []);
  const tick = useEffectEvent(() => {
    const next = transitionTimer(stateRef.current, "inspect", Date.now());
    stateRef.current = next.state;
    setState(next.state);
    if (next.completedNow) {
      persist(next.state);
      void alerts.notify();
    }
  });
  useEffect(() => {
    if (!ready || state.phase !== "running") return;
    const timer = setInterval(() => tick(), 50);
    const visible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [ready, state.phase]);
  useEffect(() => {
    const current = document.documentElement,
      change = () => setNative(document.fullscreenElement === current);
    document.addEventListener("fullscreenchange", change);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      if (ownsFullscreen.current && document.fullscreenElement === current)
        void document.exitFullscreen?.().catch(() => {});
    };
  }, []);
  function act(action: TimerAction, durationMs?: number) {
    alerts.stop();
    setError("");
    try {
      const next = transitionTimer(
        stateRef.current,
        action,
        Date.now(),
        durationMs,
      );
      stateRef.current = next.state;
      setState(next.state);
      persist(next.state);
      if (action === "start") void alerts.unlock();
      if (next.completedNow) void alerts.notify();
    } catch (e) {
      setError(
        (e instanceof TimerError && e.code === "no_duration"
          ? m["tools.timer.noDuration"]
          : e instanceof TimerError && e.code === "overflow"
            ? m["tools.timer.overflow"]
            : e instanceof TimerError && e.code === "invalid_duration"
              ? m["tools.timer.invalidDuration"]
              : m["tools.timer.invalidState"])({}),
      );
    }
  }
  function updatePart(key: "hours" | "minutes" | "seconds", raw: string) {
    const value = raw === "" ? 0 : Number(raw),
      parts = timerParts(stateRef.current.durationMs);
    try {
      const ms = durationFromParts(
        ...([
          key === "hours" ? value : parts.hours,
          key === "minutes" ? value : parts.minutes,
          key === "seconds" ? value : parts.seconds,
        ] as [number, number, number]),
      );
      act("set-duration", ms);
    } catch {
      setError(m["tools.timer.invalidDuration"]());
    }
  }
  function preference(key: keyof TimerPreferences, enabled: boolean) {
    const next = { ...preferencesRef.current, [key]: enabled };
    preferencesRef.current = next;
    setPreferences(next);
    persist(stateRef.current, next);
    if (!enabled) alerts.stop();
    if (key === "notifications" && enabled) void alerts.request();
  }
  async function enter() {
    // Keep a usable full-window view even when an embedded host exits native fullscreen.
    setFallback(true);
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        ownsFullscreen.current =
          document.fullscreenElement === document.documentElement;
      }
    } catch {
      /* The accessible Dialog remains usable without native fullscreen. */
    }
  }
  async function exit() {
    if (
      ownsFullscreen.current &&
      document.fullscreenElement === document.documentElement
    ) {
      try {
        await document.exitFullscreen();
      } catch {
        setError(m["tools.timer.invalidState"]());
      }
    }
    ownsFullscreen.current = false;
    setFallback(false);
  }
  function clearSaved() {
    alerts.stop();
    const next = initialTimer(),
      prefs = defaultTimerPreferences();
    stateRef.current = next;
    preferencesRef.current = prefs;
    setState(next);
    setPreferences(prefs);
    setError("");
    try {
      localStorage.removeItem(TIMER_STORAGE);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  const parts = timerParts(state.durationMs),
    runLabel =
      state.phase === "running"
        ? m["tools.timer.pause"]()
        : state.phase === "paused"
          ? m["tools.timer.resume"]()
          : m["tools.timer.start"](),
    status =
      state.phase === "running"
        ? m["tools.timer.runningStatus"]()
        : state.phase === "paused"
          ? m["tools.timer.paused"]()
          : state.phase === "complete"
            ? m["tools.timer.finished"]()
            : m["tools.timer.idle"]();
  function timerDisplay() {
    return (
      <div className="space-y-4 text-center">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {status}
        </p>
        <p
          aria-label={m["tools.timer.name"]()}
          role="timer"
          aria-live="off"
          className="font-mono text-4xl font-medium tracking-tight break-all text-primary tabular-nums sm:text-6xl"
        >
          {formatTimer(state.remainingMs)}
        </p>
      </div>
    );
  }
  function timerActions(full = false) {
    return (
      <ToolPanelActionGroup className="justify-center">
        <Button
          isDisabled={!ready}
          onClick={() => act(state.phase === "running" ? "pause" : "start")}
        >
          {state.phase === "running" ? (
            <Pause aria-hidden className="size-4" />
          ) : (
            <Play aria-hidden className="size-4" />
          )}
          {runLabel}
        </Button>
        <Button
          variant="outline"
          isDisabled={
            !ready || state.phase === "running" || state.phase === "idle"
          }
          onClick={() => act("reset")}
        >
          <RotateCcw aria-hidden className="size-4" />
          {m["common.actions.reset"]()}
        </Button>
        <Button
          variant="outline"
          onClick={() => void (full ? exit() : enter())}
        >
          <Expand aria-hidden className="size-4" />
          {(full
            ? m["tools.timer.exitFullscreen"]
            : m["tools.timer.fullscreen"])({})}
        </Button>
      </ToolPanelActionGroup>
    );
  }
  return (
    <div
      className={
        native
          ? "flex min-h-screen items-center justify-center bg-background p-6"
          : "space-y-6"
      }
    >
      <div
        hidden={fallback}
        className={native ? "w-full max-w-5xl" : "grid gap-6"}
        data-tool-panels={!native || undefined}
      >
        {native ? (
          <div className="space-y-6 text-center">
            {timerDisplay()}
            {timerActions(true)}
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>{m["tools.timer.name"]()}</Card.Title>
              <Card.Description>
                {m["tools.timer.description"]()}
              </Card.Description>
            </Card.Header>
            <ToolPanelCardContent className="items-center justify-center py-12">
              {timerDisplay()}
              {error ? (
                <p role="alert" className="mt-4 text-center text-destructive">
                  {error}
                </p>
              ) : null}
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="justify-center">
              {timerActions()}
            </ToolPanelCardFooter>
          </ToolPanelCard>
        )}
        {!native && (
          <>
            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>{m["tools.timer.duration"]()}</Card.Title>
              </Card.Header>
              <ToolPanelCardContent className="gap-5 py-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {(["hours", "minutes", "seconds"] as const).map((key) => (
                    <div className="grid gap-2" key={key}>
                      <label className="text-sm" htmlFor={`${id}-${key}`}>
                        {(key === "hours"
                          ? m["tools.timer.hours"]
                          : key === "minutes"
                            ? m["tools.timer.minutes"]
                            : m["tools.timer.seconds"])({})}
                      </label>
                      <Input
                        id={`${id}-${key}`}
                        type="number"
                        min={0}
                        max={
                          key === "hours"
                            ? Math.floor(Number.MAX_SAFE_INTEGER / 3600000)
                            : 59
                        }
                        step={1}
                        inputMode="numeric"
                        value={parts[key]}
                        disabled={!ready || state.phase === "running"}
                        onChange={(e) => updatePart(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <p className="text-sm font-medium">
                    {m["tools.timer.presets"]()}
                  </p>
                  <ToolPanelActionGroup>
                    {TIMER_PRESETS.map((minutes) => (
                      <Button
                        key={minutes}
                        variant="outline"
                        isDisabled={!ready || state.phase === "running"}
                        onClick={() => act("set-duration", minutes * 60000)}
                      >
                        {minutes} {m["tools.timer.minuteUnit"]()}
                      </Button>
                    ))}
                  </ToolPanelActionGroup>
                </div>
              </ToolPanelCardContent>
            </ToolPanelCard>
            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>{m["tools.timer.alerts"]()}</Card.Title>
              </Card.Header>
              <ToolPanelCardContent className="divide-y divide-separator py-0">
                {(["sound", "vibration", "notifications"] as const).map(
                  (key) => {
                    const supported =
                      key === "notifications"
                        ? alerts.capabilities.permission !== "unsupported"
                        : alerts.capabilities[key];
                    return (
                      <div className="py-2" key={key}>
                        <Switch
                          className="w-full"
                          isSelected={preferences[key]}
                          isDisabled={!ready || !supported}
                          onChange={(value) => preference(key, value === true)}
                        >
                          <Switch.Content className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3">
                            <span>
                              {(key === "sound"
                                ? m["tools.timer.sound"]
                                : key === "vibration"
                                  ? m["tools.timer.vibration"]
                                  : m["tools.timer.notifications"])({})}
                            </span>
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Content>
                        </Switch>
                        {!supported && (
                          <p className="text-sm text-muted-foreground">
                            {m["tools.timer.unsupported"]()}
                          </p>
                        )}
                      </div>
                    );
                  },
                )}
                {preferences.notifications &&
                  alerts.capabilities.permission !== "unsupported" && (
                    <p className="text-sm text-muted-foreground">
                      {(alerts.capabilities.permission === "granted"
                        ? m["tools.timer.permissionGranted"]
                        : alerts.capabilities.permission === "denied"
                          ? m["tools.timer.permissionDenied"]
                          : m["tools.timer.permissionDefault"])({})}
                    </p>
                  )}
                {preferences.notifications &&
                  alerts.capabilities.permission === "default" && (
                    <Button
                      variant="outline"
                      onClick={() => void alerts.request()}
                    >
                      {m["tools.timer.allow"]()}
                    </Button>
                  )}
                {alerts.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {(alerts.error === "audio"
                      ? m["tools.timer.audioFailed"]
                      : alerts.error === "permission"
                        ? m["tools.timer.permissionFailed"]
                        : m["tools.timer.alertFailed"])({})}
                  </p>
                )}
              </ToolPanelCardContent>
              <ToolPanelCardFooter className="items-center justify-between gap-3">
                {storageError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {m["tools.timer.storageFailed"]()}
                  </p>
                ) : (
                  <span />
                )}
                <Button variant="ghost" onClick={clearSaved}>
                  <Trash2 aria-hidden className="size-4" />
                  {m["tools.timer.clearSaved"]()}
                </Button>
              </ToolPanelCardFooter>
            </ToolPanelCard>
          </>
        )}
      </div>
      <Modal.Backdrop
        isOpen={fallbackState.isOpen}
        onOpenChange={fallbackState.setOpen}
      >
        <Modal.Container className="h-dvh max-w-none rounded-none sm:max-w-none">
          <Modal.Dialog>
            <Modal.Heading className="sr-only">
              {m["tools.timer.name"]()}
            </Modal.Heading>
            <p className="sr-only">{m["tools.timer.background"]()}</p>
            <div className="flex items-center justify-center">
              <div className="space-y-6 text-center">
                {timerDisplay()}
                {timerActions(true)}
              </div>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

export default function Timer() {
  return (
    <ToolPage>
      <TimerContent />
    </ToolPage>
  );
}
