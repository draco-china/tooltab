import { expect, it } from "vitest";
import { chmod, permissionDigits } from "../../src/system/permissions";

it("round trips all Unix permission bit combinations", () => {
  for (let value = 0; value < 512; value++) {
    const numeric = value.toString(8).padStart(3, "0");
    const symbolic = [...value.toString(2).padStart(9, "0")]
      .map((bit, i) => (bit === "1" ? "rwx"[i % 3] : "-"))
      .join("");
    const result = chmod(numeric);
    expect(result.numeric).toBe(numeric);
    expect(result.symbolic).toBe(symbolic);
    expect(result.command).toBe(`chmod ${numeric} <filename>`);
    expect(permissionDigits(result.permissions)).toBe(numeric);
    expect(chmod(symbolic, "symbolic")).toEqual(result);
  }
});
it("normalizes valid inputs and rejects malformed or oversized permissions", () => {
  expect(chmod(" 7 ").numeric).toBe("007");
  expect(chmod(" rwx r-x r-- ", "symbolic").numeric).toBe("754");
  for (const value of ["", "888", "0755", "7 5 5", "1".repeat(101)]) {
    expect(() => chmod(value)).toThrow("invalid-permissions");
  }
  for (const value of ["rwx", "rwsr-xr-x", "xwrxwrxwr", "rwxrwxrwxrwx"]) {
    expect(() => chmod(value, "symbolic")).toThrow("invalid-permissions");
  }
  expect(() => chmod("755", "other" as never)).toThrow("invalid-permissions");
});
