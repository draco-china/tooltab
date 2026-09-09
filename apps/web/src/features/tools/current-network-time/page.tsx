import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Skeleton } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  createNetworkBaseline,
  type NetworkTimeBaseline,
  readNetworkClockTime,
} from "@workspace/tools/time/network-clock";

const TRACE_URL = "https://cloudflare.com/cdn-cgi/trace";
const CLOCK_TICK_INTERVAL_MS = 250;
const RESYNC_INTERVAL_MS = 5_000;
const PLACEHOLDER = "—";

function formatClockTime(valueMs: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(valueMs);
}

function formatCalendarDate(valueMs: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(valueMs);
}

function formatMilliseconds(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

function formatOffset(
  offsetMs: number | undefined,
  roundTripTimeMs: number,
  locale: string,
) {
  if (offsetMs === undefined) return PLACEHOLDER;
  return `${formatMilliseconds(offsetMs, locale)} ms (±${formatMilliseconds(roundTripTimeMs, locale)} ms)`;
}

function formatLastSyncedAt(valueMs: number, locale: string) {
  if (valueMs <= 0) return PLACEHOLDER;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(valueMs);
}

function NetworkStat({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="space-y-2 text-left">
      <p className="text-sm text-muted">{label}</p>
      {loading ? (
        <Skeleton
          aria-label={label}
          className="h-8 w-40 rounded-lg sm:h-9 sm:w-48"
        />
      ) : (
        <p className="min-h-8 font-mono text-lg text-foreground tabular-nums sm:min-h-9 sm:text-2xl">
          {value}
        </p>
      )}
    </div>
  );
}

function CurrentNetworkTimeContent() {
  const locale = getLocale();
  const baseline = useRef<NetworkTimeBaseline | null>(null);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<"syncing" | "synced" | "error">(
    "syncing",
  );
  const [error, setError] = useState("");
  const [localTimeMs, setLocalTimeMs] = useState<number>();
  const [networkTimeMs, setNetworkTimeMs] = useState<number>();
  const [roundTripTimeMs, setRoundTripTimeMs] = useState(0);
  const [offsetMs, setOffsetMs] = useState<number>();
  const [lastSyncAtMs, setLastSyncAtMs] = useState(0);

  const syncNow = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("syncing");
    setError("");
    try {
      const startPerformanceMs = performance.now();
      const response = await fetch(TRACE_URL, {
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const trace = await response.text();
      if (trace.length > 64 * 1024)
        throw new Error("Trace response is too large");
      const endPerformanceMs = performance.now();
      const localEpochMs = Date.now();
      const nextBaseline = createNetworkBaseline({
        trace,
        startPerformanceMs,
        endPerformanceMs,
        localEpochMs,
      });
      baseline.current = nextBaseline;
      setLocalTimeMs(localEpochMs);
      setNetworkTimeMs(readNetworkClockTime(nextBaseline, performance.now()));
      setRoundTripTimeMs(nextBaseline.roundTripTimeMs);
      setOffsetMs(nextBaseline.offsetMs);
      setLastSyncAtMs(localEpochMs);
      setStatus("synced");
    } catch (cause) {
      baseline.current = null;
      setNetworkTimeMs(undefined);
      setOffsetMs(undefined);
      setStatus("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const tickClock = () => {
      const nowEpochMs = Date.now();
      setLocalTimeMs(nowEpochMs);
      setNetworkTimeMs(
        baseline.current
          ? readNetworkClockTime(baseline.current, performance.now())
          : undefined,
      );
    };
    tickClock();
    const intervalId = window.setInterval(tickClock, CLOCK_TICK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    void syncNow();
    const intervalId = window.setInterval(
      () => void syncNow(),
      RESYNC_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [syncNow]);

  const displayedTimeMs = networkTimeMs ?? localTimeMs;
  const showInitialSync = status === "syncing" && lastSyncAtMs === 0;

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.currentNetworkTime.errorTitle"]()}
            </Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <ToolPanelCard>
        <ToolPanelCardContent className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="space-y-8">
            <div className="space-y-4 text-center">
              <div
                aria-live="polite"
                className="flex min-h-5 items-center justify-center text-sm text-muted"
              >
                {showInitialSync ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="size-1.5 animate-pulse rounded-full bg-current opacity-70" />
                    {m["tools.currentNetworkTime.syncing"]()}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                {displayedTimeMs === undefined ? (
                  <div className="grid justify-items-center gap-3">
                    <Skeleton className="h-[clamp(3rem,11vw,6.5rem)] w-full max-w-2xl rounded-2xl" />
                    <Skeleton className="h-5 w-56 rounded-lg" />
                  </div>
                ) : (
                  <>
                    <time className="block font-mono text-[clamp(3rem,11vw,6.5rem)] font-semibold tracking-tight text-foreground tabular-nums">
                      {formatClockTime(displayedTimeMs, locale)}
                    </time>
                    <p className="text-sm text-muted sm:text-base">
                      {formatCalendarDate(displayedTimeMs, locale)}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-6 border-t border-separator pt-6 sm:grid-cols-2">
              <NetworkStat
                label={m["tools.currentNetworkTime.offset"]()}
                value={formatOffset(offsetMs, roundTripTimeMs, locale)}
                loading={showInitialSync}
              />
              <NetworkStat
                label={m["tools.currentNetworkTime.lastSyncedAt"]()}
                value={formatLastSyncedAt(lastSyncAtMs, locale)}
                loading={showInitialSync}
              />
            </div>
          </div>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.csvToJsonConverter.article.whatTitle"]()}</h2>
        <p>{m["tools.currentNetworkTime.articlePurposeBody"]()}</p>
        <h2>{m["tools.currentNetworkTime.article.helpsTitle"]()}</h2>
        <ul>
          <li>{m["tools.currentNetworkTime.articleHelps0"]()}</li>
          <li>{m["tools.currentNetworkTime.articleHelps1"]()}</li>
          <li>{m["tools.currentNetworkTime.articleHelps2"]()}</li>
        </ul>
        <h2>{m["tools.currentNetworkTime.article.watchTitle"]()}</h2>
        <ul>
          <li>{m["tools.currentNetworkTime.articleWatch0"]()}</li>
          <li>{m["tools.currentNetworkTime.articleWatch1"]()}</li>
          <li>{m["tools.currentNetworkTime.articleWatch2"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function CurrentNetworkTime() {
  return (
    <ToolPage>
      <CurrentNetworkTimeContent />
    </ToolPage>
  );
}
