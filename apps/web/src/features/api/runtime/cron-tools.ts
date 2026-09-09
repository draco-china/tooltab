import * as z from "zod/v4";
import type { Operation } from "./operation-contract";
import { generateCron, inspectCron } from "@/features/tools/cron-tools/logic";

const options = {
  reference: z.string().min(1).max(40),
  timeZone: z.string().min(1).max(100).default("UTC"),
  count: z.number().int().min(1).max(20).default(10),
  locale: z.enum(["zh-CN", "en-US"]).default("en-US"),
  hashSeed: z.string().min(1).max(128).default("tooltab"),
};
export const cronParserSchema = z.strictObject({
  expression: z.string().min(1).max(512),
  ...options,
});
const field = z.strictObject({
  mode: z.enum(["every", "interval", "specific", "range"]),
  interval: z.number().int(),
  specificValues: z.array(z.number().int()).max(60),
  rangeStart: z.number().int(),
  rangeEnd: z.number().int(),
});
export const cronGeneratorSchema = z.strictObject({
  form: z.strictObject({
    minute: field,
    hour: field,
    dayOfMonth: field,
    month: field,
    dayOfWeek: field,
  }),
  ...options,
  count: z.number().int().min(1).max(20).default(5),
});
const output = z.strictObject({
  expression: z.string(),
  resolved: z.string(),
  description: z.string().nullable(),
  fields: z.array(
    z.strictObject({ id: z.string(), value: z.string(), range: z.string() }),
  ),
  runs: z.array(
    z.strictObject({
      iso: z.string(),
      local: z.string(),
      offset: z.string(),
      unixMilliseconds: z.string(),
      inSeconds: z.string(),
    }),
  ),
  timeZone: z.string(),
  reference: z.string(),
  horizon: z.string(),
  complete: z.boolean(),
  hashSeed: z.string(),
});
export const cronToolOperations: Operation[] = [
  {
    id: "cron-expression-parser",
    name: "tooltab_cron_expression_parser",
    description:
      "Validate cron-parser 5/6-field syntax, supported aliases and L/#/?/H extensions, explain in English/Chinese, and calculate up to 20 future occurrences in an IANA zone. Explicit ISO reference; 8-year search horizon; H fixed seed. No scheduling side effects.",
    inputSchema: cronParserSchema,
    outputSchema: output,
    bodyLimit: 10000,
    idempotent: true,
    run(v) {
      const p = cronParserSchema.parse(v);
      return inspectCron(p.expression, p);
    },
  },
  {
    id: "cron-expression-generator",
    name: "tooltab_cron_expression_generator",
    description:
      "Build a five-field cron expression from every/interval/specific/range modes, validate with cron-parser and return real next occurrences. Day-of-month/weekday restrictions use OR; Sunday=0; empty specific list means wildcard. No task is scheduled.",
    inputSchema: cronGeneratorSchema,
    outputSchema: output,
    bodyLimit: 20000,
    idempotent: true,
    run(v) {
      const p = cronGeneratorSchema.parse(v);
      return generateCron(p.form, p);
    },
  },
];
