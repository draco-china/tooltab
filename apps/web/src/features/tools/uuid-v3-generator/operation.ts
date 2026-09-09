import { generateUuidV3 } from "@workspace/tools/uuid/name";

export function generateUuidV3Operation(namespace: string, name: string) {
  return { uuid: generateUuidV3(namespace, name) };
}
