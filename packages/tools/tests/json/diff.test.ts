import { describe, expect, it } from "vitest";
import { diffJsonValues, toJsonPatch } from "../../src/json/diff";

type Patch = {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
};

function unescapePointer(value: string) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function applyPatch(document: unknown, patches: readonly Patch[]) {
  let result = structuredClone(document);
  for (const patch of patches) {
    if (patch.path === "") {
      if (patch.op === "remove") throw new Error("cannot remove document root");
      result = structuredClone(patch.value);
      continue;
    }

    const segments = patch.path.slice(1).split("/").map(unescapePointer);
    const key = segments.pop() as string;
    let parent = result as Record<string, unknown> | unknown[];
    for (const segment of segments) {
      parent = Array.isArray(parent)
        ? (parent[Number(segment)] as Record<string, unknown> | unknown[])
        : (parent[segment] as Record<string, unknown> | unknown[]);
    }

    if (Array.isArray(parent)) {
      const index = key === "-" ? parent.length : Number(key);
      if (patch.op === "remove") parent.splice(index, 1);
      else if (patch.op === "add")
        parent.splice(index, 0, structuredClone(patch.value));
      else parent[index] = structuredClone(patch.value);
    } else if (patch.op === "remove") {
      delete parent[key];
    } else {
      parent[key] = structuredClone(patch.value);
    }
  }
  return result;
}

describe("JSON value diff", () => {
  it("reports add, remove, replace, and unchanged values", () => {
    const entries = diffJsonValues(
      { keep: 1, remove: true, nested: { count: 1 }, list: ["a"] },
      { keep: 1, add: "new", nested: { count: 2 }, list: ["a", "b"] },
    );
    expect(entries).toEqual([
      {
        op: "add",
        jsonPath: "$.add",
        jsonPointer: "/add",
        newValue: "new",
      },
      {
        op: "add",
        jsonPath: "$.list[1]",
        jsonPointer: "/list/1",
        newValue: "b",
      },
      {
        op: "replace",
        jsonPath: "$.nested.count",
        jsonPointer: "/nested/count",
        oldValue: 1,
        newValue: 2,
      },
      {
        op: "remove",
        jsonPath: "$.remove",
        jsonPointer: "/remove",
        oldValue: true,
      },
    ]);
  });

  it("uses root paths and escapes JSON Pointer keys", () => {
    expect(diffJsonValues("before", "after")).toEqual([
      {
        op: "replace",
        jsonPath: "$",
        jsonPointer: "",
        oldValue: "before",
        newValue: "after",
      },
    ]);
    expect(diffJsonValues({ "a/b~c": 1 }, { "a/b~c": 2 })[0]).toMatchObject({
      jsonPath: '$["a/b~c"]',
      jsonPointer: "/a~1b~0c",
    });
    expect(diffJsonValues({ "a-b": 1 }, { "a-b": 2 })[0]?.jsonPath).toBe(
      '$["a-b"]',
    );
  });

  it("emits patches that apply to the modified value, including descending array removals", () => {
    const original = {
      list: ["zero", "one", "two", "three"],
      nested: { "a/b~c": "old" },
    };
    const modified = {
      list: ["changed"],
      nested: { "a/b~c": "new" },
      added: 1,
    };
    const patches = toJsonPatch(diffJsonValues(original, modified));

    expect(patches).toEqual([
      { op: "add", path: "/added", value: 1 },
      { op: "replace", path: "/list/0", value: "changed" },
      { op: "remove", path: "/list/3" },
      { op: "remove", path: "/list/2" },
      { op: "remove", path: "/list/1" },
      { op: "replace", path: "/nested/a~1b~0c", value: "new" },
    ]);
    expect(applyPatch(original, patches)).toEqual(modified);
  });

  it("reorders removals independently for each array parent", () => {
    const entries = diffJsonValues(
      { left: [0, 1, 2], right: ["a", "b", "c"] },
      { left: [], right: ["a"] },
    );
    expect(toJsonPatch(entries).map((patch) => patch.path)).toEqual([
      "/left/2",
      "/left/1",
      "/left/0",
      "/right/2",
      "/right/1",
    ]);
  });
});

it("handles root arrays, single removals, and empty object keys", () => {
  for (const [original, modified] of [
    [[0, 1, 2], [0]],
    [[0, 1], [0]],
    [{ "": 1, other: true }, { other: true }],
    [{ gone: 1 }, {}],
  ]) {
    const patch = toJsonPatch(diffJsonValues(original, modified));
    expect(applyPatch(original, patch)).toEqual(modified);
  }
  expect(
    toJsonPatch([
      { op: "remove", jsonPath: "$", jsonPointer: "", oldValue: 1 },
    ]),
  ).toEqual([{ op: "remove", path: "" }]);
});

it("preserves sparse entry slots while ordering actual removals", () => {
  const entries: Parameters<typeof toJsonPatch>[0][number][] = [];
  entries.length = 4;
  entries[1] = { op: "remove", jsonPath: "$[1]", jsonPointer: "/1" };
  entries[3] = { op: "remove", jsonPath: "$[3]", jsonPointer: "/3" };
  const patch = toJsonPatch(entries);
  expect(patch.length).toBe(4);
  expect(Object.hasOwn(patch, 0)).toBe(false);
  expect(Object.hasOwn(patch, 2)).toBe(false);
  expect(patch[1]).toEqual({ op: "remove", path: "/3" });
  expect(patch[3]).toEqual({ op: "remove", path: "/1" });
});
