export const ICAL_MAX_INPUT = 8 * 1024 * 1024;
export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export type IcalReminder = {
  id: string;
  amount: number;
  unit: "minutes" | "hours" | "days" | "weeks";
};

export type IcalOptions = {
  summary: string;
  location: string;
  url: string;
  notes: string;
  uid: string;
  allDay: boolean;
  timeZone: string;
  outputMode: "utc" | "tzid";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  disambiguation: "reject" | "compatible" | "earlier" | "later";
  frequency: "none" | "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  weekdays: (typeof WEEKDAYS)[number][];
  monthDay: number;
  month: number;
  endMode: "never" | "count" | "until";
  count: number;
  untilDate: string;
  untilTime: string;
  remindersEnabled: boolean;
  reminders: IcalReminder[];
};

export type IcalResult = {
  content: string;
  filename: string;
  uid: string;
  dtstamp: string;
  warnings: string[];
  timeZoneTransitions: number;
};

export class IcalError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "IcalError";
  }
}

export function newIcalUid() {
  return `${crypto.randomUUID()}@tooltab.local`;
}
