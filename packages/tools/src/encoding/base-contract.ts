export const MAX_BASE_BYTES = 1024 * 1024;

export interface BaseEncodingOptions {
  alphabet?: "bitcoin" | "flickr" | "ripple";
  variant?: "ascii85" | "z85";
}
export class BaseEncodingError extends Error {
  constructor(
    public readonly code:
      | "too-large"
      | "invalid-encoding"
      | "invalid-utf8"
      | "unsupported",
  ) {
    super(code);
    this.name = "BaseEncodingError";
  }
}

export const BASE58_ALPHABETS = {
  bitcoin: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  flickr: "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
  ripple: "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz",
} as const;
