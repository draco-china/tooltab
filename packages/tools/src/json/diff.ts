// Adapted from InBrowserApp fixed snapshot c1a30774a8fd459377deb1b466d689ffeb8a8ba5.
export type JsonDiffOperation = "add" | "remove" | "replace";

export type JsonDiffEntry = Readonly<{
  op: JsonDiffOperation;
  jsonPath: string;
  jsonPointer: string;
  oldValue?: unknown;
  newValue?: unknown;
}>;

type JsonPatchOperation = Readonly<{
  op: JsonDiffOperation;
  path: string;
  value?: unknown;
}>;

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function diffJsonValues(original: unknown, modified: unknown): JsonDiffEntry[] {
  const diffs: JsonDiffEntry[] = [];
  collectDiffs(original, modified, [], diffs);
  return diffs;
}

function toJsonPatch(entries: readonly JsonDiffEntry[]): JsonPatchOperation[] {
  const patch = entries.map((entry) => {
    if (entry.op === "remove") {
      return {
        op: entry.op,
        path: entry.jsonPointer,
      };
    }

    return {
      op: entry.op,
      path: entry.jsonPointer,
      value: entry.newValue,
    };
  });

  reorderArrayRemovalsInPatch(patch);
  return patch;
}

function collectDiffs(
  original: unknown,
  modified: unknown,
  segments: readonly (string | number)[],
  diffs: JsonDiffEntry[],
) {
  if (Object.is(original, modified)) {
    return;
  }

  if (Array.isArray(original) && Array.isArray(modified)) {
    const maxLength = Math.max(original.length, modified.length);

    for (let index = 0; index < maxLength; index += 1) {
      const hasOriginal = index < original.length;
      const hasModified = index < modified.length;
      const nextSegments = [...segments, index];

      if (!hasOriginal) {
        diffs.push({
          op: "add",
          jsonPath: toJsonPath(nextSegments),
          jsonPointer: toJsonPointer(nextSegments),
          newValue: modified[index],
        });
        continue;
      }

      if (!hasModified) {
        diffs.push({
          op: "remove",
          jsonPath: toJsonPath(nextSegments),
          jsonPointer: toJsonPointer(nextSegments),
          oldValue: original[index],
        });
        continue;
      }

      collectDiffs(original[index], modified[index], nextSegments, diffs);
    }

    return;
  }

  if (isRecord(original) && isRecord(modified)) {
    const keys = [
      ...new Set([...Object.keys(original), ...Object.keys(modified)]),
    ].sort();

    for (const key of keys) {
      const hasOriginal = Object.hasOwn(original, key);
      const hasModified = Object.hasOwn(modified, key);
      const nextSegments = [...segments, key];

      if (!hasOriginal) {
        diffs.push({
          op: "add",
          jsonPath: toJsonPath(nextSegments),
          jsonPointer: toJsonPointer(nextSegments),
          newValue: modified[key],
        });
        continue;
      }

      if (!hasModified) {
        diffs.push({
          op: "remove",
          jsonPath: toJsonPath(nextSegments),
          jsonPointer: toJsonPointer(nextSegments),
          oldValue: original[key],
        });
        continue;
      }

      collectDiffs(original[key], modified[key], nextSegments, diffs);
    }

    return;
  }

  diffs.push({
    op: "replace",
    jsonPath: toJsonPath(segments),
    jsonPointer: toJsonPointer(segments),
    oldValue: original,
    newValue: modified,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonPath(segments: readonly (string | number)[]) {
  if (segments.length === 0) {
    return "$";
  }

  return segments.reduce<string>((path, segment) => {
    if (typeof segment === "number") {
      return `${path}[${segment}]`;
    }

    if (IDENTIFIER_PATTERN.test(segment)) {
      return `${path}.${segment}`;
    }

    return `${path}[${JSON.stringify(segment)}]`;
  }, "$");
}

function toJsonPointer(segments: readonly (string | number)[]) {
  if (segments.length === 0) {
    return "";
  }

  return `/${segments
    .map((segment) => escapeJsonPointerSegment(String(segment)))
    .join("/")}`;
}

function escapeJsonPointerSegment(segment: string) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function reorderArrayRemovalsInPatch(patch: JsonPatchOperation[]) {
  const removeIndexesByParent = new Map<
    string,
    { patchIndex: number; arrayIndex: number }[]
  >();

  for (let index = 0; index < patch.length; index += 1) {
    const operation = patch[index];

    if (operation?.op !== "remove") {
      continue;
    }

    const parsed = parseArrayRemovePath(operation.path);

    if (!parsed) {
      continue;
    }

    const existingIndexes = removeIndexesByParent.get(parsed.parentPointer);

    if (existingIndexes) {
      existingIndexes.push({
        patchIndex: index,
        arrayIndex: parsed.index,
      });
      continue;
    }

    removeIndexesByParent.set(parsed.parentPointer, [
      {
        patchIndex: index,
        arrayIndex: parsed.index,
      },
    ]);
  }

  for (const removals of removeIndexesByParent.values()) {
    if (removals.length < 2) {
      continue;
    }

    const sortedByDescendingArrayIndex = [...removals].sort(
      (left, right) => right.arrayIndex - left.arrayIndex,
    );
    const sortedOperations = sortedByDescendingArrayIndex.map(
      (removal) => patch[removal.patchIndex],
    );

    // Both arrays contain the same collected removals; sorting preserves their length.
    for (const [index, removal] of removals.entries()) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      patch[removal.patchIndex] = sortedOperations[index]!;
    }
  }
}

function parseArrayRemovePath(path: string) {
  if (!path.startsWith("/")) {
    return null;
  }

  const segments = path.slice(1).split("/");
  const lastSegment = segments[segments.length - 1];

  if (!lastSegment || !/^(0|[1-9]\d*)$/.test(lastSegment)) {
    return null;
  }

  return {
    parentPointer:
      segments.length === 1 ? "" : `/${segments.slice(0, -1).join("/")}`,
    index: Number.parseInt(lastSegment, 10),
  };
}

export { diffJsonValues, toJsonPatch };
