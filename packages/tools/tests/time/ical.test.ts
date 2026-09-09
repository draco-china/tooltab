import ICAL from "ical.js";
import { Temporal } from "@js-temporal/polyfill";
import { expect, it } from "vitest";
import { generateIcal, icalOptionsSchema } from "../../src/time/ical";
import { type IcalOptions, ICAL_MAX_INPUT } from "../../src/time/ical-contract";
import {
  buildVtimezone,
  formatVtimezone,
  dateTimeValue,
  dateValue,
} from "../../src/time/ical-timezone";

const stamp = Date.UTC(2026, 0, 1);
const options = (extra: Record<string, unknown> = {}) =>
  icalOptionsSchema.parse({
    startDate: "2026-03-01",
    endDate: "2026-03-01",
    uid: "synthetic@tooltab.test",
    ...extra,
  });
const event = (text: string) => {
  const result = new ICAL.Component(ICAL.parse(text)).getFirstSubcomponent(
    "vevent",
  );
  if (!result) throw Error("Missing event");
  return result;
};

it("formats calendar values and evicts the oldest real timezone cache entry", () => {
  expect(dateValue({ year: 9, month: 2, day: 3 })).toBe("00090203");
  expect(
    dateTimeValue({ year: 9, month: 2, day: 3, hour: 4, minute: 5, second: 6 }),
  ).toBe("00090203T040506");

  const zones = [
    "Etc/GMT+1",
    "Etc/GMT+2",
    "Etc/GMT+3",
    "Etc/GMT+4",
    "Etc/GMT+5",
    "Etc/GMT+6",
    "Etc/GMT+7",
    "Etc/GMT+8",
    "Etc/GMT+9",
  ];
  const first = buildVtimezone(zones[0]);
  expect(buildVtimezone(zones[0])).toBe(first);
  for (const zone of zones.slice(1))
    expect(buildVtimezone(zone).lines[1]).toBe(`TZID:${zone}`);
  expect(buildVtimezone(zones[0])).not.toBe(first);
  expect(buildVtimezone("America/New_York").lines).toContain(
    "TZOFFSETFROM:-045602",
  );
});
it("RFC5545 UTF8 folding and escaping preserve exact text and exclusive all-day end", () => {
  const title = "中文 😀,;\\\n".repeat(60);
  const result = generateIcal(
    options({ summary: title, allDay: true, endDate: "2026-03-02" }),
    stamp,
  );
  expect(
    result.content
      .split("\r\n")
      .every((line) => new TextEncoder().encode(line).length <= 75),
  ).toBe(true);
  expect(result.content.replaceAll("\r\n", "").includes("\n")).toBe(false);
  const e = event(result.content);
  expect(e.getFirstPropertyValue("summary")).toBe(title);
  expect(e.getFirstPropertyValue("dtend")?.toString()).toBe("2026-03-03");
  expect(e.getFirstPropertyValue("dtstamp")?.toString()).toBe(
    "2026-01-01T00:00:00Z",
  );
});
it("retains all recurrence branches, count/until and four reminder units", () => {
  for (const frequency of ["daily", "weekly", "monthly", "yearly"]) {
    const result = generateIcal(
      options({
        frequency,
        interval: 2,
        weekdays: ["MO", "WE"],
        monthDay: 15,
        month: 4,
        endMode: "count",
        count: 9,
        remindersEnabled: true,
        reminders: ["minutes", "hours", "days", "weeks"].map((unit) => ({
          amount: 2,
          unit,
        })),
      }),
      stamp,
    );
    expect(result.content).toContain(
      `FREQ=${frequency.toUpperCase()};INTERVAL=2`,
    );
    expect(result.content).toContain("COUNT=9");
    expect(event(result.content).getAllSubcomponents("valarm")).toHaveLength(4);
  }
  expect(
    generateIcal(
      options({
        allDay: true,
        frequency: "daily",
        endMode: "until",
        untilDate: "2026-04-01",
      }),
      stamp,
    ).content,
  ).toContain("UNTIL=20260401");
  expect(
    generateIcal(
      options({
        frequency: "daily",
        endMode: "until",
        untilDate: "2026-04-01",
        untilTime: "10:00",
        timeZone: "Asia/Shanghai",
      }),
      stamp,
    ).content,
  ).toContain("UNTIL=20260401T020000Z");
});
it("explicit DST rejection, gap normalization and later-fold UTC encoding", () => {
  const gap = options({
    timeZone: "America/New_York",
    startDate: "2026-03-08",
    endDate: "2026-03-08",
    startTime: "02:30",
    endTime: "04:30",
  });
  expect(() => generateIcal(gap, stamp)).toThrow("ambiguous_time");
  expect(
    generateIcal({ ...gap, disambiguation: "compatible" }, stamp).warnings,
  ).toContain("adjusted_time");
  const fold = {
    ...gap,
    startDate: "2026-11-01",
    endDate: "2026-11-01",
    startTime: "01:30",
    endTime: "03:00",
    disambiguation: "later" as const,
  };
  expect(generateIcal(fold, stamp).content).toContain(
    "DTSTART:20261101T063000Z",
  );
  expect(() => generateIcal({ ...fold, outputMode: "tzid" }, stamp)).toThrow(
    "fold_tzid",
  );
});
it("complete VTIMEZONE has historical, current and year9999 offsets independently parsed", () => {
  const result = generateIcal(
    options({ timeZone: "America/New_York", outputMode: "tzid" }),
    stamp,
  );
  const comp = new ICAL.Component(ICAL.parse(result.content));
  const component = comp.getFirstSubcomponent("vtimezone");
  if (!component) throw Error("Missing timezone");
  const zone = new ICAL.Timezone({ component });
  for (const [date, offset] of [
    ["1970-03-20T12:00:00", -18000],
    ["2026-07-01T12:00:00", -14400],
    ["9999-12-01T12:00:00", -18000],
  ] as const) {
    const time = ICAL.Time.fromDateTimeString(date);
    expect(zone.utcOffset(time)).toBe(offset);
  }
  expect(result.content).toContain("TZOFFSETFROM:-045602");
  expect(result.timeZoneTransitions).toBeGreaterThan(16000);
}, 15000);
it("rejects injection, malformed dates, invalid recurrence and calendar overflow", () => {
  for (const extra of [
    { uid: "x\r\nBEGIN:VEVENT" },
    { notes: "\ud800" },
    { startDate: "2026-02-30" },
    { startTime: "25:00" },
    { url: "https://a.test/\nATTACH:x" },
    { allDay: true, endDate: "9999-12-31" },
    { endDate: "2025-01-01" },
  ])
    expect(() => generateIcal(options(extra), stamp)).toThrow();
  expect(
    icalOptionsSchema.safeParse({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      interval: 0,
    }).success,
  ).toBe(false);
});

