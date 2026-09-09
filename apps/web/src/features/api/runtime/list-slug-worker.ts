import {
  compareLists,
  generateSlug,
  ListSlugError,
  RESULT_KEYS,
  type ResultKey,
} from "@workspace/tools/text/lists";
import type { ListSlugServiceJob } from "./list-slug-worker-client";

const encoder = new TextEncoder();
let files: Generator<string>[] = [];
function* array(values: unknown[]) {
  yield "[";
  for (let i = 0; i < values.length; i++) {
    if (i) yield ",";
    yield JSON.stringify(values[i]);
  }
  yield "]";
}
function* object(value: Record<string, unknown>): Generator<string> {
  yield "{";
  let first = true;
  for (const [key, item] of Object.entries(value)) {
    if (!first) yield ",";
    first = false;
    yield `${JSON.stringify(key)}:`;
    if (Array.isArray(item)) yield* array(item);
    else if (typeof item === "object" && item !== null)
      yield* object(item as Record<string, unknown>);
    else yield JSON.stringify(item);
  }
  yield "}";
}
function* textRows(rows: string[]) {
  for (let i = 0; i < rows.length; i++) {
    if (i) yield "\n";
    yield rows[i] ?? "";
  }
}
function* duplicates(rows: { value: string; count: number }[]) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (i) yield "\n";
    const v = /[\t\r\n"]/.test(row.value)
      ? `"${row.value.replaceAll('"', '""')}"`
      : row.value;
    yield `${v}\t${row.count}`;
  }
}
self.onmessage = (
  event: MessageEvent<ListSlugServiceJob | { pull: number }>,
) => {
  try {
    const job = event.data;
    if ("pull" in job) {
      const gen = files[job.pull];
      if (!gen) throw new ListSlugError("invalid_options");
      let chunk = "",
        done = false;
      while (chunk.length < 65536) {
        const next = gen.next();
        if (next.done) {
          done = true;
          break;
        }
        chunk += next.value;
      }
      const bytes = encoder.encode(chunk);
      self.postMessage({ data: bytes, done }, { transfer: [bytes.buffer] });
      return;
    }
    if (job.kind === "slug") {
      const output = generateSlug(job.input, job.separator, job.caseMode);
      if (encoder.encode(output).length <= 65536) {
        self.postMessage({ inline: { output } });
        return;
      }
      files = [
        (function* () {
          yield output;
        })(),
      ];
      self.postMessage({
        summary: { characters: output.length },
        files: [{ filename: "slug.txt", mimeType: "text/plain;charset=utf-8" }],
      });
      return;
    }
    const result = compareLists(job.left, job.right, job.options);
    const values: Record<
      ResultKey,
      string[] | { value: string; count: number }[]
    > = {
      shared: result.sharedItems,
      "left-only": result.leftOnlyItems,
      "right-only": result.rightOnlyItems,
      "all-unique": result.allUniqueItems,
      "left-duplicates": result.left.duplicateItems,
      "right-duplicates": result.right.duplicateItems,
    };
    let preview = "";
    for (const chunk of object(result)) {
      preview += chunk;
      if (preview.length > 16384) break;
    }
    if (preview.length <= 16384) {
      self.postMessage({ inline: result });
      return;
    }
    files = [
      object(result),
      ...RESULT_KEYS.map((key) =>
        key.endsWith("duplicates")
          ? duplicates(values[key] as { value: string; count: number }[])
          : textRows(values[key] as string[]),
      ),
    ];
    self.postMessage({
      summary: {
        left: {
          totalCount: result.left.totalCount,
          uniqueCount: result.left.uniqueCount,
          duplicateCount: result.left.duplicateCount,
        },
        right: {
          totalCount: result.right.totalCount,
          uniqueCount: result.right.uniqueCount,
          duplicateCount: result.right.duplicateCount,
        },
        counts: Object.fromEntries(
          RESULT_KEYS.map((key) => [key, values[key].length]),
        ),
      },
      files: [
        { filename: "comparison.json", mimeType: "application/json" },
        ...RESULT_KEYS.map((key) => ({
          filename: `${key}.${key.endsWith("duplicates") ? "tsv" : "txt"}`,
          mimeType: key.endsWith("duplicates")
            ? "text/tab-separated-values;charset=utf-8"
            : "text/plain;charset=utf-8",
        })),
      ],
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof ListSlugError ? e.code : "read_failed",
    });
  }
};
