export function normalizeSiteOrigin(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VITE_BASE_URL must be an HTTP(S) origin without credentials, a path, query or fragment.",
    );
  }
  return url.origin;
}

export function siteOrigin(fallback = "http://localhost:3000") {
  return normalizeSiteOrigin(import.meta.env.VITE_BASE_URL || fallback);
}

export function apiOrigin(fallback = "https://tooltab.example") {
  return normalizeSiteOrigin(import.meta.env.VITE_BASE_URL || fallback);
}
