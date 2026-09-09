import type {
  DeviceSnapshot,
  GpuInfo,
  HighEntropyValues,
  InfoValue,
  NavigatorDeviceApi,
  NetworkInformation,
} from "./types";
import { m } from "@/paraglide/messages.js";
import {
  architecture,
  detectBrowser,
} from "@workspace/tools/network/device-hints";

const HINTS = [
  "architecture",
  "bitness",
  "model",
  "platformVersion",
  "fullVersionList",
  "wow64",
  "formFactor",
] as const;
const READER_TIMEOUT_MS = 1500;

export function clean(value: string | undefined) {
  const result = value?.trim();
  return result ? result : undefined;
}

export function formatBytes(bytes: number | undefined, locale: string) {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0)
    return undefined;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit:
      bytes >= 1e12
        ? "terabyte"
        : bytes >= 1e9
          ? "gigabyte"
          : bytes >= 1e6
            ? "megabyte"
            : bytes >= 1e3
              ? "kilobyte"
              : "byte",
    maximumFractionDigits: bytes < 1000 ? 0 : 1,
  }).format(
    bytes >= 1e12
      ? bytes / 1e12
      : bytes >= 1e9
        ? bytes / 1e9
        : bytes >= 1e6
          ? bytes / 1e6
          : bytes >= 1e3
            ? bytes / 1e3
            : bytes,
  );
}

