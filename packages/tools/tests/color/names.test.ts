import { describe, expect, it } from "vitest";
import {
  findNamedColors,
  namedColors,
  COLOR_FAMILIES,
} from "../../src/color/names";

describe("HTML color names", () => {
  it("filters by name and family", () => {
    expect(
      findNamedColors("blue", "blue").colors.every((color) =>
        color.name.includes("blue"),
      ),
    ).toBe(true);
  });
});

it("returns the full deterministic color table and filters hex values", () => {
  expect(findNamedColors().count).toBe(148);
  expect(namedColors.map((c) => c.name)).toEqual(
    namedColors.map((c) => c.name).sort(),
  );
  expect(findNamedColors(" #FF0000 ").colors).toEqual([
    {
      name: "red",
      hex: "#FF0000",
      rgb: [255, 0, 0],
      rgbLabel: "rgb(255, 0, 0)",
      category: "red",
    },
  ]);
  expect(findNamedColors("rebeccapurple").colors[0]).toMatchObject({
    hex: "#663399",
    rgb: [102, 51, 153],
  });
  expect(findNamedColors("no-such-color")).toMatchObject({
    total: 148,
    count: 0,
    colors: [],
  });
  for (const category of COLOR_FAMILIES.filter((c) => c !== "all"))
    expect(
      findNamedColors("", category).colors.every(
        (c) => c.category === category,
      ),
    ).toBe(true);
  expect(() => findNamedColors("x".repeat(1001))).toThrow(
    "Invalid color filter",
  );
  expect(() => findNamedColors("", "invalid" as "all")).toThrow(
    "Invalid color filter",
  );
});