it.each([
  [{ startDate: "2026-3-01" }, "invalid_date"],
  [{ startDate: "0000-01-01" }, "invalid_date"],
  [{ startTime: "9:00" }, "invalid_time"],
  [{ uid: " " }, "invalid_uid"],
  [{ uid: "x".repeat(1025) }, "invalid_uid"],
  [{ uid: "x\t" }, "invalid_uid"],
  [{ summary: "\u007f" }, "invalid_unicode"],
  [{ summary: "\u0001" }, "invalid_unicode"],
  [{ url: "not-a-url" }, "invalid_url"],
  [{ frequency: "hourly" }, "invalid_recurrence"],
  [{ interval: 0 }, "invalid_recurrence"],
  [{ interval: 1.5 }, "invalid_recurrence"],
  [{ interval: 2147483648 }, "invalid_recurrence"],
  [{ count: 0 }, "invalid_recurrence"],
  [{ month: 13 }, "invalid_recurrence"],
  [{ monthDay: 32 }, "invalid_recurrence"],
  [{ weekdays: Array(8).fill("MO") }, "invalid_recurrence"],
  [{ weekdays: ["XX"] }, "invalid_recurrence"],
  [{ endMode: "unknown" }, "invalid_recurrence"],
  [
    { reminders: Array(1001).fill({ id: "r", amount: 1, unit: "minutes" }) },
    "invalid_reminders",
  ],
  [
    { reminders: [{ id: "r", amount: 0, unit: "minutes" }] },
    "invalid_reminders",
  ],
  [
    { reminders: [{ id: "r", amount: 1, unit: "months" }] },
    "invalid_reminders",
  ],
  [{ outputMode: "local" }, "invalid_time"],
  [{ disambiguation: "unknown" }, "invalid_time"],
  [{ timeZone: "bad zone" }, "invalid_zone"],
  [{ timeZone: "Unknown/Zone" }, "invalid_zone"],
  [{ allDay: true, endDate: "2026-02-28" }, "end_before_start"],
  [
    {
      frequency: "daily",
      endMode: "until",
      untilDate: "2026-02-28",
      untilTime: "10:00",
    },
    "until_before_start",
  ],
  [
    {
      allDay: true,
      frequency: "daily",
      endMode: "until",
      untilDate: "2026-02-28",
    },
    "until_before_start",
  ],
] as const)("validates direct core inputs %j", (patch, code) => {
  expect(() =>
    generateIcal({ ...options(), ...patch } as IcalOptions, stamp),
  ).toThrow(code);
});

it("rejects unsafe or out-of-calendar timestamps and aggregate UTF8 input overflow", () => {
  for (const now of [
    NaN,
    Infinity,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    -62135596800001,
    253402300800000,
    Number.MAX_SAFE_INTEGER,
  ]) {
    expect(() => generateIcal(options(), now)).toThrow("invalid_date");
  }
  expect(() =>
    generateIcal({ ...options(), notes: "x".repeat(ICAL_MAX_INPUT) }, stamp),
  ).toThrow("too_large");
});

