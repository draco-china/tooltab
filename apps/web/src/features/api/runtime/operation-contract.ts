import type * as z from "zod/v4";
import type { ArtifactStore } from "./artifacts";

export interface OperationContext {
  artifacts: ArtifactStore;
  transport: "http" | "mcp";
  inputRoots?: readonly string[];
}

export interface Operation {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
  outputSchema: z.ZodType<Record<string, unknown>>;
  bodyLimit: number;
  idempotent: boolean;
  run: (
    input: unknown,
    signal?: AbortSignal,
    context?: OperationContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}
