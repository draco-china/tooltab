import toolIds from "@/features/tools/catalog/ids.json" with { type: "json" };
import { featuredToolIds, type PopularToolsResult } from "@/lib/popular-tools";

const endpoint = "https://api.cloudflare.com/client/v4/graphql";
const cacheTtlMs = 60 * 60 * 1000;
const fallbackCacheTtlMs = 5 * 60 * 1000;
const requestTimeoutMs = 5_000;
const maximumResults = featuredToolIds.length;
const validToolIds = new Set<string>(toolIds);

const query = `query PopularTools($zoneTag: string, $start: Time, $end: Time, $basePath: string, $englishPath: string) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      basePaths: httpRequestsAdaptiveGroups(
        limit: 1000
        orderBy: [count_DESC]
        filter: { datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball", clientRequestPath_like: $basePath }
      ) {
        count
        dimensions { clientRequestPath }
      }
      englishPaths: httpRequestsAdaptiveGroups(
        limit: 1000
        orderBy: [count_DESC]
        filter: { datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball", clientRequestPath_like: $englishPath }
      ) {
        count
        dimensions { clientRequestPath }
      }
    }
  }
}`;

interface AnalyticsGroup {
  count?: unknown;
  dimensions?: { clientRequestPath?: unknown };
}

interface AnalyticsResponse {
  data?: {
    viewer?: {
      zones?: Array<{
        basePaths?: AnalyticsGroup[];
        englishPaths?: AnalyticsGroup[];
      }>;
    };
  };
  errors?: unknown;
}

interface PopularToolsOptions {
  fetch?: typeof fetch;
  now?: () => number;
  zoneId?: string;
  apiToken?: string;
  timeoutMs?: number;
}

let cached:
  | { zoneId: string; expiresAt: number; result: PopularToolsResult }
  | undefined;
let pending:
  | { zoneId: string; promise: Promise<PopularToolsResult> }
  | undefined;

export function toolIdFromAnalyticsPath(path: unknown) {
  if (typeof path !== "string") return undefined;
  const match = /^\/(?:en-US\/)?tools\/([^/]+)\/?$/.exec(path);
  return match && validToolIds.has(match[1]) ? match[1] : undefined;
}

export function rankPopularToolIds(groups: readonly AnalyticsGroup[]) {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const id = toolIdFromAnalyticsPath(group.dimensions?.clientRequestPath);
    const count = group.count;
    if (
      !id ||
      typeof count !== "number" ||
      !Number.isFinite(count) ||
      count <= 0
    )
      continue;
    counts.set(id, (counts.get(id) ?? 0) + count);
  }
  const ranked = [...counts]
    .sort(
      ([leftId, left], [rightId, right]) =>
        right - left || leftId.localeCompare(rightId),
    )
    .map(([id]) => id);
  return [...ranked, ...featuredToolIds.filter((id) => !counts.has(id))].slice(
    0,
    maximumResults,
  );
}

function fallback(): PopularToolsResult {
  return { toolIds: [...featuredToolIds], source: "fallback" };
}

async function queryCloudflare(
  zoneId: string,
  apiToken: string,
  requestFetch: typeof fetch,
  now: number,
  timeoutMs: number,
) {
  const response = await requestFetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag: zoneId,
        start: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date(now).toISOString(),
        basePath: "/tools/%",
        englishPath: "/en-US/tools/%",
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error("Cloudflare Analytics request failed");
  const payload = (await response.json()) as AnalyticsResponse;
  if (
    Array.isArray(payload.errors)
      ? payload.errors.length > 0
      : payload.errors != null
  )
    throw new Error("Cloudflare Analytics returned errors");
  const groups = payload.data?.viewer?.zones?.flatMap((zone) => [
    ...(zone.basePaths ?? []),
    ...(zone.englishPaths ?? []),
  ]);
  if (!groups?.length) throw new Error("Cloudflare Analytics returned no data");
  if (
    !groups.some((group) =>
      toolIdFromAnalyticsPath(group.dimensions?.clientRequestPath),
    )
  )
    throw new Error("Cloudflare Analytics returned no tool paths");
  const toolIds = rankPopularToolIds(groups);
  return { toolIds, source: "cloudflare" as const };
}

export async function getPopularTools(
  options: PopularToolsOptions = {},
): Promise<PopularToolsResult> {
  const zoneId = options.zoneId ?? process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  if (!zoneId || !apiToken) return fallback();
  const now = options.now?.() ?? Date.now();
  if (cached?.zoneId === zoneId && cached.expiresAt > now) return cached.result;
  if (pending?.zoneId === zoneId) return pending.promise;

  const promise = queryCloudflare(
    zoneId,
    apiToken,
    options.fetch ?? fetch,
    now,
    options.timeoutMs ?? requestTimeoutMs,
  )
    .then((result) => {
      cached = { zoneId, expiresAt: now + cacheTtlMs, result };
      return result;
    })
    .catch(() => {
      if (cached?.zoneId === zoneId) return cached.result;
      const result = fallback();
      cached = { zoneId, expiresAt: now + fallbackCacheTtlMs, result };
      return result;
    })
    .finally(() => {
      if (pending?.promise === promise) pending = undefined;
    });
  pending = { zoneId, promise };
  return promise;
}

export function resetPopularToolsCache() {
  cached = undefined;
  pending = undefined;
}
