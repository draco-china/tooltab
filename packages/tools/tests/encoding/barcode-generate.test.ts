import { describe, expect, test } from "vitest";
import { generateBarcode } from "../../src/encoding/barcode-generate";

const measureText = (text: string, fontSize: number) => text.length * fontSize;

const validFormats = [
  ["CODE128", "ABC123"],
  ["CODE128A", "ABC123"],
  ["CODE128B", "ABC123"],
  ["CODE128C", "123456"],
  ["EAN13", "5901234123457"],
  ["EAN8", "96385074"],
  ["EAN5", "12345"],
  ["EAN2", "12"],
  ["UPC", "12345678901"],
  ["UPCE", "04252614"],
  ["CODE39", "HELLO-39"],
  ["ITF", "123456"],
  ["ITF14", "12345678901231"],
  ["MSI", "123456"],
  ["MSI10", "123456"],
  ["MSI11", "123456"],
  ["MSI1010", "123456"],
  ["MSI1110", "123456"],
  ["pharmacode", "12345"],
  ["codabar", "A123456A"],
  ["CODE93", "ABC123"],
] as const;

describe("generateBarcode", () => {
  test.each(validFormats)(
    "%s produces a measurable SVG with bars and a caption",
    async (format, text) => {
      const result = await generateBarcode({ format, text }, measureText);

      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.svg).toContain(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${result.width}" height="${result.height}" viewBox="0 0 ${result.width} ${result.height}">`,
      );
      expect(result.svg).toContain('<rect width="100%" height="100%"');
      expect((result.svg.match(/<rect /g) ?? []).length).toBeGreaterThan(1);
      expect(result.svg).toContain("<text ");
      expect(result.svg).toMatch(/<text [^>]*>[^<]+<\/text>/);
      expect(result.svg).toContain('fill="#000000"');
      expect(result.svg).toContain('fill="#ffffff"');
    },
  );

  test("uses defaults and returns exact geometry for a deterministic metric", async () => {
    const result = await generateBarcode({}, measureText);

    expect(result.width).toBeTypeOf("number");
    expect(result.height).toBeTypeOf("number");
    expect(result.svg).toContain('text-anchor="start"');
    expect(result.svg).toContain('font-size="20"');
    expect(result.svg).toContain("0123456789");
    expect(result.svg).toContain('x="');
    expect(result.svg).toContain('y="');
  });

  test("honors dimensions, colors, hidden captions, alignment, and text position", async () => {
    const result = await generateBarcode(
      {
        text: "ABC123",
        format: "CODE128",
        width: 3,
        height: 80,
        margin: 4,
        displayValue: false,
        lineColor: "#123456",
        background: "#abcdef",
      },
      measureText,
    );

    expect(result.svg).toContain('fill="#abcdef"');
    expect(result.svg).toContain('fill="#123456"');
    expect(result.svg).not.toContain("<text ");
    expect(result.svg).toContain('height="80"');

    const top = await generateBarcode(
      {
        text: "ABC123",
        format: "CODE128",
        margin: 4,
        textAlign: "right",
        textPosition: "top",
        fontSize: 12,
      },
      measureText,
    );
    expect(top.svg).toContain('text-anchor="end"');
    expect(top.svg).toContain('font-size="12"');
    expect(top.svg).toMatch(/<text x="[0-9.]+" y="14"/);

    const left = await generateBarcode(
      { text: "ABC123", format: "CODE128", textAlign: "left" },
      measureText,
    );
    expect(left.svg).toContain('text-anchor="start"');
  });

  test("escapes caption XML", async () => {
    const result = await generateBarcode(
      { text: "A&B<1>", format: "CODE128" },
      measureText,
    );

    expect(result.svg).toContain(">A&amp;B&lt;1&gt;</text>");
    expect(result.svg).not.toContain(">A&B<");
  });

  test("rejects invalid options before encoding", async () => {
    await expect(
      generateBarcode({ text: 123 }, measureText),
    ).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      generateBarcode({ format: "not-a-format" }, measureText),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      generateBarcode({ text: "x".repeat(100001) }, measureText),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      generateBarcode({ text: "ok", unexpected: true }, measureText),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  test("rejects invalid barcode data and capacity limits", async () => {
    await expect(
      generateBarcode({ format: "EAN13", text: "123" }, measureText),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      generateBarcode(
        { text: "x".repeat(100000), width: 8, height: 300 },
        measureText,
      ),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      generateBarcode({ text: "ABC123" }, () => Number.MAX_SAFE_INTEGER),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("barcode caption and output boundaries", () => {
  test("represents encoded control characters with valid XML control pictures", async () => {
    const result = await generateBarcode(
      { text: "\u0000\u001f\u007f", format: "CODE128" },
      measureText,
    );
    expect(result.svg).toContain(">␀␟␡</text>");
    expect(
      Array.from(result.svg).every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    ).toBe(true);
  });

  test("encodes empty content as the established single-space fallback", async () => {
    expect(await generateBarcode({ text: "" }, measureText)).toEqual(
      await generateBarcode({ text: " " }, measureText),
    );
  });

  test("escapes both XML quote characters in captions", async () => {
    const result = await generateBarcode({ text: `"'` }, measureText);
    expect(result.svg).toContain(">&quot;&apos;</text>");
  });

  test("bounds actual encoded bars before SVG construction", async () => {
    await expect(
      generateBarcode(
        { text: "X".repeat(2000), format: "CODE39", width: 8, height: 300 },
        measureText,
      ),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  test("rejects a finite font metric exceeding the final pixel budget", async () => {
    await expect(
      generateBarcode({ text: "ABC", height: 300 }, () => 200000),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  test("rejects a raster-incompatible width even within the pixel budget", async () => {
    await expect(
      generateBarcode({ text: "ABC", height: 20 }, () => 65536),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});

test.each([
  ["CODE128", "A\u007fB", "A␡B"],
  ["CODE128B", "A\u007fB", "A␡B"],
  ["CODE128A", "A\u0000B", "A␀B"],
])(
  "preserves mixed control characters in %s captions",
  async (format, text, caption) => {
    const result = await generateBarcode({ format, text }, () => 0);
    expect(result.svg).toContain(`>${caption}</text>`);
    const hidden = await generateBarcode(
      { format, text, displayValue: false },
      () => 0,
    );
    const bars = (svg: string) =>
      [...svg.matchAll(/<rect x="[^"]+"[^>]+\/>/g)].map((match) => match[0]);
    expect(bars(result.svg)).toEqual(bars(hidden.svg));
    const plain = await generateBarcode(
      { format, text: "AB", displayValue: false },
      () => 0,
    );
    expect(bars(hidden.svg)).not.toEqual(bars(plain.svg));
  },
);

test.each(validFormats)(
  "keeps hidden captions from displacing %s bars",
  async (format, text) => {
    const options = {
      format,
      text,
      displayValue: false,
      height: 20,
      margin: 0,
    };
    const top = await generateBarcode(
      { ...options, textPosition: "top" },
      measureText,
    );
    const bottom = await generateBarcode(
      { ...options, textPosition: "bottom" },
      measureText,
    );
    expect(top).toEqual(bottom);
    expect(top.svg).not.toContain("<text");
    const bars = [
      ...top.svg.matchAll(
        /<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/g,
      ),
    ];
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(Number(bar[1])).toBe(0);
      expect(Number(bar[2])).toBeGreaterThan(0);
      expect(Number(bar[1]) + Number(bar[2])).toBeLessThanOrEqual(top.height);
    }
  },
);
