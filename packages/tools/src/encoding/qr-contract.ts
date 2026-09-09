import { z } from "zod";

const text = z
  .string()
  .max(10000)
  .refine((s) => !/[\p{Cs}]/u.test(s), "invalid_unicode");
export const qrTypes = [
  "text",
  "wifi",
  "contact",
  "sms",
  "phone",
  "email",
  "location",
  "calendar",
] as const;
export const qrOptionsSchema = z.strictObject({
  darkColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#111827"),
  lightColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#ffffff"),
  errorCorrectionLevel: z.enum(["L", "M", "Q", "H"]).default("M"),
  margin: z.number().int().min(0).max(12).default(2),
  size: z.number().int().min(128).max(1024).default(320),
});
export const qrContentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text }),
  z.strictObject({
    type: z.literal("wifi"),
    ssid: text,
    password: text.default(""),
    security: z.enum(["WPA", "WEP", "nopass"]).default("WPA"),
    hidden: z.boolean().default(false),
  }),
  z.strictObject({
    type: z.literal("contact"),
    firstName: text.default(""),
    lastName: text.default(""),
    organization: text.default(""),
    title: text.default(""),
    phone: text.default(""),
    email: text.default(""),
    website: text.default(""),
    address: text.default(""),
  }),
  z.strictObject({
    type: z.literal("sms"),
    phone: text,
    message: text.default(""),
  }),
  z.strictObject({ type: z.literal("phone"), phone: text }),
  z.strictObject({
    type: z.literal("email"),
    to: text,
    subject: text.default(""),
    body: text.default(""),
  }),
  z.strictObject({
    type: z.literal("location"),
    latitude: text,
    longitude: text,
    altitude: text.default(""),
  }),
  z.strictObject({
    type: z.literal("calendar"),
    title: text.default(""),
    start: text.default(""),
    end: text.default(""),
    description: text.default(""),
    location: text.default(""),
  }),
]);
export type QrContentInput = z.input<typeof qrContentSchema>;
export type QrContent = z.output<typeof qrContentSchema>;
export type QrOptionsInput = z.input<typeof qrOptionsSchema>;
export type QrOptions = z.output<typeof qrOptionsSchema>;
export type QrFormat = "png" | "jpeg" | "webp" | "svg";
export const QR_IMAGE_LIMIT = 32 * 1024 * 1024,
  QR_PIXEL_LIMIT = 32 * 1024 * 1024;
export class QrError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "missing_content"
      | "invalid_date"
      | "invalid_location"
      | "capacity"
      | "too_large"
      | "unsupported"
      | "decode_failed"
      | "timeout"
      | "busy",
    message: string = code,
  ) {
    super(message);
    this.name = "QrError";
  }
}
export type QrMatrix = {
  payload: string;
  modules: Uint8Array;
  count: number;
  svg: string;
};
export type QrReadResult = {
  data: string;
  width: number;
  height: number;
  kind: string;
  href: string | null;
} | null;
