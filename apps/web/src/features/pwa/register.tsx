import { Button } from "@heroui/react";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { m } from "@/paraglide/messages.js";
export function Pwa() {
  const path = useLocation({ select: (location) => location.pathname });
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const refreshRequested = useRef(false);
  const reportedAssets = useRef(new Set<string>());
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const check = () => {
      if (!disposed)
        setWaiting(
          navigator.serviceWorker.controller
            ? (registration?.waiting ?? null)
            : null,
        );
    };
    const updateFound = () => {
      installing?.removeEventListener("statechange", check);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", check);
    };
    const controllerChanged = () => {
      if (!disposed) setWaiting(null);
      if (refreshRequested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    void navigator.serviceWorker
      .register("/sw.js")
      .then((result) => {
        if (disposed) return;
        registration = result;
        check();
        updateFound();
        registration.addEventListener("updatefound", updateFound);
      })
      .catch(() => {
        /* Offline on first visit or unavailable storage. */
      });
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", updateFound);
      installing?.removeEventListener("statechange", check);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false;
    void navigator.serviceWorker.ready.then((registration) => {
      if (disposed) return;
      const assets = performance
        .getEntriesByType("resource")
        .flatMap((entry) => {
          const url = new URL(entry.name);
          return url.origin === window.location.origin && !url.search
            ? [url.pathname]
            : [];
        })
        .filter((asset) => !reportedAssets.current.has(asset));
      const active = registration.active;
      if (!active) return;
      for (const asset of assets) reportedAssets.current.add(asset);
      active.postMessage({ type: "CACHE_PAGE", path, assets });
    });
    return () => {
      disposed = true;
    };
  }, [path]);
  if (!waiting) return null;
  return (
    <aside
      role="status"
      className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground shadow-sm"
    >
      <p className="grow">{m["common.updateavailable"]()}</p>
      <Button
        type="button"
        onClick={() => {
          refreshRequested.current = true;
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        {m["common.updatereload"]()}
      </Button>
      <Button variant="outline" type="button" onClick={() => setWaiting(null)}>
        {m["common.updatelater"]()}
      </Button>
    </aside>
  );
}
