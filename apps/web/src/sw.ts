/// <reference lib="webworker" />

import settings from "../project.inlang/settings.json" with { type: "json" };
import toolIds from "./features/tools/catalog/ids.json";

// The injected list is an allowlist/version, not an eager download list.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision?: string | null }[];
};

const assets = self.__WB_MANIFEST;
const paths = new Set(
  assets.map((entry) => new URL(entry.url, self.location.origin).pathname),
);
let version = 0;
for (const character of JSON.stringify(assets))
  version = ((version << 5) - version + character.charCodeAt(0)) | 0;
const cacheName = `tooltab-${version}`;
const { baseLocale, locales } = settings;
const pages = new Set(
  locales.flatMap((locale) =>
    [
      "",
      "/tools",
      "/api",
      "/mcp",
      "/privacy",
      "/terms",
      ...toolIds.map((id) => `/tools/${id}`),
    ].map((path) =>
      locale === baseLocale ? path || "/" : `/${locale}${path}`,
    ),
  ),
);
const apiPages = new Set(
  locales.map((locale) => (locale === baseLocale ? "/api" : `/${locale}/api`)),
);
const publicDocuments = new Set(["/api/v1/openapi.yaml"]);
const shellImportGraph = "/app-shell-imports.json";
function isContentPage(path: string) {
  return pages.has(path === "/" ? path : path.replace(/\/$/, ""));
}

const resourceRequests = new Map<string, Promise<Response>>();
function cacheResource(path: string) {
  const current = resourceRequests.get(path);
  if (current) return current;
  const request = (async () => {
    let cache: Cache | undefined;
    try {
      cache = await caches.open(cacheName);
      const cached = await cache.match(path);
      if (cached) return cached;
    } catch {
      // Storage denial must not break an online tool.
    }
    const response = await fetch(path, { credentials: "omit" });
    if (response.ok && response.type !== "opaque" && cache) {
      try {
        await cache.put(path, response.clone());
      } catch {
        // Quota exhaustion must not break an online tool.
      }
    }
    return response;
  })().finally(() => resourceRequests.delete(path));
  resourceRequests.set(path, request);
  return request;
}
let shellReady: Promise<void> | undefined;
function staticShellResources(resources: Set<string>, imports: unknown) {
  if (!imports || typeof imports !== "object") return;
  const graph = imports as Record<string, unknown>;
  const pending = [...resources];
  while (pending.length) {
    const path = pending.pop();
    if (!path) continue;
    const dependencies = graph[path];
    if (!Array.isArray(dependencies)) continue;
    for (const dependency of dependencies) {
      if (
        typeof dependency === "string" &&
        paths.has(dependency) &&
        !resources.has(dependency)
      ) {
        resources.add(dependency);
        pending.push(dependency);
      }
    }
  }
}
function cacheShell() {
  // The home shell is cached from any first visit. Its generated Rollup graph
  // adds only transitive static imports; lazy tool chunks remain on demand.
  shellReady ??= (async () => {
    const response = await cacheResource("/");
    if (!response.ok) throw new Error("App shell unavailable");
    const html = await response.text();
    const resources = new Set<string>();
    for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      const resource = match[1];
      if (resource && paths.has(resource)) resources.add(resource);
    }
    const graphResponse = await cacheResource(shellImportGraph);
    if (!graphResponse.ok)
      throw new Error("App shell import graph unavailable");
    staticShellResources(resources, await graphResponse.json());
    await Promise.all(
      [...resources].map(async (path) => {
        if (!(await cacheResource(path)).ok)
          throw new Error("App shell resource unavailable");
      }),
    );
  })().catch((error) => {
    shellReady = undefined;
    throw error;
  });
  return shellReady;
}
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("tooltab-") && name !== cacheName)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type !== "CACHE_PAGE") return;
  const page = event.data.path;
  const loaded: unknown[] = Array.isArray(event.data.assets)
    ? event.data.assets
    : [];
  const safePaths = loaded.filter(
    (path: unknown): path is string =>
      typeof path === "string" && paths.has(path),
  );
  if (typeof page === "string" && isContentPage(page)) safePaths.push(page);
  if (typeof page === "string" && apiPages.has(page))
    safePaths.push(...publicDocuments);
  // Only known app resources and fixed content routes; no query, hash or user data.
  event.waitUntil(
    Promise.allSettled([
      cacheShell(),
      ...[...new Set(safePaths)].map(cacheResource),
    ]),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const isPage = isContentPage(url.pathname);
  const isPublicDocument = publicDocuments.has(url.pathname);
  if (!isPage && !isPublicDocument && (!paths.has(url.pathname) || url.search))
    return;
  event.respondWith(
    (async () => {
      let cached: Response | undefined;
      try {
        const cache = await caches.open(cacheName);
        cached = await cache.match(url.pathname);
      } catch {
        // A browser may deny cache access while normal requests still work.
      }
      if (!isPage && cached) return cached;
      try {
        return await cacheResource(url.pathname);
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
