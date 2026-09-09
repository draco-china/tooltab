import { describe, expect, it } from "vitest";
import { getStationSignal } from "../../src/radio-timecode/encoders";
import { bpcSignalForSecond } from "../../src/radio-timecode/encoders/bpc";
import { dcf77SignalForSecond } from "../../src/radio-timecode/encoders/dcf77";
import { jjySignalForSecond } from "../../src/radio-timecode/encoders/jjy";
import { msfSignalForSecond } from "../../src/radio-timecode/encoders/msf";
import { wwvbSignalForSecond } from "../../src/radio-timecode/encoders/wwvb";
import {
  getStationById,
  resolveStation,
  stations,
} from "../../src/radio-timecode/stations";

const atSecond = (second: number) =>
  new Date(`2026-09-05T12:34:${String(second).padStart(2, "0")}Z`);

describe("radio timecode stations", () => {
  it("keeps all six upstream station variants and resolves defaults", () => {
    expect(stations.map((station) => station.id)).toEqual([
      "jjy-40",
      "jjy-60",
      "bpc",
      "dcf77",
      "msf",
      "wwvb",
    ]);
    expect(getStationById("dcf77")?.timeZone).toBe("Europe/Berlin");
    expect(getStationById("missing" as never)).toBeUndefined();
    expect(resolveStation("missing").id).toBe("jjy-60");
    expect(resolveStation(null).id).toBe("jjy-60");
  });
});

describe("radio timecode encoder frames", () => {
  it("emits JJY and WWVB marker pulses at every minute marker", () => {
    for (const second of [0, 9, 19, 29, 39, 49, 59]) {
      expect(jjySignalForSecond(atSecond(second))).toEqual({
        windows: [{ start: 0.2, end: 1 }],
        symbol: "M",
      });
      expect(wwvbSignalForSecond(atSecond(second))).toEqual({
        windows: [{ start: 0, end: 0.8 }],
        symbol: "M",
      });
    }
    expect(jjySignalForSecond(atSecond(1)).windows).toEqual([
      { start: 0.8, end: 1 },
    ]);
  });

  it("encodes BPC's three 20-second subframes and parity field", () => {
    expect(bpcSignalForSecond(atSecond(0))).toEqual({
      windows: [],
      symbol: "P0",
    });
    expect(bpcSignalForSecond(atSecond(8))).toEqual({
      windows: [{ start: 0, end: 0.2 }],
      symbol: "1",
    });
    expect(bpcSignalForSecond(atSecond(20))).toEqual({
      windows: [],
      symbol: "P0",
    });
    expect(bpcSignalForSecond(atSecond(40))).toEqual({
      windows: [],
      symbol: "P0",
    });
  });

  it("encodes DCF77 minute omission and one-bit pulse widths", () => {
    expect(dcf77SignalForSecond(atSecond(59))).toEqual({
      windows: [],
      symbol: "M",
    });
    const zero = dcf77SignalForSecond(atSecond(1));
    expect(zero.symbol).toBe("0");
    expect(zero.windows).toEqual([{ start: 0, end: 0.1 }]);
  });

  it("encodes MSF marker, A bits and B bits as separate windows", () => {
    expect(msfSignalForSecond(atSecond(0))).toEqual({
      windows: [{ start: 0, end: 0.5 }],
      symbol: "M",
    });
    expect(msfSignalForSecond(atSecond(19))).toEqual({
      windows: [
        { start: 0, end: 0.1 },
        { start: 0.1, end: 0.2 },
      ],
      symbol: "A1B0",
    });
  });

  it("dispatches every station through the public encoder", () => {
    const date = atSecond(9);
    for (const station of stations) {
      expect(getStationSignal(station.id, date)).toEqual(
        station.id.startsWith("jjy")
          ? jjySignalForSecond(date)
          : station.id === "bpc"
            ? bpcSignalForSecond(date)
            : station.id === "dcf77"
              ? dcf77SignalForSecond(date)
              : station.id === "msf"
                ? msfSignalForSecond(date)
                : wwvbSignalForSecond(date),
      );
    }
  });
});

