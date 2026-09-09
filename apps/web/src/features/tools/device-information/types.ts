export type InfoValue = Readonly<{
  id: string;
  label: string;
  value: string;
  unavailable?: boolean;
  code?: boolean;
}>;

export type InfoSection = Readonly<{
  id: string;
  title: string;
  description: string;
  entries: readonly InfoValue[];
}>;

export type DeviceSnapshot = Readonly<{
  source: "current-browser";
  capturedAt: string;
  capturedAtLabel: string;
  summary: readonly InfoValue[];
  sections: readonly InfoSection[];
}>;

export type BrowserBrand = Readonly<{ brand: string; version?: string }>;
export type HighEntropyValues = Readonly<{
  architecture?: string;
  bitness?: string;
  model?: string;
  platformVersion?: string;
  fullVersionList?: readonly BrowserBrand[];
  wow64?: boolean;
  formFactor?: string;
}>;
export type NavigatorDeviceApi = Navigator &
  Readonly<{
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
    deviceMemory?: number;
    userAgentData?: Readonly<{
      brands?: readonly BrowserBrand[];
      mobile?: boolean;
      platform?: string;
      getHighEntropyValues?: (
        hints: readonly string[],
      ) => Promise<HighEntropyValues>;
    }>;
  }>;
export type NetworkInformation = Readonly<{
  effectiveType?: string;
  type?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}>;
export type GpuInfo = Readonly<{
  webgl: boolean;
  webgl2: boolean;
  vendor?: string;
  renderer?: string;
}>;
