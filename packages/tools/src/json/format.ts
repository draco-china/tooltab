export const MAX_JSON_LENGTH = 2_000_000;
export const MAX_JSON_DEPTH = 256;
export const MAX_JSON_OUTPUT = 8_000_000;

export type JsonIndent =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "tab"
  | "compact";

export class JsonFormatError extends Error {
  constructor(
    public readonly code:
      | "invalid"
      | "too_large"
      | "too_deep"
      | "output_too_large",
    public readonly detail?: string,
  ) {
    super(code);
  }
}

/** Validation never feeds parsed JS numbers back into output: preserve every lexeme. */
export function formatJson(input: string, indent: JsonIndent = "2"): string {
  if (input.length > MAX_JSON_LENGTH) throw new JsonFormatError("too_large");
  if (
    !["1", "2", "3", "4", "5", "6", "7", "8", "tab", "compact"].includes(indent)
  )
    throw new Error("Invalid indentation");
  const tokens =
    input.match(/"(?:[^"\\]|\\[\s\S])*"|[^\s{}[\],:]+|[{}[\],:]/g) ?? [];
  let depth = 0;
  for (const token of tokens) {
    if (token === "{" || token === "[") depth++;
    else if (token === "}" || token === "]") depth--;
    if (depth > MAX_JSON_DEPTH) throw new JsonFormatError("too_deep");
  }
  try {
    JSON.parse(input);
  } catch (error) {
    throw new JsonFormatError(
      "invalid",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (indent === "compact") return tokens.join("");
  const unit = indent === "tab" ? "\t" : " ".repeat(Number(indent));
  const parts: string[] = [];
  let outputLength = 0;
  const append = (...chunks: string[]) => {
    for (const chunk of chunks) {
      outputLength += chunk.length;
      if (outputLength > MAX_JSON_OUTPUT)
        throw new JsonFormatError("output_too_large");
      parts.push(chunk);
    }
  };
  const line = () => `\n${unit.repeat(depth)}`;
  depth = 0;
  tokens.forEach((token, index) => {
    if (token === "{" || token === "[") {
      append(token);
      depth++;
      if (tokens[index + 1] !== (token === "{" ? "}" : "]")) append(line());
    } else if (token === "}" || token === "]") {
      depth--;
      if (tokens[index - 1] !== (token === "}" ? "{" : "[")) append(line());
      append(token);
    } else if (token === ",") append(token, line());
    else if (token === ":") append(": ");
    else append(token);
  });
  return parts.join("");
}