describe("WWVB data pulses", () => {
  const signal = (date: string, second: number) => {
    const instant = new Date(date);
    instant.setUTCSeconds(second);
    return wwvbSignalForSecond(instant);
  };

  it("encodes minute digits using data pulses rather than marker pulses", () => {
    const start = "2024-01-01T00:45:00Z";
    for (const second of [1, 6, 8]) {
      expect(signal(start, second)).toEqual({
        symbol: "1",
        windows: [{ start: 0, end: 0.5 }],
      });
    }
    for (const second of [2, 3, 5, 7]) {
      expect(signal(start, second)).toEqual({
        symbol: "0",
        windows: [{ start: 0, end: 0.2 }],
      });
    }
  });

  it("encodes leap years and both sides of the Denver DST transition day", () => {
    expect(signal("2024-01-01T00:00:00Z", 55).symbol).toBe("1");
    expect(signal("2100-01-01T00:00:00Z", 55).symbol).toBe("0");
    for (const [date, end, start] of [
      ["2024-01-01T00:00:00Z", "0", "0"],
      ["2024-03-10T00:00:00Z", "1", "0"],
      ["2024-07-01T00:00:00Z", "1", "1"],
      ["2024-11-03T00:00:00Z", "0", "1"],
    ]) {
      expect(signal(date, 57).symbol).toBe(end);
      expect(signal(date, 58).symbol).toBe(start);
    }
  });
});

// PTB DCF77 time code: Z1/Z2 describe the following minute;
// A1 is broadcast for the hour preceding the actual transition.
describe("DCF77 zone and transition announcement", () => {
  const bit = (minute: string, second: number) => {
    const date = new Date(minute);
    date.setUTCSeconds(second);
    return dcf77SignalForSecond(date).symbol;
  };
  it("uses Z1=0/Z2=1 in CET and the inverse in CEST", () => {
    for (const [minute, z1, z2] of [
      ["2024-01-01T00:00:00Z", "0", "1"],
      ["2024-07-01T00:00:00Z", "1", "0"],
      ["2024-03-31T00:59:00Z", "1", "0"],
      ["2024-10-27T00:59:00Z", "0", "1"],
    ]) {
      expect(bit(minute, 17)).toBe(z1);
      expect(bit(minute, 18)).toBe(z2);
    }
  });
  it("announces both changes for the full preceding hour", () => {
    for (const day of ["2024-03-31", "2024-10-27"]) {
      expect(bit(`${day}T00:00:00Z`, 16)).toBe("1");
      expect(bit(`${day}T00:59:00Z`, 16)).toBe("1");
      expect(bit(`${day}T01:00:00Z`, 16)).toBe("0");
      const prior = new Date(`${day}T00:00:00Z`);
      prior.setUTCMinutes(-1);
      expect(bit(prior.toISOString(), 16)).toBe("0");
    }
  });
});

// Bit positions and ascending BCD weights come from PTB's DCF77 encoding diagram.
describe("DCF77 independently decoded fields", () => {
  it("encodes the following minute with low-weight bits first and even parity", () => {
    for (const [utc, fields] of [
      ["2024-01-01T12:34:00Z", [35, 13, 1, 1, 1, 24]],
      ["2024-02-29T22:58:00Z", [59, 23, 29, 4, 2, 24]],
      ["2024-06-30T21:59:00Z", [0, 0, 1, 1, 7, 24]],
      ["2024-12-29T11:44:00Z", [45, 12, 29, 7, 12, 24]],
    ] as const) {
      const bits = Array.from({ length: 60 }, (_, second) => {
        const date = new Date(utc);
        date.setUTCSeconds(second);
        return dcf77SignalForSecond(date).symbol;
      });
      const decode = (start: number, weights: number[]) =>
        weights.reduce(
          (sum, weight, offset) => sum + Number(bits[start + offset]) * weight,
          0,
        );
      expect([
        decode(21, [1, 2, 4, 8, 10, 20, 40]),
        decode(29, [1, 2, 4, 8, 10, 20]),
        decode(36, [1, 2, 4, 8, 10, 20]),
        decode(42, [1, 2, 4]),
        decode(45, [1, 2, 4, 8, 10]),
        decode(50, [1, 2, 4, 8, 10, 20, 40, 80]),
      ]).toEqual(fields);
      for (const [start, end] of [
        [21, 28],
        [29, 35],
        [36, 58],
      ]) {
        expect(
          bits
            .slice(start, end + 1)
            .reduce((sum, bit) => sum + Number(bit), 0) % 2,
        ).toBe(0);
      }
      expect(bits[20]).toBe("1");
      expect(bits[59]).toBe("M");
    }
  });
});

