export const ROLES = ["owner", "group", "others"] as const;
export const RIGHTS = ["read", "write", "execute"] as const;
export type Permissions = Record<
  (typeof ROLES)[number],
  Record<(typeof RIGHTS)[number], boolean>
>;
export function chmod(
  input: string,
  format: "numeric" | "symbolic" = "numeric",
) {
  if (input.length > 100) throw new Error("invalid-permissions");
  let numeric: string;
  if (format === "numeric") {
    const value = input.trim();
    if (!/^[0-7]{1,3}$/.test(value)) throw new Error("invalid-permissions");
    numeric = value.padStart(3, "0");
  } else if (format === "symbolic") {
    const value = input.replace(/\s/g, "");
    if (!/^(?:[r-][w-][x-]){3}$/.test(value))
      throw new Error("invalid-permissions");
    numeric = [0, 3, 6]
      .map((start) =>
        RIGHTS.reduce(
          (sum, _, i) => sum + (value[start + i] !== "-" ? 4 >> i : 0),
          0,
        ),
      )
      .join("");
  } else throw new Error("invalid-permissions");
  const permissions = Object.fromEntries(
    ROLES.map((role, i) => [
      role,
      Object.fromEntries(
        RIGHTS.map((right, j) => [
          right,
          Boolean(Number(numeric[i]) & (4 >> j)),
        ]),
      ),
    ]),
  ) as Permissions;
  const symbolic = ROLES.map((role) =>
    RIGHTS.map((right, i) => (permissions[role][right] ? "rwx"[i] : "-")).join(
      "",
    ),
  ).join("");
  return {
    numeric,
    symbolic,
    permissions,
    command: `chmod ${numeric} <filename>`,
  };
}
export function permissionDigits(permissions: Permissions) {
  return ROLES.map((role) =>
    RIGHTS.reduce(
      (sum, right, i) => sum + (permissions[role][right] ? 4 >> i : 0),
      0,
    ),
  ).join("");
}
