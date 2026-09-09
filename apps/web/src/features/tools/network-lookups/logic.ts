import {
  DNS_RECORD_TYPES,
  RESOLVERS,
  NetworkLookupError,
  normalizeDomain,
  normalizeIp,
  parseLookupTarget,
  reverseDomain,
  parseDnsResponse,
  dohUrl,
  isPublicIp,
  mergeIpMetadata,
  MAX_RESPONSE_BYTES,
  type DnsRecordType,
  type ResolverId,
} from "@workspace/tools/network/lookups";

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function requestSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(8_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
  tooLargeMessage?: string,
) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new NetworkLookupError("invalid_response", tooLargeMessage);
  }
  let body = "";
  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        signal?.throwIfAborted();
        const chunk = await reader.read();
        signal?.throwIfAborted();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes)
          throw new NetworkLookupError("invalid_response", tooLargeMessage);
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* Preserve the read or validation error. */
      }
      reader.releaseLock();
    }
  }
  return body;
}

async function readJson(
  url: string,
  signal: AbortSignal | undefined,
  fetcher: Fetcher,
) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { Accept: "application/dns-json" },
      credentials: "omit",
      signal: requestSignal(signal),
    });
  } catch (cause) {
    if (signal?.aborted) throw signal.reason;
    throw new NetworkLookupError(
      "network_failed",
      cause instanceof Error ? cause.message : undefined,
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new NetworkLookupError(
      "network_failed",
      `Remote service returned HTTP ${response.status}`,
    );
  }
  const body = await readBoundedResponse(
    response,
    MAX_RESPONSE_BYTES,
    signal,
    "Response is too large",
  );
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new NetworkLookupError("invalid_response");
  }
}

export async function lookupDnsRecords(
  input: {
    name: string;
    recordTypes: readonly DnsRecordType[];
    resolver: ResolverId;
    dnssec?: boolean;
    checkingDisabled?: boolean;
  },
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
) {
  const name = normalizeDomain(input.name);
  const recordTypes = DNS_RECORD_TYPES.filter((type) =>
    input.recordTypes.includes(type),
  );
  if (!recordTypes.length)
    throw new NetworkLookupError("invalid_domain", "Select a record type");
  const results = await Promise.all(
    recordTypes.map(async (recordType) => ({
      recordType,
      ...parseDnsResponse(
        await readJson(
          dohUrl(
            input.resolver,
            name,
            recordType,
            input.dnssec,
            input.checkingDisabled,
          ),
          signal,
          fetcher,
        ),
      ),
    })),
  );
  return {
    name,
    resolver: input.resolver,
    endpoint: RESOLVERS[input.resolver].url,
    results,
  };
}

export async function lookupReverseIp(
  input: { ip: string; resolver: ResolverId },
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
) {
  const ip = normalizeIp(input.ip);
  const name = reverseDomain(ip.address);
  const result = parseDnsResponse(
    await readJson(dohUrl(input.resolver, name, "PTR"), signal, fetcher),
  );
  return {
    ip: ip.address,
    family: ip.family,
    reverseDomain: name,
    resolver: input.resolver,
    endpoint: RESOLVERS[input.resolver].url,
    status: result.status,
    statusLabel: result.statusLabel,
    answers: result.answers
      .filter((answer) => answer.typeCode === 12)
      .map((answer) => ({
        hostname: answer.data.replace(/\.$/u, ""),
        rawHostname: answer.data,
        ttl: answer.ttl,
      })),
  };
}

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new NetworkLookupError("invalid_response");
  return value as Record<string, unknown>;
}

export async function lookupIpMetadata(
  address: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
) {
  if (!isPublicIp(address))
    return {
      info: mergeIpMetadata(undefined, undefined, undefined),
      metadataStatus: "not-public" as const,
    };
  const urls = [
    `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(address)}.json`,
    `https://api.ip.sb/geoip/${encodeURIComponent(address)}`,
    `https://get.geojs.io/v1/dns/ptr/${encodeURIComponent(address)}.json`,
  ];
  const results = await Promise.allSettled(
    urls.map((url) => readJson(url, signal, fetcher).then(objectValue)),
  );
  signal?.throwIfAborted();
  const [geojs, ipsb, ptr] = results.map((result) =>
    result.status === "fulfilled" ? result.value : undefined,
  );
  const info = mergeIpMetadata(geojs, ipsb, ptr);
  return {
    info,
    metadataStatus: results.some((result) => result.status === "fulfilled")
      ? ("available" as const)
      : ("unavailable" as const),
  };
}

export async function lookupIpInfoTarget(
  input: { target: string; resolver: ResolverId },
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
) {
  const target = parseLookupTarget(input.target);
  const records =
    target.kind === "domain"
      ? (
          await Promise.allSettled(
            (["A", "AAAA"] as const).map(async (type) => {
              const response = parseDnsResponse(
                await readJson(
                  dohUrl(input.resolver, target.normalized, type),
                  signal,
                  fetcher,
                ),
              );
              return response.answers
                .filter((answer) => answer.type === type)
                .flatMap((answer) => {
                  try {
                    return [
                      {
                        type,
                        value: normalizeIp(answer.data).address,
                        ttl: answer.ttl,
                      },
                    ];
                  } catch {
                    return [];
                  }
                });
            }),
          )
        ).flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        )
      : [];
  signal?.throwIfAborted();
  const addresses = [
    ...new Set(
      target.kind === "ip"
        ? [target.address]
        : records.map((record) => record.value),
    ),
  ].slice(0, 8);
  const enriched = await Promise.all(
    addresses.map(async (address) => ({
      address,
      family: normalizeIp(address).family,
      ...(await lookupIpMetadata(address, signal, fetcher)),
    })),
  );
  return {
    target: {
      kind: target.kind,
      input: target.input,
      normalized: target.normalized,
    },
    resolver: input.resolver,
    endpoint: RESOLVERS[input.resolver].url,
    records,
    addresses: enriched,
  };
}

