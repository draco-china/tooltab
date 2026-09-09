import * as z from "zod/v4";
import type { Operation } from "../../api/runtime/operation-contract";
import {
  generateNameUuid,
  MAX_UUID_NAME_LENGTH,
  UUID_NAMESPACES,
} from "@workspace/tools/uuid/name";

const inputSchema = z.strictObject({
  namespace: z.string().max(36).default(UUID_NAMESPACES.DNS),
  name: z.string().max(MAX_UUID_NAME_LENGTH),
});
export const uuidNameOperations: Operation[] = [3, 5].map((version) => ({
  id: `uuid-v${version}-generator`,
  name: `tooltab_uuid_v${version}_generator`,
  description: `Generate a deterministic UUID v${version} from a canonical namespace UUID and exact UTF-8 name. No normalization; not a secret token.`,
  inputSchema,
  outputSchema: z.strictObject({ uuid: z.string() }),
  bodyLimit: 700_000,
  idempotent: true,
  run(input) {
    const args = inputSchema.parse(input);
    return {
      uuid: generateNameUuid(args.namespace, args.name, version as 3 | 5),
    };
  },
}));
