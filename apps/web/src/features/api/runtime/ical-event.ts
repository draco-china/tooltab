import * as z from "zod/v4";
import { runIcal } from "@/features/tools/ical-event-generator/client";
import { icalOptionsSchema } from "@workspace/tools/time/ical";
import { IcalError } from "@workspace/tools/time/ical-contract";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const icalEventSchema = z.strictObject({
  event: icalOptionsSchema,
  nowMs: z.number().int().min(-62135596800000).max(253402300799999).optional(),
  delivery: z.enum(["inline", "artifact"]).default("inline"),
});
const resultSchema = z.strictObject({
  content: z.string(),
  filename: z.string(),
  uid: z.string(),
  dtstamp: z.string(),
  warnings: z.array(z.string()),
  timeZoneTransitions: z.number().int().min(0),
});
const artifactSchema = z.strictObject({
  mode: z.literal("artifact"),
  filename: z.string(),
  uid: z.string(),
  dtstamp: z.string(),
  warnings: z.array(z.string()),
  timeZoneTransitions: z.number().int().min(0),
  artifact: z.strictObject({
    id: z.string(),
    bytes: z.number(),
    mimeType: z.string(),
    filename: z.string(),
    expiresAt: z.number(),
    path: z.string().optional(),
    downloadUrl: z.string().optional(),
  }),
});
let active = 0;
export const icalEventOperation: Operation = {
  id: "ical-event-generator",
  name: "tooltab_ical_event_generator",
  description:
    "Generate a complete local iCalendar VEVENT with UID, date/time or inclusive all-day end date, IANA UTC/TZID output, recurrence and multiple DISPLAY reminders. TZID includes complete offset observances for years0001–9999 from runtime time-zone data. No invitations, calendar import or live notifications. Event text8MiB, safe standard recurrence integers, reminders1000. Inline JSON256KiB; use explicit delivery artifact for larger calendars such as full TZID definitions. No implicit persistence of private event content.",
  inputSchema: icalEventSchema,
  outputSchema: z.union([resultSchema, artifactSchema]),
  bodyLimit: 51000000,
  idempotent: false,
  async run(value, signal, context) {
    const p = icalEventSchema.parse(value),
      abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    if (active >= 2) throw new IcalError("busy");
    active++;
    let saved: string | undefined;
    try {
      const result = await runIcal(
        p.event,
        p.nowMs ?? Date.now(),
        abort,
        import.meta.env.PROD
          ? () =>
              new Worker(
                serviceWorkerUrl(
                  "ical-event-generator-worker",
                  import.meta.url,
                ),
                { type: "module" },
              )
          : undefined,
      );
      if (p.delivery === "inline") {
        if (
          result.content.length > 262144 ||
          new TextEncoder().encode(JSON.stringify(result)).length > 262144
        )
          throw new IcalError("artifact_required");
        return result;
      }
      if (!context) throw new IcalError("artifact_required");
      async function* source() {
        for (let cursor = 0; cursor < result.content.length; ) {
          abort.throwIfAborted();
          let end = Math.min(cursor + 65536, result.content.length);
          if (
            end < result.content.length &&
            result.content.charCodeAt(end - 1) >= 0xd800 &&
            result.content.charCodeAt(end - 1) <= 0xdbff
          )
            end--;
          yield new TextEncoder().encode(result.content.slice(cursor, end));
          cursor = end;
        }
      }
      const record = await context.artifacts.write(
        source(),
        {
          filename: result.filename,
          mimeType: "text/calendar;charset=utf-8",
          limit: 128 * 1024 * 1024,
        },
        abort,
      );
      saved = record.id;
      abort.throwIfAborted();
      const { id, bytes, mimeType, filename, expiresAt } = record;
      return {
        mode: "artifact",
        filename,
        uid: result.uid,
        dtstamp: result.dtstamp,
        warnings: result.warnings,
        timeZoneTransitions: result.timeZoneTransitions,
        artifact: {
          id,
          bytes,
          mimeType,
          filename,
          expiresAt,
          ...(context.transport === "mcp"
            ? { path: record.path }
            : { downloadUrl: `/api/v1/artifacts/${id}` }),
        },
      };
    } catch (error) {
      if (saved && context) await context.artifacts.remove(saved);
      throw error;
    } finally {
      active--;
    }
  },
};
