import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Slider,
  Spinner,
  TextField,
} from "@heroui/react";
import { Play, Square, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  clampOffset,
  clampVolume,
  createAudioContext,
  DEFAULT_OFFSET_MS,
  DEFAULT_STATION_ID,
  DEFAULT_VOLUME,
  formatStationTime,
  getAudioContextConstructor,
  PREVIEW_SECONDS,
  parseStoredNumber,
  parseStoredStation,
  STORAGE_KEYS,
  TICK_INTERVAL_MS,
} from "./client-helpers";
import type { StationId } from "@workspace/tools/radio-timecode/encoders";
import { getStationSignal } from "@workspace/tools/radio-timecode/encoders";
import { SignalEngine } from "./signal-engine";
import type { Station } from "@workspace/tools/radio-timecode/stations";
import {
  resolveStation,
  stations,
} from "@workspace/tools/radio-timecode/stations";

type PreviewSymbol = Readonly<{ offset: number; symbol: string }>;

const INITIAL_PREVIEW_TIME_MS = Date.UTC(2000, 0, 1, 0, 0, 0);

function RadioTimecodeContent() {
  const locale = getLocale();
  const language = locale === "zh-CN" ? "zh-CN" : "en-US";
  const engineRef = useRef<SignalEngine | null>(null);
  const pendingRestartRef = useRef(false);
  const playbackConfigRef = useRef({
    offsetMs: DEFAULT_OFFSET_MS,
    stationId: DEFAULT_STATION_ID,
  });
  const startSerialRef = useRef(0);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [stationId, setStationId] = useState<StationId>(DEFAULT_STATION_ID);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [offsetMs, setOffsetMs] = useState(DEFAULT_OFFSET_MS);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [nowMs, setNowMs] = useState(INITIAL_PREVIEW_TIME_MS);

  const station = resolveStation(stationId);
  const signalDate = useMemo(
    () => new Date(nowMs + offsetMs),
    [nowMs, offsetMs],
  );
  const currentSignal = useMemo(
    () => getStationSignal(station.id, signalDate),
    [signalDate, station.id],
  );
  const stationTime = useMemo(
    () => formatStationTime(signalDate, station.timeZone, language),
    [language, signalDate, station.timeZone],
  );
  const previewSymbols = useMemo<readonly PreviewSymbol[]>(
    () =>
      Array.from({ length: PREVIEW_SECONDS }, (_, offset) => ({
        offset,
        symbol: getStationSignal(
          station.id,
          new Date(signalDate.getTime() + offset * 1000),
        ).symbol,
      })),
    [signalDate, station.id],
  );
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language),
    [language],
  );
  const percentFormatter = useMemo(
    () => new Intl.NumberFormat(language, { maximumFractionDigits: 0 }),
    [language],
  );

  const stopSignal = useEffectEvent(() => {
    startSerialRef.current += 1;
    pendingRestartRef.current = false;
    setStarting(false);
    setStartFailed(false);
    engineRef.current?.stop();
    setPlaying(false);
  });

  const startSignal = useEffectEvent(async () => {
    if (!audioAvailable) return;
    if (starting) {
      pendingRestartRef.current = true;
      return;
    }
    engineRef.current ??= new SignalEngine(createAudioContext);
    setStarting(true);
    setStartFailed(false);
    pendingRestartRef.current = false;
    startSerialRef.current += 1;
    const serial = startSerialRef.current;
    try {
      await engineRef.current.start({ station, volume, offsetMs });
      if (serial === startSerialRef.current) setPlaying(true);
    } catch {
      if (serial === startSerialRef.current) {
        engineRef.current?.stop();
        setPlaying(false);
        setStartFailed(true);
      }
    } finally {
      if (serial === startSerialRef.current) setStarting(false);
      if (pendingRestartRef.current && serial === startSerialRef.current) {
        pendingRestartRef.current = false;
        void startSignal();
      }
    }
  });

  useEffect(() => {
    setAudioAvailable(Boolean(getAudioContextConstructor()));
    try {
      setStationId(
        parseStoredStation(localStorage.getItem(STORAGE_KEYS.station)),
      );
      setVolume(
        clampVolume(
          parseStoredNumber(
            localStorage.getItem(STORAGE_KEYS.volume),
            DEFAULT_VOLUME,
          ),
        ),
      );
      setOffsetMs(
        clampOffset(
          parseStoredNumber(
            localStorage.getItem(STORAGE_KEYS.offset),
            DEFAULT_OFFSET_MS,
          ),
        ),
      );
    } catch {
      // Optional preferences must not block the live preview.
    }
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
    const intervalId = window.setInterval(
      () => setNowMs(Date.now()),
      TICK_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.station, stationId);
      localStorage.setItem(STORAGE_KEYS.volume, String(volume));
      localStorage.setItem(STORAGE_KEYS.offset, String(offsetMs));
    } catch {
      // Storage can be unavailable while the tool remains fully usable.
    }
  }, [hasHydrated, offsetMs, stationId, volume]);

  useEffect(() => {
    if (!playing) {
      playbackConfigRef.current = { offsetMs, stationId };
      return;
    }
    const previousConfig = playbackConfigRef.current;
    if (
      previousConfig.offsetMs === offsetMs &&
      previousConfig.stationId === stationId
    ) {
      return;
    }
    playbackConfigRef.current = { offsetMs, stationId };
    void startSignal();
  }, [offsetMs, playing, stationId]);

  useEffect(() => {
    if (playing) engineRef.current?.setVolume(volume);
  }, [playing, volume]);

  useEffect(() => () => engineRef.current?.stop(), []);

  const formatHz = (value: number) =>
    `${numberFormatter.format(value)} ${m["tools.radioTimecode.hzUnit"]()}`;
  const formatPercent = (value: number) =>
    `${percentFormatter.format(value * 100)}${m["tools.radioTimecode.percentUnit"]()}`;

  return (
    <div className="grid gap-8">
      <div
        className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
        data-tool-panels
      >
        <div className="grid min-w-0 content-start gap-6">
          <SignalCard
            audioAvailable={audioAvailable}
            onStart={() => void startSignal()}
            onStationChange={setStationId}
            onStop={stopSignal}
            playing={playing}
            startFailed={startFailed}
            starting={starting}
            station={station}
            stationId={station.id}
          />
          <OutputCard
            formatHz={formatHz}
            formatPercent={formatPercent}
            offsetMs={offsetMs}
            onOffsetChange={(value) => setOffsetMs(clampOffset(value))}
            onVolumeChange={(value) => setVolume(clampVolume(value))}
            station={station}
            volume={volume}
          />
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <PreviewCard
            currentSymbol={currentSignal.symbol}
            previewSymbols={previewSymbols}
            station={station}
            stationTime={stationTime}
          />
          <NotesCard />
        </div>
      </div>
      <ToolArticle>
        <h2>{m["tools.radioTimecode.articleWhatTitle"]()}</h2>
        <p>{m["tools.radioTimecode.articleWhatBody"]()}</p>
        <h2>{m["tools.cronExpressionGenerator.article.useTitle"]()}</h2>
        <p>{m["tools.radioTimecode.articleHowBody"]()}</p>
        <h2>{m["tools.radioTimecode.articleLimitsTitle"]()}</h2>
        <p>{m["tools.radioTimecode.articleLimitsBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function RadioTimecode() {
  return (
    <ToolPage>
      <RadioTimecodeContent />
    </ToolPage>
  );
}

function SignalCard({
  audioAvailable,
  onStart,
  onStationChange,
  onStop,
  playing,
  startFailed,
  starting,
  station,
  stationId,
}: Readonly<{
  audioAvailable: boolean;
  onStart: () => void;
  onStationChange: (stationId: StationId) => void;
  onStop: () => void;
  playing: boolean;
  startFailed: boolean;
  starting: boolean;
  station: Station;
  stationId: StationId;
}>) {
  const runLabel = starting
    ? m["tools.radioTimecode.startingLabel"]()
    : playing
      ? m["tools.radioTimecode.stop"]()
      : m["tools.radioTimecode.start"]();
  const statusLabel = playing
    ? m["tools.radioTimecode.playbackStatusPlaying"]()
    : m["tools.radioTimecode.playbackStatusIdle"]();
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.radioTimecode.signalTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.radioTimecode.stationHint"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        <Select
          variant="secondary"
          aria-label={m["tools.radioTimecode.stationLabel"]()}
          selectedKey={stationId}
          onSelectionChange={(key) => {
            if (key) onStationChange(key as StationId);
          }}
        >
          <Label>{m["tools.radioTimecode.stationLabel"]()}</Label>
          <Select.Trigger className="w-full" data-testid="station-select">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {stations.map((item) => (
                <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
                  {item.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <p className="text-xs leading-5 text-muted">
          {stationDescriptions[station.id]()}
        </p>
        {!audioAvailable ? (
          <AudioAlert
            description={m["tools.radioTimecode.unsupportedAudioDescription"]()}
            title={m["tools.radioTimecode.unsupportedAudioTitle"]()}
          />
        ) : null}
        {startFailed ? (
          <AudioAlert
            description={m["tools.radioTimecode.startFailedDescription"]()}
            title={m["tools.radioTimecode.startFailedTitle"]()}
          />
        ) : null}
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex flex-wrap items-center justify-between gap-3">
        <p
          aria-live="polite"
          className="text-sm text-muted"
          data-testid="playback-status"
        >
          {m["tools.radioTimecode.playbackStatusLabel"]()}: {statusLabel}
        </p>
        <Button
          type="button"
          size="sm"
          variant={playing ? "danger" : "primary"}
          isDisabled={!audioAvailable || starting}
          onPress={playing ? onStop : onStart}
        >
          {starting ? (
            <Spinner size="sm" />
          ) : playing ? (
            <Square aria-hidden className="size-4" />
          ) : (
            <Play aria-hidden className="size-4" />
          )}
          {runLabel}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function AudioAlert({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function OutputCard({
  formatHz,
  formatPercent,
  offsetMs,
  onOffsetChange,
  onVolumeChange,
  station,
  volume,
}: Readonly<{
  formatHz: (value: number) => string;
  formatPercent: (value: number) => string;
  offsetMs: number;
  onOffsetChange: (value: number) => void;
  onVolumeChange: (value: number) => void;
  station: Station;
  volume: number;
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.radioTimecode.outputTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.radioTimecode.volumeHint"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>{m["tools.radioTimecode.volumeLabel"]()}</Label>
            <span className="font-mono text-sm text-muted">
              {formatPercent(volume)}
            </span>
          </div>
          <Slider
            aria-label={m["tools.radioTimecode.volumeLabel"]()}
            className="min-h-11"
            minValue={0}
            maxValue={1}
            step={0.01}
            value={volume}
            onChange={(value) => onVolumeChange(Number(value))}
            data-testid="volume-slider"
          >
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
        </div>
        <TextField className="grid gap-2">
          <Label htmlFor="radio-timecode-offset">
            {m["tools.radioTimecode.offsetLabel"]()}
          </Label>
          <Input
            id="radio-timecode-offset"
            type="number"
            inputMode="numeric"
            step={1}
            value={offsetMs}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              onOffsetChange(Number.isFinite(value) ? value : 0);
            }}
            data-testid="offset-input"
          />
          <p className="text-xs leading-5 text-muted">
            {m["tools.radioTimecode.offsetHint"]()} (
            {m["tools.deviceInformation.milliseconds"]()})
          </p>
        </TextField>
        <dl className="grid gap-4 border-t border-separator pt-5 sm:grid-cols-3">
          <Metric
            label={m["tools.radioTimecode.carrier"]()}
            value={formatHz(station.carrierHz)}
          />
          <Metric
            label={m["tools.radioTimecode.outputToneLabel"]()}
            value={formatHz(station.baseHz)}
          />
          <Metric
            label={m["tools.radioTimecode.attenuationLabel"]()}
            value={formatPercent(station.lowRatio)}
          />
        </dl>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PreviewCard({
  currentSymbol,
  previewSymbols,
  station,
  stationTime,
}: Readonly<{
  currentSymbol: string;
  previewSymbols: readonly PreviewSymbol[];
  station: Station;
  stationTime: string;
}>) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.markdownPreviewer.previewTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.radioTimecode.previewDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Metric
            label={m["tools.radioTimecode.stationTimeLabel"]()}
            value={stationTime}
            testId="station-time"
          />
          <Metric
            label={m["shared.dateTools.zone"]()}
            value={station.timeZone}
          />
          <Metric
            label={m["tools.radioTimecode.symbol"]()}
            value={currentSymbol}
            testId="current-symbol"
          />
        </dl>
        <div className="flex flex-col gap-3 border-t border-separator pt-5">
          <p className="text-sm text-muted">
            {m["tools.radioTimecode.upcomingSymbolsLabel"]()}
          </p>
          <div
            className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12"
            data-testid="symbol-preview"
          >
            {previewSymbols.map((item) => (
              <div
                key={item.offset}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-separator bg-default/30 px-2 py-2"
              >
                <span className="text-xs text-muted">+{item.offset}s</span>
                <span className="rounded-full bg-default px-2 py-0.5 font-mono text-xs font-medium">
                  {item.symbol}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function NotesCard() {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.radioTimecode.notesTitle"]()}</Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-6 text-muted">
          {[
            m["tools.radioTimecode.notes0"](),
            m["tools.radioTimecode.notes1"](),
            m["tools.radioTimecode.notes2"](),
            m["tools.radioTimecode.notes3"](),
          ].map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Metric({
  label,
  testId,
  value,
}: {
  label: string;
  testId?: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className="font-mono text-sm wrap-break-word tabular-nums"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

const stationDescriptions = {
  "jjy-40": m["tools.radioTimecode.stationDescriptionsJjy40"],
  "jjy-60": m["tools.radioTimecode.stationDescriptionsJjy60"],
  bpc: m["tools.radioTimecode.stationDescriptionsBpc"],
  dcf77: m["tools.radioTimecode.stationDescriptionsDcf77"],
  msf: m["tools.radioTimecode.stationDescriptionsMsf"],
  wwvb: m["tools.radioTimecode.stationDescriptionsWwvb"],
};
