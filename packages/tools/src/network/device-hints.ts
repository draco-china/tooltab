export type DeviceHintBrand = Readonly<{ brand: string }>;

export function detectBrowser(
  userAgent: string,
  brands: readonly DeviceHintBrand[] = [],
) {
  const source =
    `${userAgent} ${brands.map((brand) => brand.brand).join(" ")}`.toLowerCase();
  if (source.includes("edg/") || source.includes("microsoft edge"))
    return "Edge";
  if (source.includes("opr/") || source.includes("opera")) return "Opera";
  if (source.includes("firefox/")) return "Firefox";
  if (
    source.includes("chrome/") ||
    source.includes("crios/") ||
    source.includes("google chrome")
  )
    return "Chrome";
  if (source.includes("safari/")) return "Safari";
  return undefined;
}

export function architecture(userAgent: string, explicit?: string) {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const value = userAgent.toLowerCase();
  if (value.includes("aarch64") || value.includes("arm64")) return "ARM64";
  if (/\barm/.test(value)) return "ARM";
  if (
    value.includes("x86_64") ||
    value.includes("x64") ||
    value.includes("win64")
  )
    return "x86_64";
  if (value.includes("i686") || value.includes("i386") || value.includes("x86"))
    return "x86";
  return undefined;
}