it("retains optional fields, fallback filenames and default reminder descriptions", () => {
  const result = generateIcal(
    options({
      summary: "",
      notes: "note",
      location: "Room, A",
      url: "https://example.test",
      remindersEnabled: true,
    }),
    stamp,
  );
  const parsed = event(result.content);
  expect(parsed.getFirstPropertyValue("location")).toBe("Room, A");
  expect(parsed.getFirstPropertyValue("description")).toBe("note");
  expect(parsed.getFirstPropertyValue("url")).toBe("https://example.test/");
  expect(
    parsed.getFirstSubcomponent("valarm")?.getFirstPropertyValue("description"),
  ).toBe("Reminder");
  expect(result.filename).toBe("event.ics");
});

it("serializes fixed positive and negative offsets through cache reuse and eviction", () => {
  const inputs = [
    ["UTC", 0],
    ["Etc/GMT+1", -3600],
    ["Etc/GMT+2", -7200],
    ["Etc/GMT+3", -10800],
    ["Etc/GMT+4", -14400],
    ["Etc/GMT+5", -18000],
    ["Etc/GMT+6", -21600],
    ["Etc/GMT+7", -25200],
    ["Etc/GMT-5", 18000],
  ] as const;
  for (let pass = 0; pass < 2; pass++) {
    for (const [timeZone, offset] of inputs) {
      const input = options({ timeZone, outputMode: "tzid" });
      const first = generateIcal(input, stamp);
      expect(generateIcal(input, stamp)).toEqual(first);
      expect(first.timeZoneTransitions).toBe(0);
      const component = new ICAL.Component(
        ICAL.parse(first.content),
      ).getFirstSubcomponent("vtimezone");
      expect(component).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
      const zone = new ICAL.Timezone({ component: component! });
      expect(
        zone.utcOffset(ICAL.Time.fromDateTimeString("2026-06-01T12:00:00")),
      ).toBe(offset);
      first.warnings.push("caller-local");
      expect(generateIcal(input, stamp).warnings).not.toContain("caller-local");
    }
  }
});

it("preserves two-byte UTF8 text when folding and rejects UTC year underflow", () => {
  const title = "é".repeat(100);
  const result = generateIcal(options({ summary: title }), stamp);
  expect(event(result.content).getFirstPropertyValue("summary")).toBe(title);
  expect(
    result.content
      .split("\r\n")
      .every((line) => new TextEncoder().encode(line).length <= 75),
  ).toBe(true);
  expect(() =>
    generateIcal(
      options({
        startDate: "0001-01-01",
        endDate: "0001-01-01",
        startTime: "00:00",
        endTime: "01:00",
        timeZone: "Etc/GMT-1",
      }),
      stamp,
    ),
  ).toThrow("invalid_date");
});

it("rejects expanded reminder output beyond the calendar limit", () => {
  const input = options({
    summary: "x".repeat(34000),
    remindersEnabled: true,
    reminders: Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      amount: index + 1,
      unit: "minutes",
    })),
  });
  expect(() => generateIcal(input, stamp)).toThrow("output_too_large");
});

it("accepts unambiguous later TZID times and distinguishes yearly month mismatches", () => {
  const regular = generateIcal(
    options({ outputMode: "tzid", disambiguation: "later" }),
    stamp,
  );
  expect(regular.content).toContain("DTSTART;TZID=UTC:20260301T090000");
  expect(regular.warnings).toEqual([]);
  const matching = options({ frequency: "yearly", monthDay: 1, month: 3 });
  expect(generateIcal(matching, stamp).warnings).not.toContain(
    "start_rule_mismatch",
  );
  expect(generateIcal({ ...matching, month: 4 }, stamp).warnings).toContain(
    "start_rule_mismatch",
  );
});

it("rejects reminder output that crosses the limit only after line folding", () => {
  const input = options({
    summary: "x".repeat(33000),
    remindersEnabled: true,
    reminders: Array.from({ length: 1000 }, () => ({
      id: "fold",
      amount: 1,
      unit: "minutes",
    })),
  });
  expect(() => generateIcal(input, stamp)).toThrow("output_too_large");
});

