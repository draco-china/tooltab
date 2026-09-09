import { expect, it } from "vitest";
import {
  filterHttpStatuses,
  HttpStatusQueryError,
  STATUS_FILTERS,
  type HttpStatusQueryRow,
} from "../../src/network/http-status";

const rows = [
  {
    code: 100,
    name: "Continue",
    description: "Request received",
    registryName: "Continue",
    category: "informational",
    common: false,
    extra: "preserved",
  },
  {
    code: 200,
    name: "OK",
    description: "Request succeeded",
    registryName: "OK",
    category: "success",
    common: true,
    extra: "preserved",
  },
  {
    code: 201,
    name: "Created",
    description: "Resource created",
    registryName: "Created",
    category: "success",
    common: false,
    extra: "preserved",
  },
  {
    code: 301,
    name: "Moved Permanently",
    description: "Permanent redirect",
    registryName: "Moved Permanently",
    category: "redirection",
    common: false,
    extra: "preserved",
  },
  {
    code: 404,
    name: "Not Found",
    description: "Resource missing",
    registryName: "Not Found",
    category: "client-error",
    common: true,
    extra: "preserved",
  },
  {
    code: 500,
    name: "Internal Server Error",
    description: "Server failure",
    registryName: "Internal Server Error",
    category: "server-error",
    common: true,
    extra: "preserved",
  },
] satisfies (HttpStatusQueryRow & { extra: string })[];

it("exports the exact supported filters and applies each category", () => {
  expect(STATUS_FILTERS).toEqual([
    "all",
    "common",
    "informational",
    "success",
    "redirection",
    "client-error",
    "server-error",
  ]);
  expect(filterHttpStatuses(rows)).toEqual(rows);
  expect(filterHttpStatuses(rows, "", "common").map((row) => row.code)).toEqual(
    [200, 404, 500],
  );
  for (const category of STATUS_FILTERS.slice(2))
    expect(
      filterHttpStatuses(rows, "", category).every(
        (row) => row.category === category,
      ),
    ).toBe(true);
});

it("searches code and every textual field case-insensitively after trimming", () => {
  expect(filterHttpStatuses(rows, "  404 ").map((row) => row.code)).toEqual([
    404,
  ]);
  expect(filterHttpStatuses(rows, "sUcCeEdEd").map((row) => row.code)).toEqual([
    200,
  ]);
  expect(filterHttpStatuses(rows, "permanent").map((row) => row.code)).toEqual([
    301,
  ]);
  expect(
    filterHttpStatuses(rows, "internal server").map((row) => row.code),
  ).toEqual([500]);
  expect(filterHttpStatuses(rows, "no match")).toEqual([]);
  expect(
    filterHttpStatuses(rows, "OK", "success").map((row) => row.code),
  ).toEqual([200]);
  expect(filterHttpStatuses(rows, "OK", "client-error")).toEqual([]);
});

it("returns original row objects without mutating or reshaping them", () => {
  const snapshot = structuredClone(rows);
  const result = filterHttpStatuses(rows, "", "success");
  expect(result).toEqual([rows[1], rows[2]]);
  expect(result[0]).toBe(rows[1]);
  expect(rows).toEqual(snapshot);
  expect(result[0]?.extra).toBe("preserved");
});

it("rejects overlong queries and unsupported filters with the domain error", () => {
  for (const call of [
    () => filterHttpStatuses(rows, "x".repeat(1001)),
    () => filterHttpStatuses(rows, "", "unknown"),
  ]) {
    expect(call).toThrow(HttpStatusQueryError);
    expect(call).toThrow("invalid_input");
  }
  expect(filterHttpStatuses(rows, "x".repeat(1000))).toEqual([]);
});
