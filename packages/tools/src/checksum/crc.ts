export const FILTERS = ["all", "8", "16", "32", "64", "other"] as const;
export type Filter = (typeof FILTERS)[number];
/** Public model facts from CRC RevEng catalogue; aliases match the audited tool. */
const definitions = [
  ["crc8", "CRC8", 8, "07", "00", false, "00", "f4"],
  ["crc8-1-wire", "CRC8 1-Wire", 8, "31", "00", true, "00", "a1"],
  ["crc8-dvb-s2", "CRC8 DVB-S2", 8, "d5", "00", false, "00", "bc"],
  ["crc16", "CRC16", 16, "8005", "0000", true, "0000", "bb3d"],
  ["crc16-ccitt", "CRC16 CCITT", 16, "1021", "ffff", false, "0000", "29b1"],
  ["crc16-modbus", "CRC16 Modbus", 16, "8005", "ffff", true, "0000", "4b37"],
  ["crc16-kermit", "CRC16 Kermit", 16, "1021", "0000", true, "0000", "2189"],
  ["crc16-xmodem", "CRC16 XModem", 16, "1021", "0000", false, "0000", "31c3"],
  ["crc24", "CRC24", 24, "864cfb", "b704ce", false, "000000", "21cf02"],
  ["crc32", "CRC32", 32, "04c11db7", "ffffffff", true, "ffffffff", "cbf43926"],
  [
    "crc32-mpeg-2",
    "CRC32 MPEG-2",
    32,
    "04c11db7",
    "ffffffff",
    false,
    "00000000",
    "0376e6e7",
  ],
  [
    "crcjam",
    "CRCJAM",
    32,
    "04c11db7",
    "ffffffff",
    true,
    "00000000",
    "340bc6d9",
  ],
  [
    "crc64-ecma-182",
    "CRC64 ECMA-182",
    64,
    "42f0e1eba9ea3693",
    "0000000000000000",
    false,
    "0000000000000000",
    "6c40df5f0b497347",
  ],
  [
    "crc64-go-iso",
    "CRC64 GO-ISO",
    64,
    "000000000000001b",
    "ffffffffffffffff",
    true,
    "ffffffffffffffff",
    "b90956c775a41001",
  ],
  [
    "crc64-ms",
    "CRC64 MS",
    64,
    "259c84cba6426349",
    "ffffffffffffffff",
    true,
    "0000000000000000",
    "75d4b74f024eceea",
  ],
  [
    "crc64-nvme",
    "CRC64 NVME",
    64,
    "ad93d23594c93659",
    "ffffffffffffffff",
    true,
    "ffffffffffffffff",
    "ae8b14860a799888",
  ],
  [
    "crc64-redis",
    "CRC64 REDIS",
    64,
    "ad93d23594c935a9",
    "0000000000000000",
    true,
    "0000000000000000",
    "e9c6d914c4b8d9ca",
  ],
  [
    "crc64-we",
    "CRC64 WE",
    64,
    "42f0e1eba9ea3693",
    "ffffffffffffffff",
    false,
    "ffffffffffffffff",
    "62ec59e3f1a4f00a",
  ],
  [
    "crc64-xz",
    "CRC64 XZ",
    64,
    "42f0e1eba9ea3693",
    "ffffffffffffffff",
    true,
    "ffffffffffffffff",
    "995dc9bbdf1939fa",
  ],
] as const;
export const MODELS = definitions.map(
  ([id, name, width, polynomial, initial, reflected, xorOutput, check]) => ({
    id,
    name,
    width,
    polynomial,
    initial,
    reflectInput: reflected,
    reflectOutput: reflected,
    xorOutput,
    check,
  }),
);
export type CrcResult = {
  id: string;
  name: string;
  width: number;
  hex: string;
};
function reflect(value: bigint, width: number) {
  let result = 0n;
  for (let i = 0; i < width; i++) {
    result = (result << 1n) | (value & 1n);
    value >>= 1n;
  }
  return result;
}
function buildTables() {
  return MODELS.map((model) => {
    const mask = (1n << BigInt(model.width)) - 1n;
    const poly = BigInt(`0x${model.polynomial}`);
    const polynomial = model.reflectInput ? reflect(poly, model.width) : poly;
    const low = new Uint32Array(256),
      high = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let remainder = model.reflectInput
        ? BigInt(i)
        : BigInt(i) << BigInt(model.width - 8);
      for (let bit = 0; bit < 8; bit++)
        remainder = model.reflectInput
          ? (remainder >> 1n) ^ (remainder & 1n ? polynomial : 0n)
          : ((remainder << 1n) ^
              (remainder & (1n << BigInt(model.width - 1)) ? polynomial : 0n)) &
            mask;
      low[i] = Number(remainder & 0xffffffffn);
      high[i] = Number(remainder >> 32n);
    }
    return { low, high };
  });
}
let tableCache: ReturnType<typeof buildTables> | undefined;
/** Numbers stay exact Uint32 words in the hot loop; BigInt occurs only at setup/finalization. */
export function createCrcEngine() {
  tableCache ??= buildTables();
  const tables = tableCache;
  const states = MODELS.map((m) => {
    const initial = BigInt(`0x${m.initial}`);
    return { lo: Number(initial & 0xffffffffn), hi: Number(initial >> 32n) };
  });
  let parity = 0;
  return {
    update(bytes: Uint8Array) {
      for (const b of bytes) parity ^= b & 1;
      for (let n = 0; n < MODELS.length; n++) {
        const m = MODELS[n],
          s = states[n],
          t = tables[n];
        if (!m || !s || !t) throw Error("model");
        let lo = s.lo,
          hi = s.hi;
        if (m.width === 64) {
          if (m.reflectInput)
            for (const b of bytes) {
              const k = (lo ^ b) & 255;
              lo = ((lo >>> 8) | (hi << 24)) ^ t.low[k];
              hi = (hi >>> 8) ^ t.high[k];
            }
          else
            for (const b of bytes) {
              const k = ((hi >>> 24) ^ b) & 255;
              hi = ((hi << 8) | (lo >>> 24)) ^ t.high[k];
              lo = (lo << 8) ^ t.low[k];
            }
        } else {
          const mask = m.width === 32 ? 0xffffffff : 2 ** m.width - 1;
          if (m.reflectInput)
            for (const b of bytes)
              lo = ((lo >>> 8) ^ t.low[(lo ^ b) & 255]) & mask;
          else
            for (const b of bytes)
              lo =
                ((lo << 8) ^ t.low[((lo >>> (m.width - 8)) ^ b) & 255]) & mask;
        }
        s.lo = lo >>> 0;
        s.hi = hi >>> 0;
      }
    },
    results(): CrcResult[] {
      return [
        { id: "crc1", name: "CRC1", width: 1, hex: String(parity) },
        ...MODELS.map((m, i) => {
          const s = states[i];
          if (!s) throw Error("state");
          const value =
            ((BigInt(s.hi) << 32n) | BigInt(s.lo)) ^ BigInt(`0x${m.xorOutput}`);
          return {
            id: m.id,
            name: m.name,
            width: m.width,
            hex: value.toString(16).padStart(Math.ceil(m.width / 4), "0"),
          };
        }),
      ];
    },
  };
}
export function filterResults(results: CrcResult[], filter: Filter) {
  return results.filter(
    (r) =>
      filter === "all" ||
      (filter === "other"
        ? r.width === 1 || r.width === 24
        : r.width === Number(filter)),
  );
}
export function resultText(results: CrcResult[]) {
  return results.map((r) => `${r.name}: ${r.hex}`).join("\n");
}
