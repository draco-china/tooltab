export type CodeTheme = "light" | "dark";

export interface HighlightToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export interface MonacoThemeData {
  base: "vs" | "vs-dark" | "hc-black" | "hc-light";
  inherit: boolean;
  rules: Array<{ token: string; foreground?: string; fontStyle?: string }>;
  colors: Record<string, string>;
  encodedTokensColors?: string[];
  semanticColors: string[];
}

export type HighlightWorkerRequest =
  | {
      id: number;
      kind: "highlight";
      code: string;
      language: string;
      theme: CodeTheme;
    }
  | {
      id: number;
      kind: "tokens";
      code: string;
      language: string;
      theme: CodeTheme;
    }
  | { id: number; kind: "theme"; theme: CodeTheme };

export type HighlightWorkerInput = HighlightWorkerRequest extends infer Request
  ? Request extends { id: number }
    ? Omit<Request, "id">
    : never
  : never;

export type HighlightWorkerResponse =
  | { id: number; kind: "highlight"; lines: HighlightToken[][] }
  | { id: number; kind: "tokens"; data: number[] }
  | { id: number; kind: "theme"; theme: MonacoThemeData }
  | { id: number; kind: "error"; error: string };
