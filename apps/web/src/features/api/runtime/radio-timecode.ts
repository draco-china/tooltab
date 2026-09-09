import * as z from "zod/v4";
import { getStationSignal } from "@workspace/tools/radio-timecode/encoders";
import {
  resolveStation,
  stations,
} from "@workspace/tools/radio-timecode/stations";
import type { Operation } from "./operation-contract";

export const radioTimecodeInputSchema = z.strictObject({
  station: z
    .enum(["jjy-40", "jjy-60", "bpc", "dcf77", "msf", "wwvb"])
    .default("jjy-60"),
  timestamp: z.union([z.string().max(64), z.number().finite()]).optional(),
});
const windowSchema = z.strictObject({ start: z.number(), end: z.number() });
export const radioTimecodeOutputSchema = z.strictObject({
  station: z.string(),
  stationLabel: z.string(),
  carrierHz: z.number(),
  audioBaseHz: z.number(),
  timeZone: z.string(),
  startsAt: z.string(),
  seconds: z.array(
    z.strictObject({
      second: z.number().int(),
      timestamp: z.string(),
      symbol: z.string(),
      attenuationWindows: z.array(windowSchema),
    }),
  ),
  audioGenerated: z.literal(false),
});

function dateFrom(value: string | number | undefined) {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_timestamp");
  date.setUTCSeconds(0, 0);
  return date;
}

export function runRadioTimecode(value: unknown) {
  const input = radioTimecodeInputSchema.parse(value);
  const station = resolveStation(input.station);
  const start = dateFrom(input.timestamp);
  const seconds = Array.from({ length: 60 }, (_, second) => {
    const timestamp = new Date(start.getTime() + second * 1000);
    const signal = getStationSignal(station.id, timestamp);
    return {
      second,
      timestamp: timestamp.toISOString(),
      symbol: signal.symbol,
      attenuationWindows: [...signal.windows],
    };
  });
  return {
    station: station.id,
    stationLabel: station.label,
    carrierHz: station.carrierHz,
    audioBaseHz: station.baseHz,
    timeZone: station.timeZone,
    startsAt: start.toISOString(),
    seconds,
    audioGenerated: false as const,
  };
}

export const radioTimecodeOperation: Operation = {
  id: "radio-timecode",
  name: "tooltab_encode_radio_timecode",
  description: `Encode one complete minute of amplitude windows for ${stations.map((station) => station.shortLabel).join(", ")}. The result is a deterministic signal plan. The API does not transmit radio or play audio; audioGenerated is always false. The browser page can synthesize an audible high-frequency approximation through Web Audio after a user gesture.`,
  inputSchema: radioTimecodeInputSchema,
  outputSchema: radioTimecodeOutputSchema,
  bodyLimit: 32 * 1024,
  idempotent: true,
  run: (input) => runRadioTimecode(input),
};
