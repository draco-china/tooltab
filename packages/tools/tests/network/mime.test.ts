import { expect, it } from "vitest";
import {
  lookupMime,
  MIME_FILTERS,
  MimeQueryError,
} from "../../src/network/mime";

it("loads the actual mime-db dataset with complete metadata", () => {
  const result = lookupMime();
  expect(result.dataset).toBe("mime-db@1.54.0");
  expect(result.total).toBeGreaterThan(2000);
  expect(result.count).toBe(result.total);
  expect(result.entries).toHaveLength(result.total);
  expect(result.entries.every((row) => row.mimeType.includes("/"))).toBe(true);
  const json = result.entries.find(
    (row) => row.mimeType === "application/json",
  );
  expect(json?.extensions).toContain("json");
  expect(json).toHaveProperty("source");
});

it("supports every category filter and excludes other categories", () => {
  expect(MIME_FILTERS).toEqual([
    "all",
    "application",
    "audio",
    "font",
    "image",
    "message",
    "model",
    "multipart",
    "text",
    "video",
  ]);
  for (const filter of MIME_FILTERS.slice(1)) {
    const result = lookupMime("", filter);
    expect(result.count).toBeGreaterThan(0);
    expect(result.entries.every((row) => row.category === filter)).toBe(true);
  }
});

it("searches extensions before MIME type, source, and charset with lexical ties", () => {
  const extension = lookupMime("json");
  expect(
    extension.entries[0]?.extensions?.some((value) => value.includes("json")),
  ).toBe(true);
  const jsonIndex = extension.entries.findIndex(
    (row) => row.mimeType === "application/json",
  );
  expect(jsonIndex).toBeGreaterThan(0);
  expect(extension.entries[jsonIndex]?.extensions).toContain("json");
  expect(lookupMime("  IMAGE/PNG  ").entries[0]?.mimeType).toBe("image/png");
  const source = lookupMime("apache");
  expect(source.entries.length).toBeGreaterThan(0);
  expect(
    source.entries.every((row) =>
      [
        row.mimeType,
        ...row.extensions,
        row.source ?? "",
        row.charset ?? "",
      ].some((value) => value.toLowerCase().includes("apache")),
    ),
  ).toBe(true);
  expect(lookupMime("definitely-no-such-mime").entries).toEqual([]);
});

it("does not mutate the cached dataset while returning full row objects", () => {
  const before = lookupMime();
  const first = before.entries[0];
  const query = lookupMime("xml", "application");
  expect(query.entries.length).toBeGreaterThan(0);
  const after = lookupMime();
  expect(after.total).toBe(before.total);
  expect(after.entries[0]).toEqual(first);
  expect(query.entries[0]).toHaveProperty("extensions");
});

it("finds charset-only matches and orders equal-ranked records lexically", () => {
  const result = lookupMime(" UTF-8 ");
  expect(result.entries.length).toBeGreaterThan(1);
  expect(result.entries.map((row) => row.mimeType)).toContain(
    "application/json",
  );
  expect(result.entries.map((row) => row.mimeType)).toContain("text/css");
  for (const row of result.entries) {
    expect(row.charset).toBe("UTF-8");
    expect(row.mimeType.toLowerCase()).not.toContain("utf-8");
    expect(
      row.extensions.some((extension) => extension.includes("utf-8")),
    ).toBe(false);
  }
  const names = result.entries.map((row) => row.mimeType);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

it("rejects invalid filters and overlong queries at the documented boundary", () => {
  for (const call of [
    () => lookupMime("x".repeat(1001)),
    () => lookupMime("", "unknown"),
  ]) {
    expect(call).toThrow(MimeQueryError);
    expect(call).toThrow("invalid_input");
  }
  expect(lookupMime("x".repeat(1000)).count).toBe(0);
});

it("isolates returned records and extension arrays from future lookups", () => {
  const initial = lookupMime("image/png");
  const pristine = structuredClone(initial);
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const row = initial.entries[0]!;
  row.mimeType = "changed/type";
  row.extensions.push("tooltab-mutation-probe");
  delete row.source;
  initial.entries.length = 0;
  expect(lookupMime("image/png")).toEqual(pristine);
  expect(lookupMime("tooltab-mutation-probe").entries).toEqual([]);
  expect(lookupMime("changed/type").entries).toEqual([]);
});