export type PublicIpVersion = "ipv4" | "ipv6";
const PUBLIC_IP_ENDPOINTS = {
  ipv4: [
    { kind: "json", url: "https://api-ipv4.ip.sb/geoip" },
    { kind: "json", url: "https://ipv4.geojs.io/v1/ip.json" },
    { kind: "trace", url: "https://cloudflare.com/cdn-cgi/trace" },
    { kind: "json", url: "https://api.ipify.org?format=json" },
  ],
  ipv6: [
    { kind: "json", url: "https://api-ipv6.ip.sb/geoip" },
    { kind: "json", url: "https://ipv6.geojs.io/v1/ip.json" },
    { kind: "trace", url: "https://cloudflare.com/cdn-cgi/trace" },
    { kind: "json", url: "https://api64.ipify.org?format=json" },
  ],
} as const;

async function publicIpResponse(
  endpoint: (typeof PUBLIC_IP_ENDPOINTS)[PublicIpVersion][number],
  signal: AbortSignal | undefined,
  fetcher: Fetcher,
) {
  const response = await fetcher(endpoint.url, {
    method: "GET",
    headers: {
      Accept: endpoint.kind === "json" ? "application/json" : "text/plain",
    },
    credentials: "omit",
    signal: requestSignal(signal),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new NetworkLookupError("network_failed");
  }
  const text = await readBoundedResponse(response, 64 * 1024, signal);
  if (endpoint.kind === "trace")
    return text
      .split(/\r?\n/u)
      .find((line) => line.startsWith("ip="))
      ?.slice(3)
      .trim();
  const value = JSON.parse(text) as unknown;
  return objectValue(value).ip;
}

export async function lookupPublicIp(
  version: PublicIpVersion,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
) {
  const lookupSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
    : AbortSignal.timeout(8_000);
  for (const endpoint of PUBLIC_IP_ENDPOINTS[version]) {
    try {
      const value = await publicIpResponse(endpoint, lookupSignal, fetcher);
      if (typeof value !== "string") continue;
      const ip = normalizeIp(value);
      if (
        (version === "ipv4" && ip.family === 4) ||
        (version === "ipv6" && ip.family === 6)
      )
        return {
          address: ip.address,
          provider: new URL(endpoint.url).hostname,
        };
    } catch {
      if (signal?.aborted) throw signal.reason;
      if (lookupSignal.aborted) break;
    }
  }
  throw new NetworkLookupError(
    "network_failed",
    `No ${version.toUpperCase()} provider returned an address`,
  );
}

export async function inspectPublicAddresses(
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
) {
  const settled = await Promise.allSettled(
    (["ipv4", "ipv6"] as const).map(async (version) => {
      const result = await lookupPublicIp(version, signal, fetcher);
      return {
        version,
        ...result,
        ...(await lookupIpMetadata(result.address, signal, fetcher)),
      };
    }),
  );
  signal?.throwIfAborted();
  const values = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (!values.length) throw new NetworkLookupError("network_failed");
  return values;
}

export async function detectWebRtcExposure(
  createPeer: () => RTCPeerConnection = () =>
    new RTCPeerConnection({ iceServers: [] }),
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const peer = createPeer();
  let rejectAbort: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abortNegotiation = () => rejectAbort(signal?.reason);
  signal?.addEventListener("abort", abortNegotiation, { once: true });
  const addresses = new Set<string>();
  const onCandidate = (event: RTCPeerConnectionIceEvent) => {
    const candidate = event.candidate;
    if (!candidate) return;
    const possible = [candidate.address, ...candidate.candidate.split(/\s+/u)];
    for (const value of possible) {
      if (!value) continue;
      try {
        addresses.add(normalizeIp(value).address);
      } catch {
        // Browsers commonly replace host addresses with mDNS names.
      }
    }
  };
  try {
    signal?.throwIfAborted();
    peer.createDataChannel("tooltab-check");
    peer.addEventListener("icecandidate", onCandidate);
    const offer = await Promise.race([peer.createOffer(), aborted]);
    signal?.throwIfAborted();
    await Promise.race([peer.setLocalDescription(offer), aborted]);
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        signal?.removeEventListener("abort", onAbort);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const onStateChange = () => {
        if (peer.iceGatheringState === "complete") done();
      };
      const onAbort = () => done();
      if (peer.iceGatheringState === "complete" || signal?.aborted) {
        done();
        return;
      }
      peer.addEventListener("icegatheringstatechange", onStateChange);
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(done, 2_000);
    });
    signal?.throwIfAborted();
    return [...addresses].map((address) => ({
      address,
      family: normalizeIp(address).family,
      scope: isPublicIp(address) ? ("public" as const) : ("local" as const),
    }));
  } finally {
    signal?.removeEventListener("abort", abortNegotiation);
    peer.removeEventListener("icecandidate", onCandidate);
    peer.close();
  }
}