describe("remaining data pulse paths", () => {
  it("emits JJY one bits using the half-second attenuation window", () => {
    expect(jjySignalForSecond(new Date("2024-01-01T00:45:01Z"))).toEqual({
      symbol: "1",
      windows: [{ start: 0.5, end: 1 }],
    });
  });

  it("keeps MSF B-channel parity odd across changing calendar fields", () => {
    for (const minute of [
      "2024-01-01T00:00:00Z",
      "2024-03-31T00:30:00Z",
      "2024-07-02T12:34:00Z",
      "2024-12-29T23:58:00Z",
    ]) {
      const frame = Array.from({ length: 60 }, (_, second) => {
        const date = new Date(minute);
        date.setUTCSeconds(second);
        return msfSignalForSecond(date);
      });
      for (const [start, end, parity] of [
        [17, 24, 54],
        [25, 35, 55],
        [36, 38, 56],
        [39, 51, 57],
      ]) {
        const ones = frame
          .slice(start, end + 1)
          .reduce((sum, signal) => sum + Number(signal.symbol[1]), 0);
        expect((ones + Number(frame[parity].symbol[3])) % 2).toBe(1);
      }
      for (const signal of frame.slice(1)) {
        expect(
          signal.windows.some(
            (window) => window.start === 0.2 && window.end === 0.3,
          ),
        ).toBe(signal.symbol[3] === "1");
      }
    }
  });
});

describe("BPC half-day flag", () => {
  it("distinguishes local midnight from noon without changing hour digits", () => {
    const frame = (utc: string) =>
      Array.from({ length: 20 }, (_, second) => {
        const date = new Date(utc);
        date.setUTCSeconds(second);
        return bpcSignalForSecond(date);
      });
    const midnight = frame("2024-01-01T16:00:00Z");
    const noon = frame("2024-01-02T04:00:00Z");
    expect(midnight[3].symbol).toBe("0");
    expect(midnight[4].symbol).toBe("0");
    expect(noon[3]).toEqual(midnight[3]);
    expect(noon[4]).toEqual(midnight[4]);
    const amFlag = Number(midnight[10].symbol);
    const pmFlag = Number(noon[10].symbol);
    expect(amFlag >> 1).toBe(0);
    expect(pmFlag >> 1).toBe(1);
    expect(pmFlag & 1).toBe(amFlag & 1);
    expect(noon[10].windows[0].end - midnight[10].windows[0].end).toBeCloseTo(
      0.2,
    );
    expect(noon.slice(11)).toEqual(midnight.slice(11));
  });
});

// NPL MSF Time and Date Code: warning bit 53B spans 61 consecutive minutes.
describe("MSF summer time transitions", () => {
  it("warns for exactly 61 minutes and describes the next minute's offset", () => {
    for (const [transition, before, after] of [
      ["2024-03-31T01:00:00Z", "0", "1"],
      ["2024-10-27T01:00:00Z", "1", "0"],
    ]) {
      const origin = Date.parse(transition);
      const bit = (offset: number, second: number) => {
        const date = new Date(origin + offset * 60_000);
        date.setUTCSeconds(second);
        return msfSignalForSecond(date).symbol[3];
      };
      expect(bit(-62, 53)).toBe("0");
      for (let minute = -61; minute < 0; minute++)
        expect(bit(minute, 53)).toBe("1");
      expect(bit(0, 53)).toBe("0");
      expect(bit(-2, 58)).toBe(before);
      expect(bit(-1, 58)).toBe(after);
      expect(bit(0, 58)).toBe(after);
    }
  });
});