it.each([
  ["0001-01-01", "MO"],
  ["2000-02-29", "TU"],
  ["2400-02-29", "TU"],
  ["9999-12-30", "TH"],
  ["2026-03-02", "MO"],
  ["2026-03-03", "TU"],
  ["2026-03-04", "WE"],
  ["2026-03-05", "TH"],
  ["2026-03-06", "FR"],
  ["2026-03-07", "SA"],
  ["2026-03-08", "SU"],
])(
  "weekly recurrence on %s preserves BYDAY and diagnoses a mismatched start",
  (date, weekday) => {
    for (const selected of ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]) {
      const result = generateIcal(
        options({
          startDate: date,
          endDate: date,
          allDay: true,
          frequency: "weekly",
          weekdays: [selected],
        }),
        stamp,
      );
      expect(result.warnings.includes("start_rule_mismatch")).toBe(
        selected !== weekday,
      );
      const recurrence = event(result.content).getFirstPropertyValue(
        "rrule",
      ) as ICAL.Recur;
      expect(recurrence.getComponent("BYDAY")).toEqual([selected]);
      expect(recurrence.freq).toBe("WEEKLY");
    }
    const unrestricted = generateIcal(
      options({
        startDate: date,
        endDate: date,
        allDay: true,
        frequency: "weekly",
        weekdays: [],
      }),
      stamp,
    );
    expect(unrestricted.warnings).not.toContain("start_rule_mismatch");
    expect(unrestricted.content).not.toContain("BYDAY=");
  },
);

it("uses the actual pre-epoch event start for inclusive UNTIL validation", () => {
  const base = {
    startDate: "1960-01-01",
    endDate: "1960-01-01",
    startTime: "10:00",
    endTime: "11:00",
    timeZone: "UTC",
    allDay: false,
    frequency: "daily",
    endMode: "until",
    untilDate: "1960-01-01",
  };
  for (const untilTime of ["10:00", "10:01"]) {
    const result = generateIcal(options({ ...base, untilTime }), stamp);
    const recurrence = event(result.content).getFirstPropertyValue(
      "rrule",
    ) as ICAL.Recur;
    expect(recurrence.until?.toString()).toBe(`1960-01-01T${untilTime}:00Z`);
  }
  expect(() =>
    generateIcal(options({ ...base, untilTime: "09:59" }), stamp),
  ).toThrow("until_before_start");
});

it("protects cached timezone observances from mutation by a previous caller", () => {
  const zone = buildVtimezone("Etc/GMT+3");
  const expected = [...zone.lines];
  expect(Reflect.set(zone.lines, 1, "TZID:corrupted")).toBe(false);
  expect(Reflect.set(zone, "transitions", 123)).toBe(false);
  expect(Reflect.set(zone, "lines", [])).toBe(false);
  expect(buildVtimezone("Etc/GMT+3")).toBe(zone);
  expect(zone.lines).toEqual(expected);
  const result = generateIcal(
    options({ timeZone: "Etc/GMT+3", outputMode: "tzid" }),
    stamp,
  );
  const calendar = new ICAL.Component(ICAL.parse(result.content));
  const timezone = calendar.getFirstSubcomponent("vtimezone");
  expect(timezone?.getFirstPropertyValue("tzid")).toBe("Etc/GMT+3");
  expect(result.content).not.toContain("corrupted");
});

it("keeps observance years within the four-digit calendar range", () => {
  const hour = 3600e9;
  const result = formatVtimezone("Boundary", 0, [
    {
      instant: Temporal.Instant.from("0001-01-01T00:00:00Z"),
      offsetBefore: -hour,
      offsetAfter: 0,
    },
    {
      instant: Temporal.Instant.from("9999-12-31T23:00:00Z"),
      offsetBefore: hour,
      offsetAfter: 0,
    },
    {
      instant: Temporal.Instant.from("0001-01-01T00:00:00Z"),
      offsetBefore: 0,
      offsetAfter: hour,
    },
    {
      instant: Temporal.Instant.from("9999-12-31T23:00:00Z"),
      offsetBefore: 0,
      offsetAfter: hour,
    },
  ]);
  expect(result.transitions).toBe(4);
  expect(result.lines.filter((line) => line.startsWith("RDATE:"))).toEqual([
    "RDATE:00010101T000000",
    "RDATE:99991231T230000",
  ]);
});

it("accepts the transition capacity boundary and closes an over-capacity input", () => {
  const start = Temporal.Instant.from("2026-01-01T00:00:00Z");
  let closed = 0;
  function* changes(count: number) {
    try {
      for (let index = 0; index < count; index++)
        yield {
          instant: start.add({ seconds: index }),
          offsetBefore: index % 2 ? 3600e9 : 0,
          offsetAfter: index % 2 ? 0 : 3600e9,
        };
    } finally {
      closed++;
    }
  }
  const result = formatVtimezone("Capacity", 0, changes(100000));
  expect(result.transitions).toBe(100000);
  expect(result.lines.filter((line) => line.startsWith("RDATE:"))).toHaveLength(
    100000,
  );
  expect(() => formatVtimezone("Capacity", 0, changes(100001))).toThrow(
    expect.objectContaining({ code: "zone_capacity" }),
  );
  expect(closed).toBe(2);
}, 30000);
