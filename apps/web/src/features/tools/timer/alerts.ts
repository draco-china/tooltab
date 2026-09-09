import { useEffect, useRef, useState } from "react";
import type { TimerPreferences } from "./logic";

type AlertCapabilities = {
  sound: boolean;
  vibration: boolean;
  permission: NotificationPermission | "unsupported";
};
function audioConstructor() {
  return (
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}
export function useTimerAlerts(
  preferences: TimerPreferences,
  title: string,
  body: string,
) {
  const [capabilities, setCapabilities] = useState<AlertCapabilities>({
      sound: false,
      vibration: false,
      permission: "unsupported",
    }),
    [error, setError] = useState<"audio" | "alert" | "permission" | null>(null),
    context = useRef<AudioContext | null>(null),
    nodes = useRef(new Set<OscillatorNode>()),
    notifications = useRef(new Set<Notification>()),
    epoch = useRef(0);
  useEffect(() => {
    const activeNodes = nodes.current;
    const activeNotifications = notifications.current;
    const sync = () =>
      setCapabilities({
        sound: !!audioConstructor(),
        vibration: typeof navigator.vibrate === "function",
        permission:
          typeof Notification === "undefined"
            ? "unsupported"
            : Notification.permission,
      });
    sync();
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("focus", sync);
      // Invalidate the latest async generation at cleanup, not the generation captured at mount.
      epoch.current++;
      for (const node of activeNodes) {
        try {
          node.stop();
        } catch {
          /* Already stopped. */
        }
        node.disconnect();
      }
      activeNodes.clear();
      if (typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(0);
        } catch {
          /* Browser can reject vibration. */
        }
      }
      for (const notification of activeNotifications) notification.close();
      activeNotifications.clear();
      void context.current?.close().catch(() => {});
      context.current = null;
    };
  }, []);
  function stop() {
    epoch.current++;
    for (const node of nodes.current) {
      try {
        node.stop();
      } catch {
        /* Already stopped. */
      }
      node.disconnect();
    }
    nodes.current.clear();
    if (typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(0);
      } catch {
        /* Browser can reject vibration. */
      }
    }
    for (const notification of notifications.current) notification.close();
    notifications.current.clear();
    setError(null);
  }
  async function unlock() {
    const current = epoch.current;
    if (!preferences.sound) return;
    try {
      const Audio = audioConstructor();
      if (!Audio) return;
      if (!context.current) context.current = new Audio();
      if (context.current.state === "suspended") await context.current.resume();
    } catch {
      if (current === epoch.current) setError("audio");
    }
  }
  async function notify() {
    const current = epoch.current;
    let failed = false;
    if (preferences.vibration && typeof navigator.vibrate === "function") {
      try {
        if (!navigator.vibrate([200, 100, 200, 100, 400])) failed = true;
      } catch {
        failed = true;
      }
    }
    if (
      preferences.notifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        const notification = new Notification(title, { body });
        notifications.current.add(notification);
        notification.onclose = () => notifications.current.delete(notification);
      } catch {
        failed = true;
      }
    }
    if (preferences.sound) {
      await unlock();
      if (current !== epoch.current) return;
      const audio = context.current;
      if (audio?.state === "running") {
        try {
          const start = audio.currentTime;
          for (let i = 0; i < 3; i++) {
            const at = start + i * 0.23,
              node = audio.createOscillator(),
              gain = audio.createGain();
            node.type = "sine";
            node.frequency.value = 880;
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(0.2, at + 0.01);
            gain.gain.linearRampToValueAtTime(0, at + 0.15);
            node.connect(gain);
            gain.connect(audio.destination);
            nodes.current.add(node);
            node.onended = () => {
              nodes.current.delete(node);
              node.disconnect();
              gain.disconnect();
            };
            node.start(at);
            node.stop(at + 0.17);
          }
        } catch {
          failed = true;
        }
      } else failed = true;
    }
    if (failed && current === epoch.current) setError("alert");
  }
  async function request() {
    if (typeof Notification === "undefined") return;
    try {
      const permission = await Notification.requestPermission();
      setCapabilities((value) => ({ ...value, permission }));
    } catch {
      setError("permission");
    }
  }
  return { capabilities, error, unlock, notify, request, stop };
}
