import { Temporal } from "@js-temporal/polyfill";
import {
  type IcalOptions,
  newIcalUid,
  WEEKDAYS,
} from "@workspace/tools/time/ical-contract";
export function initialIcal(nowMs = Date.now(), timeZone = "UTC"): IcalOptions {
  const current =
      Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(
        timeZone,
      ),
    minute = Math.ceil(current.minute / 30) * 30,
    start = current
      .with({
        minute: 0,
        second: 0,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
      })
      .add({ minutes: minute }),
    end = start.add({ hours: 1 }),
    until = start.add({ months: 1 });
  const localTime = (d: Temporal.ZonedDateTime) =>
    `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`;
  return {
    summary: "",
    location: "",
    url: "",
    notes: "",
    uid: newIcalUid(),
    allDay: false,
    timeZone,
    outputMode: "utc",
    startDate: start.toPlainDate().toString(),
    startTime: localTime(start),
    endDate: end.toPlainDate().toString(),
    endTime: localTime(end),
    disambiguation: "reject",
    frequency: "none",
    interval: 1,
    weekdays: [WEEKDAYS[start.dayOfWeek - 1] ?? "MO"],
    monthDay: start.day,
    month: start.month,
    endMode: "never",
    count: 10,
    untilDate: until.toPlainDate().toString(),
    untilTime: localTime(until),
    remindersEnabled: false,
    reminders: [{ id: newIcalUid(), amount: 15, unit: "minutes" }],
  };
}
