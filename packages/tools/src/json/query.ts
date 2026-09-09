import { JSONPath } from "jsonpath-plus";
import { QueryError } from "./value";
import { formatQueryValue, MAX_QUERY_OUTPUT, parseQueryJson } from "./value";
import { createFilterEvaluator } from "./filter";
import { evaluateJmes } from "./jmes";

import type { QueryJob, QueryResult } from "./value";

export function executeQuery(job: QueryJob): QueryResult {
  if (!job.query.trim() || job.query.length > 65536)
    throw new QueryError("invalid_query");
  const data = parseQueryJson(job.input);
  try {
    if (job.kind === "jmespath") {
      const value = evaluateJmes(data, job.query),
        formatted = formatQueryValue(value);
      return {
        kind: job.kind,
        ...formatted,
        paths: null,
        count: Array.isArray(value) ? value.length : value === null ? 0 : 1,
      };
    }
    const matches =
      job.query.trim() === "$"
        ? [{ value: data, path: "$" }]
        : (JSONPath({
            path: job.query,
            json: data as object,
            resultType: "all",
            wrap: true,
            eval: createFilterEvaluator(),
          }) as { value: unknown; path: string }[] | undefined);
    const selected = matches ?? [];
    const formatted = formatQueryValue(selected.map((match) => match.value));
    const paths = formatQueryValue(selected.map((match) => match.path));
    if (formatted.bytes + paths.bytes > MAX_QUERY_OUTPUT)
      throw new QueryError("too_large");
    return {
      kind: job.kind,
      output: formatted.output,
      paths: paths.output,
      count: selected.length,
      bytes: formatted.bytes + paths.bytes,
    };
  } catch (error) {
    if (error instanceof QueryError) throw error;
    throw new QueryError("invalid_query");
  }
}
