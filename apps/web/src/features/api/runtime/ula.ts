import * as z from "zod/v4";
import {
  derivePrefixes,
  generateGlobalId,
  parseSubnetId,
} from "@workspace/tools/network/ipv6";

export const toolId = "ipv6-ula-generator";
export const toolName = "tooltab_ipv6_ula_generator";
export const inputSchema = z.strictObject({
  subnetId: z
    .string()
    .regex(/^[\da-f]{1,4}$/i)
    .default("0000"),
});
export const outputSchema = z.strictObject({
  globalId: z.string().regex(/^[\da-f]{10}$/),
  subnetId: z.string(),
  prefix: z.string(),
  firstSubnet: z.string(),
  lastSubnet: z.string(),
  selectedSubnet: z.string(),
});
export function generateUla(input: unknown) {
  const { subnetId } = inputSchema.parse(input);
  const globalId = generateGlobalId();
  return outputSchema.parse({
    globalId,
    subnetId: subnetId.toLowerCase().padStart(4, "0"),
    ...derivePrefixes(globalId, parseSubnetId(subnetId) ?? 0),
  });
}
export const toolDescription =
  "Generate an RFC 4193 IPv6 ULA /48 using 40 cryptographically random bits; derive RFC 5952 /64 subnet prefixes. Runs locally without network or files.";
export const toolMetadata = {
  id: toolId,
  name: toolName,
  description: toolDescription,
  inputSchema: z.toJSONSchema(inputSchema, { io: "input" }),
  outputSchema: z.toJSONSchema(outputSchema),
  network: false,
  files: false,
};
