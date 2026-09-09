import UAParser from "ua-parser-js";

export const MAX_UA_LENGTH = 500;

export class UserAgentError extends Error {
  constructor(public readonly code: "too_large" | "invalid_input") {
    super(code);
    this.name = "DeveloperParserError";
  }
}

export function parseUserAgent(input: string) {
  const ua = input.trim();
  if (ua.length > MAX_UA_LENGTH) throw new UserAgentError("too_large");
  if (!ua) return null;
  for (const c of ua) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const cp = c.codePointAt(0)!;
    if (cp < 32 || cp === 127 || (cp >= 0xd800 && cp <= 0xdfff))
      throw new UserAgentError("invalid_input");
  }
  const value = new UAParser(ua).getResult();
  const field = (value?: string) => value || null;
  return {
    ua,
    browser: {
      name: field(value.browser.name),
      version: field(value.browser.version),
      major: field(value.browser.major),
    },
    os: { name: field(value.os.name), version: field(value.os.version) },
    engine: {
      name: field(value.engine.name),
      version: field(value.engine.version),
    },
    device: {
      type: field(value.device.type),
      vendor: field(value.device.vendor),
      model: field(value.device.model),
    },
    cpu: { architecture: field(value.cpu.architecture) },
  };
}
