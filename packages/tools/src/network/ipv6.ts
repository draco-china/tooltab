/** RFC 5952: lowercase, no leading zeros, longest zero run (first on ties). */
export function formatIPv6(words: readonly number[]): string {
  if (
    words.length !== 8 ||
    words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)
  )
    throw new Error("Invalid IPv6 words");
  let start = -1;
  let length = 1;
  for (let i = 0; i < words.length; ) {
    if (words[i] !== 0) {
      i++;
      continue;
    }
    let end = i;
    while (words[end] === 0 && end < words.length) end++;
    if (end - i > length) {
      start = i;
      length = end - i;
    }
    i = end;
  }
  const parts = words.map((word) => word.toString(16));
  return start < 0
    ? parts.join(":")
    : `${parts.slice(0, start).join(":")}::${parts.slice(start + length).join(":")}`;
}

export function parseSubnetId(value: string): number | null {
  return /^[\da-f]{1,4}$/i.test(value) ? Number.parseInt(value, 16) : null;
}

export function prefixFromBytes(bytes: Uint8Array) {
  if (bytes.length !== 5)
    throw new Error("Exactly five random bytes are required");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function generateGlobalId(): string {
  if (typeof globalThis.crypto?.getRandomValues !== "function")
    throw new Error("Secure randomness unavailable");
  return prefixFromBytes(globalThis.crypto.getRandomValues(new Uint8Array(5)));
}

export function derivePrefixes(globalId: string, subnetId = 0) {
  if (
    !/^[\da-f]{10}$/.test(globalId) ||
    !Number.isInteger(subnetId) ||
    subnetId < 0 ||
    subnetId > 0xffff
  )
    throw new Error("Invalid ULA input");
  const hex = `fd${globalId}`;
  const site = [0, 4, 8].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 4), 16),
  );
  const subnet = (id: number) => `${formatIPv6([...site, id, 0, 0, 0, 0])}/64`;
  return {
    prefix: `${formatIPv6([...site, 0, 0, 0, 0, 0])}/48`,
    firstSubnet: subnet(0),
    lastSubnet: subnet(0xffff),
    selectedSubnet: subnet(subnetId),
  };
}