export function resolution(
  width: number | undefined,
  height: number | undefined,
) {
  if (
    width === undefined ||
    height === undefined ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return undefined;
  return `${Math.round(width)} × ${Math.round(height)}`;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = READER_TIMEOUT_MS,
) {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

export async function readHighEntropy(navigatorApi: NavigatorDeviceApi) {
  const data = navigatorApi.userAgentData;
  const reader = data?.getHighEntropyValues;
  if (!reader) return undefined;
  try {
    return await withTimeout(reader.call(data, HINTS));
  } catch {
    return undefined;
  }
}

export async function readStorageEstimate(navigatorApi: NavigatorDeviceApi) {
  const reader = navigatorApi.storage?.estimate;
  if (!reader) return undefined;
  try {
    return await withTimeout(reader.call(navigatorApi.storage));
  } catch {
    return undefined;
  }
}

function release(
  context: WebGLRenderingContext | WebGL2RenderingContext | null,
) {
  try {
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Some privacy modes expose a context but block extensions.
  }
}

export function readGpuInfo(documentApi: Document = document): GpuInfo {
  let webgl: WebGLRenderingContext | null = null;
  let webgl2: WebGL2RenderingContext | null = null;
  try {
    const first = documentApi.createElement("canvas");
    webgl =
      first.getContext("webgl") ??
      (first.getContext("experimental-webgl") as WebGLRenderingContext | null);
  } catch {
    webgl = null;
  }
  try {
    const second = documentApi.createElement("canvas");
    webgl2 = second.getContext("webgl2");
  } catch {
    webgl2 = null;
  }
  let vendor: string | undefined;
  let renderer: string | undefined;
  try {
    const debug = webgl?.getExtension("WEBGL_debug_renderer_info");
    if (webgl && debug) {
      vendor = String(webgl.getParameter(debug.UNMASKED_VENDOR_WEBGL));
      renderer = String(webgl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    }
  } catch {
    // Capability flags remain useful when identifying details are blocked.
  }
  try {
    return {
      webgl: webgl !== null,
      webgl2: webgl2 !== null,
      vendor,
      renderer,
    };
  } finally {
    release(webgl);
    release(webgl2);
  }
}

export function probeStorage(name: "localStorage" | "sessionStorage") {
  let storage: Storage | undefined;
  const key = `tooltab:device-information:probe:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
  try {
    storage = window[name];
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  } finally {
    try {
      storage?.removeItem(key);
    } catch {
      // The same storage policy may block cleanup after a failed write.
    }
  }
}

export function connection(
  navigatorApi: NavigatorDeviceApi,
): NetworkInformation | undefined {
  return (
    navigatorApi.connection ??
    navigatorApi.mozConnection ??
    navigatorApi.webkitConnection
  );
}

function textNumber(value: number | undefined, locale: string) {
  return value === undefined || !Number.isFinite(value)
    ? undefined
    : new Intl.NumberFormat(locale).format(value);
}
function boolean(value: boolean | undefined, yes: string, no: string) {
  return value === undefined ? undefined : value ? yes : no;
}
function entry(
  id: string,
  label: string,
  value: string | undefined,
  code = false,
): InfoValue {
  return {
    id,
    label,
    value: value ?? m["tools.deviceInformation.unavailable"](),
    unavailable: value === undefined,
    code,
  };
}
function timezone() {
  const zone = clean(Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (!zone) return undefined;
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "−";
  return `${zone} (UTC${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")})`;
}
function orientation(value?: string) {
  if (value === "portrait-primary")
    return m["tools.deviceInformation.portraitPrimary"]();
  if (value === "portrait-secondary")
    return m["tools.deviceInformation.portraitSecondary"]();
  if (value === "landscape-primary")
    return m["tools.deviceInformation.landscapePrimary"]();
  if (value === "landscape-secondary")
    return m["tools.deviceInformation.landscapeSecondary"]();
  return undefined;
}
function formFactor(
  hints: HighEntropyValues | undefined,
  nav: NavigatorDeviceApi,
) {
  if (clean(hints?.formFactor)) return hints?.formFactor;
  const side = Math.min(window.innerWidth, window.innerHeight);
  if (nav.userAgentData?.mobile)
    return side >= 768
      ? m["tools.deviceInformation.tablet"]()
      : m["tools.deviceInformation.phone"]();
  if (nav.maxTouchPoints > 0)
    return side < 768
      ? m["tools.deviceInformation.tablet"]()
      : m["tools.deviceInformation.touchDesktop"]();
  return side > 0
    ? m["tools.deviceInformation.desktop"]()
    : m["tools.userAgentParser.devUnknown"]();
}

export async function captureDeviceSnapshot(
  locale: string,
): Promise<DeviceSnapshot> {
  const nav = navigator as NavigatorDeviceApi;
  const captured = new Date();
  const [hints, estimate] = await Promise.all([
    readHighEntropy(nav),
    readStorageEstimate(nav),
  ]);
  const gpu = readGpuInfo();
  const net = connection(nav);
  const browser = detectBrowser(nav.userAgent, nav.userAgentData?.brands);
  const platform = clean(nav.userAgentData?.platform) ?? clean(nav.platform);
  const screen = resolution(window.screen.width, window.screen.height);
  const zone = timezone();
  const yes = m["shared.crcChecksum.yes"]();
  const no = m["shared.crcChecksum.no"]();
  const supported = m["tools.deviceInformation.supported"]();
  const unsupported = m["tools.deviceInformation.unsupported"]();
  const sections = [
    {
      id: "browser",
      title: m["common.uaBrowser"](),
      description: m["tools.deviceInformation.browserSectionDescription"](),
      entries: [
        entry("browser", m["common.uaBrowser"](), browser),
        entry(
          "primary-language",
          m["tools.deviceInformation.primaryLanguage"](),
          clean(nav.language),
        ),
        entry(
          "languages",
          m["tools.deviceInformation.supportedLanguages"](),
          nav.languages?.length ? [...nav.languages].join(", ") : undefined,
        ),
        entry(
          "cookies",
          m["tools.deviceInformation.cookiesEnabled"](),
          boolean(nav.cookieEnabled, yes, no),
        ),
        entry("platform", m["tools.deviceInformation.platform"](), platform),
        entry(
          "client-hints",
          m["tools.deviceInformation.hints"](),
          nav.userAgentData ? supported : unsupported,
        ),
        entry(
          "user-agent",
          m["tools.deviceInformation.userAgent"](),
          clean(nav.userAgent),
          true,
        ),
      ],
    },
    {
      id: "display",
      title: m["tools.deviceInformation.displaySectionTitle"](),
      description: m["tools.deviceInformation.displaySectionDescription"](),
      entries: [
        entry(
          "screen",
          m["tools.deviceInformation.screenResolution"](),
          screen,
        ),
        entry(
          "available",
          m["tools.deviceInformation.availableResolution"](),
          resolution(window.screen.availWidth, window.screen.availHeight),
        ),
        entry(
          "viewport",
          m["tools.deviceInformation.viewportSize"](),
          resolution(window.innerWidth, window.innerHeight),
        ),
        entry(
          "window",
          m["tools.deviceInformation.windowSize"](),
          resolution(window.outerWidth, window.outerHeight),
        ),
        entry(
          "pixel-ratio",
          m["tools.deviceInformation.pixelRatio"](),
          textNumber(window.devicePixelRatio, locale),
        ),
        entry(
          "color-depth",
          m["tools.deviceInformation.colorDepth"](),
          window.screen.colorDepth > 0
            ? `${textNumber(window.screen.colorDepth, locale)} ${m["tools.certificatePublicKeyParser.bitsLabel"]()}${window.screen.colorDepth > 24 ? ` (${m["tools.deviceInformation.hdr"]()})` : ""}`
            : undefined,
        ),
        entry(
          "orientation",
          m["tools.deviceInformation.orientation"](),
          orientation(window.screen.orientation?.type),
        ),
        entry(
          "multiple-screens",
          m["tools.deviceInformation.multipleScreens"](),
          boolean(
            (window.screen as Screen & { isExtended?: boolean }).isExtended,
            yes,
            no,
          ),
        ),
      ],
    },
    {
      id: "hardware",
      title: m["tools.deviceInformation.hardwareSectionTitle"](),
      description: m["tools.deviceInformation.hardwareSectionDescription"](),
      entries: [
        entry(
          "cpu-cores",
          m["tools.deviceInformation.cpuCores"](),
          textNumber(nav.hardwareConcurrency, locale),
        ),
        entry(
          "cpu-architecture",
          m["tools.deviceInformation.cpuArchitecture"](),
          architecture(nav.userAgent, hints?.architecture),
        ),
        entry(
          "cpu-bitness",
          m["tools.deviceInformation.cpuBitness"](),
          hints?.bitness ? `${hints.bitness}-bit` : undefined,
        ),
        entry(
          "memory",
          m["tools.deviceInformation.memory"](),
          nav.deviceMemory === undefined
            ? undefined
            : `${textNumber(nav.deviceMemory, locale)} GB`,
        ),
        entry(
          "model",
          m["tools.deviceInformation.model"](),
          clean(hints?.model),
        ),
        entry(
          "form-factor",
          m["tools.deviceInformation.formFactor"](),
          formFactor(hints, nav),
        ),
        entry(
          "touch",
          m["tools.deviceInformation.maxTouchPoints"](),
          textNumber(nav.maxTouchPoints, locale),
        ),
        entry(
          "gpu-vendor",
          m["tools.deviceInformation.gpuVendor"](),
          gpu.vendor,
        ),
        entry(
          "gpu-renderer",
          m["tools.deviceInformation.gpuRenderer"](),
          gpu.renderer,
        ),
      ],
    },
    {
      id: "network-storage",
      title: m["tools.deviceInformation.networkStorageSectionTitle"](),
      description:
        m["tools.deviceInformation.networkStorageSectionDescription"](),
      entries: [
        entry(
          "connection",
          m["tools.deviceInformation.connectionType"](),
          clean(net?.effectiveType) ?? clean(net?.type),
        ),
        entry(
          "downlink",
          m["tools.deviceInformation.downlink"](),
          net?.downlink === undefined
            ? undefined
            : `${textNumber(net.downlink, locale)} ${m["tools.deviceInformation.megabitsPerSecond"]()}`,
        ),
        entry(
          "rtt",
          m["tools.deviceInformation.roundTripTime"](),
          net?.rtt === undefined
            ? undefined
            : `${textNumber(net.rtt, locale)} ${m["tools.deviceInformation.milliseconds"]()}`,
        ),
        entry(
          "save-data",
          m["tools.deviceInformation.saveData"](),
          boolean(
            net?.saveData,
            m["tools.deviceInformation.enabled"](),
            m["tools.deviceInformation.disabled"](),
          ),
        ),
        entry(
          "quota",
          m["tools.deviceInformation.storageQuota"](),
          formatBytes(estimate?.quota, locale),
        ),
        entry(
          "usage",
          m["tools.deviceInformation.storageUsage"](),
          formatBytes(estimate?.usage, locale),
        ),
      ],
    },
    {
      id: "capabilities",
      title: m["tools.deviceInformation.capabilitiesSectionTitle"](),
      description:
        m["tools.deviceInformation.capabilitiesSectionDescription"](),
      entries: [
        entry(
          "secure-context",
          m["tools.deviceInformation.secureContext"](),
          boolean(window.isSecureContext, yes, no),
        ),
        entry(
          "online",
          m["tools.deviceInformation.onlineStatus"](),
          boolean(
            nav.onLine,
            m["tools.deviceInformation.online"](),
            m["tools.deviceInformation.offline"](),
          ),
        ),
        entry(
          "dnt",
          m["tools.deviceInformation.doNotTrack"](),
          nav.doNotTrack ?? m["tools.deviceInformation.notRequested"](),
        ),
        entry(
          "local-storage",
          m["tools.deviceInformation.localStorage"](),
          probeStorage("localStorage") ? supported : unsupported,
        ),
        entry(
          "session-storage",
          m["tools.deviceInformation.sessionStorage"](),
          probeStorage("sessionStorage") ? supported : unsupported,
        ),
        entry(
          "service-worker",
          m["tools.deviceInformation.serviceWorker"](),
          "serviceWorker" in nav ? supported : unsupported,
        ),
        entry(
          "webgl",
          m["tools.deviceInformation.webGl"](),
          gpu.webgl ? supported : unsupported,
        ),
        entry(
          "webgl2",
          m["tools.deviceInformation.webGl2"](),
          gpu.webgl2 ? supported : unsupported,
        ),
        entry(
          "clipboard",
          m["tools.deviceInformation.clipboard"](),
          typeof (nav.clipboard as Clipboard | undefined)?.writeText ===
            "function"
            ? supported
            : unsupported,
        ),
      ],
    },
  ];
  return {
    source: "current-browser",
    capturedAt: captured.toISOString(),
    capturedAtLabel: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(captured),
    summary: [
      entry("browser", m["common.uaBrowser"](), browser),
      entry("platform", m["tools.deviceInformation.platform"](), platform),
      entry("screen", m["tools.colorPicker.sourceScreen"](), screen),
      entry("timezone", m["tools.deviceInformation.summaryTimezone"](), zone),
    ],
    sections,
  };
}

export function serializeSnapshot(snapshot: DeviceSnapshot) {
  return JSON.stringify(snapshot, null, 2);
}
