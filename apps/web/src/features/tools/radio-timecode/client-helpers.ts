import type { StationId } from "@workspace/tools/radio-timecode/encoders";
import { resolveStation } from "@workspace/tools/radio-timecode/stations";

type AudioWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

const DEFAULT_STATION_ID: StationId = "jjy-60";
const DEFAULT_VOLUME = 0.3;
const DEFAULT_OFFSET_MS = 0;
const TICK_INTERVAL_MS = 500;
const PREVIEW_SECONDS = 12;
const STORAGE_KEYS = {
  station: "tools:radio-timecode:station",
  volume: "tools:radio-timecode:volume",
  offset: "tools:radio-timecode:offset",
} as const;

function getAudioContextConstructor() {
  if (typeof window === "undefined") return null;
  const audioWindow = window as AudioWindow;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function createAudioContext() {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) throw new Error("AudioContext is not supported");
  return new AudioContextCtor();
}

function parseStoredStation(value: string | null): StationId {
  return resolveStation(value).id;
}

function parseStoredNumber(value: string | null, fallback: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampOffset(value: number) {
  return Math.max(-3_600_000, Math.min(3_600_000, Math.round(value)));
}

function formatStationTime(date: Date, timeZone: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export {
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
};
