export const featuredToolIds = [
  "json-formatter",
  "uuid-v4-generator",
  "base64-encoder-decoder",
  "unix-timestamp-converter",
  "random-password-generator",
  "qr-code-generator",
  "image-resizer",
  "color-picker",
] as const;

export interface PopularToolsResult {
  toolIds: string[];
  source: "cloudflare" | "fallback";
}
