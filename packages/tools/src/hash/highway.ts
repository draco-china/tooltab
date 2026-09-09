import { WasmHighwayHash } from "highwayhasher";
export const HIGHWAY_SIZES = [64, 128, 256] as const;
export type HighwaySize = (typeof HIGHWAY_SIZES)[number];
export class HighwayKeyError extends Error {
  constructor() {
    super("invalid_key");
  }
}
export function parseHighwayKey(
  input: string,
): Uint8Array<ArrayBuffer> | undefined {
  if (input.length > 4096) throw new HighwayKeyError();
  const s = input.trim();
  if (!s) return undefined;
  const hex = s.replace(/^0x/i, "").replace(/[\s:_-]/g, "");
  if (!/^[\da-f]{64}$/i.test(hex)) throw new HighwayKeyError();
  return Uint8Array.from({ length: 32 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}
export async function createHighway(size: HighwaySize, key?: Uint8Array) {
  if (!HIGHWAY_SIZES.includes(size) || (key !== undefined && key.length !== 32))
    throw new HighwayKeyError();
  const snapshot = key?.slice();
  let h: Awaited<ReturnType<typeof WasmHighwayHash.load>>;
  try {
    h = await WasmHighwayHash.load(snapshot);
  } finally {
    snapshot?.fill(0);
  }
  let result: Uint8Array<ArrayBuffer> | undefined;
  function update(bytes: Uint8Array) {
    if (result) throw Error("invalid_input");
    h.append(bytes);
  }
  function digest(format: "binary"): Uint8Array<ArrayBuffer>;
  function digest(format?: "hex"): string;
  function digest(format: "binary" | "hex" = "hex") {
    if (!result) {
      const bytes =
        size === 64
          ? h.finalize64()
          : size === 128
            ? h.finalize128()
            : h.finalize256();
      result = Uint8Array.from(bytes).reverse();
    }
    return format === "binary"
      ? result.slice()
      : Array.from(result, (n) => n.toString(16).padStart(2, "0")).join("");
  }
  return { update, digest };
}
