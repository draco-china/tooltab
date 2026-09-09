import { Temporal } from "@js-temporal/polyfill";
import { type QrContentInput, QrError, qrContentSchema } from "./qr-contract";

const escapeField = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/[;:,]/g, (c) => `\\${c}`);
const calendarText = (value: string) => escapeField(value).replace(/\\:/g, ":");
function date(value: string) {
  if (!value) return "";
  try {
    const instant = /[zZ]|[+-]\d\d:\d\d$/.test(value)
      ? Temporal.Instant.from(value)
      : Temporal.PlainDateTime.from(value)
          .toZonedDateTime(Temporal.Now.timeZoneId(), {
            disambiguation: "reject",
          })
          .toInstant();
    return instant.toString({ smallestUnit: "second" }).replace(/[-:]/g, "");
  } catch {
    throw new QrError("invalid_date");
  }
}
export function qrPayload(raw: QrContentInput) {
  const c = qrContentSchema.parse(raw);
  let payload = "";
  switch (c.type) {
    case "text":
      payload = c.text;
      break;
    case "phone":
      if (c.phone.trim()) payload = `tel:${c.phone.trim()}`;
      break;
    case "sms":
      if (c.phone.trim())
        payload = `sms:${c.phone.trim()}${c.message ? `?body=${encodeURIComponent(c.message)}` : ""}`;
      break;
    case "email": {
      if (!c.to.trim()) break;
      const p = new URLSearchParams();
      if (c.subject) p.set("subject", c.subject);
      if (c.body) p.set("body", c.body);
      payload = `mailto:${c.to.trim()}${p.size ? `?${p}` : ""}`;
      break;
    }
    case "wifi":
      if (c.ssid.trim())
        payload = `WIFI:T:${c.security};S:${escapeField(c.ssid)};${c.security !== "nopass" && c.password ? `P:${escapeField(c.password)};` : ""}${c.hidden ? "H:true;" : ""};`;
      break;
    case "contact": {
      const { type: _, ...fields } = c;
      if (!Object.values(fields).some((x) => x.trim())) break;
      const name =
        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
        c.organization ||
        c.email ||
        c.phone;
      payload = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escapeField(c.lastName)};${escapeField(c.firstName)};;;`,
        name && `FN:${escapeField(name)}`,
        c.organization && `ORG:${escapeField(c.organization)}`,
        c.title && `TITLE:${escapeField(c.title)}`,
        c.phone && `TEL;TYPE=CELL:${escapeField(c.phone)}`,
        c.email && `EMAIL:${escapeField(c.email)}`,
        c.website && `URL:${escapeField(c.website)}`,
        c.address && `ADR:;;${escapeField(c.address)};;;;`,
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\n");
      break;
    }
    case "location": {
      if (!c.latitude.trim() || !c.longitude.trim()) break;
      const lat = Number(c.latitude),
        lon = Number(c.longitude),
        alt = c.altitude.trim();
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180 ||
        (alt && !Number.isFinite(Number(alt)))
      )
        throw new QrError("invalid_location");
      payload = `geo:${lat},${lon}${alt ? `,${alt}` : ""}`;
      break;
    }
    case "calendar": {
      if (!c.title.trim() && !c.start.trim()) break;
      const start = date(c.start),
        end = date(c.end);
      payload = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ToolTab//QR Generator//EN",
        "BEGIN:VEVENT",
        c.title && `SUMMARY:${calendarText(c.title)}`,
        c.location && `LOCATION:${calendarText(c.location)}`,
        c.description && `DESCRIPTION:${calendarText(c.description)}`,
        start && `DTSTART:${start}`,
        end && `DTEND:${end}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ]
        .filter(Boolean)
        .join("\n");
      break;
    }
  }
  if (!payload.trim()) throw new QrError("missing_content");
  return payload;
}
export function classifyQr(data: string) {
  const value = data.trim();
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:")
      return { kind: "url", href: url.href };
  } catch {
    if (
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/?#][^\s]*)?$/i.test(
        value,
      )
    )
      return { kind: "url", href: `https://${value}` };
  }
  for (const [prefix, kind] of [
    ["mailto:", "email"],
    ["tel:", "phone"],
    ["sms:", "sms"],
    ["geo:", "location"],
  ] as const)
    if (value.toLowerCase().startsWith(prefix) && !/[\r\n]/.test(value))
      return { kind, href: value };
  for (const [prefix, kind] of [
    ["WIFI:", "wifi"],
    ["BEGIN:VCARD", "vcard"],
    ["BEGIN:VCALENDAR", "calendar"],
  ])
    if (value.toUpperCase().startsWith(prefix)) return { kind, href: null };
  return { kind: "text", href: null };
}
