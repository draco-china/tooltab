export const MAX_CREDENTIAL_LENGTH = 100_000;

export class BasicAuthGeneratorError extends Error {
  constructor(
    public readonly code: "invalid_username" | "invalid_text" | "too_large",
  ) {
    super(code);
    this.name = "BasicAuthGeneratorError";
  }
}

function encodeBase64(
  username: string,
  password: string,
  encoding: AuthEncoding = "utf8",
) {
  if (username.includes(":")) {
    throw new BasicAuthGeneratorError("invalid_username");
  }
  const credentials = `${username}:${password}`;
  const bytes = credentialBytes(credentials, encoding);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function credentialBytes(value: string, encoding: AuthEncoding) {
  if (value.length > MAX_CREDENTIAL_LENGTH)
    throw new BasicAuthGeneratorError("too_large");
  if (encoding !== "utf8" && encoding !== "latin1")
    throw new BasicAuthGeneratorError("invalid_text");
  for (const character of value) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint < 32 ||
      codePoint === 127 ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      (encoding === "latin1" && codePoint > 255)
    )
      throw new BasicAuthGeneratorError("invalid_text");
  }
  return encoding === "utf8"
    ? new TextEncoder().encode(value)
    : Uint8Array.from(value, (character) => character.charCodeAt(0));
}

export function generateBasicAuth(
  username: string,
  password: string,
  encoding: AuthEncoding = "utf8",
) {
  const value = `Basic ${encodeBase64(username, password, encoding)}`;
  const header = `Authorization: ${value}`;
  return {
    value,
    header,
    curl: `curl --header '${header}' 'https://example.com/'`,
  };
}

export function createBasicAuthToken(username: string, password: string) {
  if (username === "" && password === "") return "";
  return encodeBase64(username, password);
}

export function createBasicAuthHeader(username: string, password: string) {
  const token = createBasicAuthToken(username, password);
  return token ? `Basic ${token}` : "";
}

export function createBasicAuthCurlCommand(
  url: string,
  username: string,
  password: string,
) {
  const authorization = createBasicAuthHeader(username, password);
  return authorization
    ? `curl -H "Authorization: ${authorization}" ${url}`
    : "";
}

export type AuthEncoding = "utf8" | "latin1";
export const MAX_AUTH_HEADER = 400_032;

export class BasicAuthDecoderError extends Error {
  constructor(
    public readonly code:
      | "too_large"
      | "invalid_text"
      | "invalid_header"
      | "invalid_base64"
      | "missing_separator",
  ) {
    super(code);
    this.name = "BasicAuthDecoderError";
  }
}

// Fatal UTF-8 decoding produces Unicode scalars; atob produces Latin-1 bytes.
// Both paths exclude lone surrogates before this control-character check.
function validateDecodedCredentials(value: string) {
  for (const character of value) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const code = character.codePointAt(0)!;
    if (code < 32 || code === 127) {
      throw new BasicAuthDecoderError("invalid_text");
    }
  }
}

export function decodeBasicAuth(
  input: string,
  encoding: AuthEncoding = "utf8",
  decodedLengthLimit?: number,
) {
  if (input.length > MAX_AUTH_HEADER) {
    throw new BasicAuthDecoderError("too_large");
  }
  if (/\r|\n/.test(input)) {
    throw new BasicAuthDecoderError("invalid_header");
  }
  const match =
    /^(?:Authorization:[\t ]*)?Basic[\t ]+([A-Za-z0-9+/]*={0,2})[\t ]*$/i.exec(
      input.trim(),
    );
  if (!match) throw new BasicAuthDecoderError("invalid_header");

  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const token = match[1]!;
  if (
    !token ||
    token.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(token) ||
    (token.includes("=") && token.length % 4 !== 0)
  ) {
    throw new BasicAuthDecoderError("invalid_base64");
  }
  const normalized = token.replace(/=+$/, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new BasicAuthDecoderError("invalid_base64");
  }
  if (btoa(binary) !== padded) {
    throw new BasicAuthDecoderError("invalid_base64");
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  let decoded: string;
  try {
    decoded =
      encoding === "utf8"
        ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
            bytes,
          )
        : binary;
  } catch {
    throw new BasicAuthDecoderError("invalid_text");
  }
  if (decodedLengthLimit !== undefined && decoded.length > decodedLengthLimit)
    throw new BasicAuthDecoderError("too_large");
  validateDecodedCredentials(decoded);
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    throw new BasicAuthDecoderError("missing_separator");
  }
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}
