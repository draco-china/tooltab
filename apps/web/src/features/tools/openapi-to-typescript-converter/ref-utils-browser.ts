// The official reference parser only needs these two predicates. Keep its
// implementation while excluding Redocly's unrelated Node I/O utilities.
export const isPlainObject = (value: unknown) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const isTruthy = (value: unknown) => Boolean(value);
