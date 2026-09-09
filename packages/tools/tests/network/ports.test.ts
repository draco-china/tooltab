import { expect, it } from "vitest";
import {
  filterPorts,
  PORT_FILTERS,
  PortQueryError,
  type PortQueryRow,
} from "../../src/network/ports";

const rows = [
  {
    port: 20,
    service: "ftp-data",
    description: "File Transfer Protocol data",
    category: "system",
    common: false,
    source: "fixture",
  },
  {
    port: 53,
    service: "domain",
    description: "Domain Name System",
    category: "registered",
    common: true,
    source: "fixture",
  },
  {
    port: 443,
    service: "https",
    description: "HTTP Secure",
    category: "registered",
    common: true,
    source: "fixture",
  },
  {
    port: 8080,
    service: "http-alt",
    description: "HTTP alternate",
    category: "registered",
    common: false,
    source: "fixture",
  },
] satisfies (PortQueryRow & { source: string })[];

it("supports every port filter and preserves all rows for all", () => {
  expect(PORT_FILTERS).toEqual(["all", "common", "system", "registered"]);
  expect(filterPorts(rows)).toEqual(rows);
  expect(filterPorts(rows, "", "common").map((row) => row.port)).toEqual([
    53, 443,
  ]);
  expect(filterPorts(rows, "", "system").map((row) => row.port)).toEqual([20]);
  expect(filterPorts(rows, "", "registered").map((row) => row.port)).toEqual([
    53, 443, 8080,
  ]);
});

it("searches port, service, and description after trim and lowercase", () => {
  expect(filterPorts(rows, "  443 ").map((row) => row.port)).toEqual([443]);
  expect(filterPorts(rows, "DoMaIn").map((row) => row.port)).toEqual([53]);
  expect(filterPorts(rows, "secure").map((row) => row.port)).toEqual([443]);
  expect(filterPorts(rows, "no match")).toEqual([]);
  expect(
    filterPorts(rows, "http", "registered").map((row) => row.port),
  ).toEqual([443, 8080]);
  expect(filterPorts(rows, "http", "system")).toEqual([]);
});

it("returns original rows and preserves extra fields without mutation", () => {
  const snapshot = structuredClone(rows);
  const result = filterPorts(rows, "http", "registered");
  expect(result[0]).toBe(rows[2]);
  expect(result[0]?.source).toBe("fixture");
  expect(rows).toEqual(snapshot);
});

it("rejects invalid filters and overlong queries at the documented boundary", () => {
  for (const call of [
    () => filterPorts(rows, "x".repeat(1001)),
    () => filterPorts(rows, "", "unknown"),
  ]) {
    expect(call).toThrow(PortQueryError);
    expect(call).toThrow("invalid_input");
  }
  expect(filterPorts(rows, "x".repeat(1000))).toEqual([]);
});
