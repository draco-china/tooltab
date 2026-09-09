import * as z from "zod/v4";
import type { Operation } from "./operation-contract";
import { chmod } from "@workspace/tools/system/permissions";

const permissionSet = z.strictObject({
  read: z.boolean(),
  write: z.boolean(),
  execute: z.boolean(),
});
export const chmodInputSchema = z
  .strictObject({
    input: z.string().max(100),
    format: z.enum(["numeric", "symbolic"]).default("numeric"),
  })
  .refine(({ input, format }) => {
    try {
      chmod(input, format);
      return true;
    } catch {
      return false;
    }
  }, "Invalid ordinary Unix permissions");
export const chmodOperation: Operation = {
  id: "chmod-calculator",
  name: "tooltab_chmod_calculator",
  description:
    "Convert ordinary Unix owner/group/other permissions between octal digits and rwx symbols. Returns a command template without running it. Special mode bits and symbolic modification expressions are not supported.",
  inputSchema: chmodInputSchema,
  outputSchema: z.strictObject({
    numeric: z.string(),
    symbolic: z.string(),
    command: z.string(),
    permissions: z.strictObject({
      owner: permissionSet,
      group: permissionSet,
      others: permissionSet,
    }),
  }),
  bodyLimit: 1000,
  idempotent: true,
  run(input) {
    const { input: value, format } = chmodInputSchema.parse(input);
    return chmod(value, format);
  },
};
