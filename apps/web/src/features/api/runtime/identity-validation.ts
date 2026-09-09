import { email } from "@workspace/tools/validation/email";
import * as z from "zod/v4";
import { vat } from "@workspace/tools/validation/vat";
import { prcId } from "@workspace/tools/validation/prc-id";
import type { Operation } from "./operation-contract";
export const identityInputSchema = z.strictObject({
  input: z.string().max(4096),
});
export const residentInputSchema = identityInputSchema.extend({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const output = z.strictObject({
  normalized: z.string(),
  valid: z.boolean(),
  checks: z.record(z.string(), z.boolean().nullable()),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});
export const identityOperations: Operation[] = [
  {
    id: "email-validator",
    name: "tooltab_email_validator",
    description:
      "Local ASCII dot-atom email profile, individual syntax/length checks and normalized domain. No quoted local parts, SMTPUTF8, DNS/MX or mailbox existence check.",
    inputSchema: identityInputSchema,
    outputSchema: output,
    bodyLimit: 30000,
    idempotent: true,
    run(v) {
      return email(identityInputSchema.parse(v).input);
    },
  },
  {
    id: "eu-vat-number-validator",
    name: "tooltab_eu_vat_number_validator",
    description:
      "EU27 local VAT formats and supported checksum rules including Netherlands modulo11/97. Unchecked cases are null, not an existence verdict. No VIES or registration lookup.",
    inputSchema: identityInputSchema,
    outputSchema: output,
    bodyLimit: 30000,
    idempotent: true,
    run(v) {
      return vat(identityInputSchema.parse(v).input);
    },
  },
  {
    id: "prc-id-validator",
    name: "tooltab_prc_id_validator",
    description:
      "Local18-digit PRC ID format/date/checksum and fixed region snapshot matching. Explicit today YYYY-MM-DD for age/future-date checks. Not identity, issuance or citizenship proof.",
    inputSchema: residentInputSchema,
    outputSchema: output,
    bodyLimit: 30000,
    idempotent: true,
    run(v) {
      const p = residentInputSchema.parse(v);
      return prcId(p.input, p.today);
    },
  },
];
