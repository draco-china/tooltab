import sharp from "sharp";
import { MAX_PDF_INPUT, MAX_PDF_OUTPUT } from "../../src/pdf/core";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import {
  checkImageSource,
  checkImageSize,
  imageKind,
  jpegQuality,
  type ImagePdfOptions,
  imageLayout,
  imagePdfDefaults,
  imagesToPdf,
  qpdfRuntime,
  removeOwnerProtection,
} from "../../src/pdf/finishing";

async function jpeg(width = 4, height = 2) {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer(),
  );
}

describe("PDF finishing images", () => {
  it("creates real JPEG PDF pages in input order with progress and paper layout", async () => {
    const bytes = await jpeg();
    const portrait = await jpeg(2, 4);
    const progress: number[] = [];
    const result = await imagesToPdf(
      {
        kind: "images",
        sources: [
          { bytes, name: "first.jpg", rotation: 0 },
          { bytes: portrait, name: "second.jpg", rotation: 0 },
        ],
        options: imagePdfDefaults,
      },
      async (source, quality) => {
        expect(quality).toBe(0.82);
        const metadata = await sharp(source.bytes).metadata();
        return {
          bytes: source.bytes,
          // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
          width: metadata.width!,
          // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
          height: metadata.height!,
        };
      },
      (done) => progress.push(done),
    );
    const output = await PDFDocument.load(result.bytes);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPages().map((page) => page.getSize())).toEqual([
      { width: 841.89, height: 595.28 },
      { width: 595.28, height: 841.89 },
    ]);
    expect(progress).toEqual([1, 2]);
    expect(result.warnings).toEqual([
      "jpeg_reencoded",
      "white_background",
      "first_animation_frame",
    ]);
  });

  it("keeps source validation and layout limits separate from environment preparation", async () => {
    expect(
      checkImageSource({ bytes: await jpeg(), name: "x", rotation: 0 }),
    ).toBe("jpeg");
    expect(() =>
      checkImageSource({ bytes: new Uint8Array(), name: "x", rotation: 0 }),
    ).toThrow("read_failed");
    expect(() =>
      checkImageSource({
        bytes: new Uint8Array([1]),
        name: "x",
        rotation: 45 as 0,
      }),
    ).toThrow("invalid_options");
    expect(
      imageLayout(
        {
          ...imagePdfDefaults,
          fit: "cover",
          orientation: "landscape",
          marginMm: 0,
        },
        2,
        4,
      ),
    ).toMatchObject({
      pageWidth: 841.89,
      pageHeight: 595.28,
      width: 841.89,
      height: 1683.78,
    });
  });
});

describe("qpdf adapter boundary", () => {
  it("validates its structural runtime and cleans both files after a real PDF protocol result", async () => {
    const input = await (await PDFDocument.create()).save();
    const outputDoc = await PDFDocument.create();
    outputDoc.addPage();
    const output = new Uint8Array(await outputDoc.save());
    const files = new Map<string, Uint8Array>();
    const removed: string[] = [];
    const runtime = qpdfRuntime({
      callMain: (args: string[]) => {
        if (args[0] === "--requires-password") return 2;
        if (args[0] === "--decrypt") {
          files.set("/output.pdf", output);
          return 0;
        }
        if (args[0] === "--is-encrypted") return 2;
        if (args[0] === "--check") return 0;
        return 1;
      },
      FS: {
        writeFile: (path: string, bytes: Uint8Array) => files.set(path, bytes),
        // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
        readFile: (path: string) => files.get(path)!,
        unlink: (path: string) => {
          removed.push(path);
          files.delete(path);
        },
      },
    });
    await expect(
      removeOwnerProtection(input, async () => runtime),
    ).resolves.toMatchObject({
      pages: 1,
      wasEncrypted: false,
      warnings: ["signatures_invalidated", "already_unrestricted"],
    });
    expect(removed).toEqual(["/input.pdf", "/output.pdf"]);
    expect(() => qpdfRuntime({})).toThrow("unsupported");
  });
});

it("writes clipping operators into real PDF pages after image rotation", async () => {
  const bytes = await jpeg(40, 20);
  const result = await imagesToPdf(
    {
      kind: "images",
      sources: [
        { bytes, name: "landscape.jpg", rotation: 0 },
        { bytes, name: "portrait.jpg", rotation: 90 },
      ],
      options: { ...imagePdfDefaults, fit: "cover", marginMm: 20 },
    },
    async (source, quality) => {
      const { data, info } = await sharp(source.bytes)
        .rotate(source.rotation)
        .jpeg({ quality: Math.round(quality * 100) })
        .toBuffer({ resolveWithObject: true });
      return {
        bytes: new Uint8Array(data),
        width: info.width,
        height: info.height,
      };
    },
  );
  const doc = await PDFDocument.load(result.bytes);
  expect(doc.getPages().map((page) => page.getSize())).toEqual([
    { width: 841.89, height: 595.28 },
    { width: 595.28, height: 841.89 },
  ]);
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    expect(contents).toBeInstanceOf(PDFArray);
    if (!(contents instanceof PDFArray))
      throw new Error("Missing content array");
    const stream = doc.context.lookup(contents.get(0));
    expect(stream).toBeInstanceOf(PDFRawStream);
    if (!(stream instanceof PDFRawStream))
      throw new Error("Missing content stream");
    const operators = new TextDecoder().decode(
      decodePDFRawStream(stream).decode(),
    );
    expect(operators).toContain("W\nn");
    const rectangle = operators.match(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/);
    expect(rectangle).not.toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
    const [, x, y, width, height] = rectangle!.map(Number);
    const margin = (20 * 72) / 25.4;
    expect(x).toBeCloseTo(margin);
    expect(y).toBeCloseTo(margin);
    expect(width).toBeCloseTo(page.getWidth() - margin * 2);
    expect(height).toBeCloseTo(page.getHeight() - margin * 2);
  }
});

it("rejects invalid dimensions and options before preparing image data", async () => {
  for (const [width, height] of [
    [NaN, 1],
    [1, Infinity],
    [0, 1],
    [1, 0],
    [16385, 1],
    [1, 16385],
    [8001, 8000],
    [1.5, 2],
  ])
    expect(() => checkImageSize(width, height)).toThrow("too_large");
  expect(() => checkImageSize(8000, 8000)).not.toThrow();
  expect(() => checkImageSize(16384, 1)).not.toThrow();
  let prepared = 0;
  const source = {
    bytes: await jpeg(),
    name: "source.jpg",
    rotation: 0 as const,
  };
  for (const patch of [
    { pageSize: "unknown" },
    { orientation: "unknown" },
    { fit: "unknown" },
    { quality: "unknown" },
    { marginMm: -1 },
    { marginMm: 41 },
    { marginMm: NaN },
  ]) {
    await expect(
      imagesToPdf(
        {
          kind: "images",
          sources: [source],
          options: { ...imagePdfDefaults, ...patch } as ImagePdfOptions,
        },
        async () => {
          prepared++;
          return { bytes: source.bytes, width: 4, height: 2 };
        },
      ),
    ).rejects.toThrow("invalid_options");
  }
  for (const sources of [[], Array.from({ length: 1001 }, () => source)]) {
    await expect(
      imagesToPdf(
        { kind: "images", sources, options: imagePdfDefaults },
        async () => {
          prepared++;
          return { bytes: source.bytes, width: 4, height: 2 };
        },
      ),
    ).rejects.toThrow("invalid_options");
  }
  expect(prepared).toBe(0);
  expect([
    jpegQuality("best"),
    jpegQuality("balanced"),
    jpegQuality("small"),
  ]).toEqual([0.92, 0.82, 0.68]);
});

it("identifies supported raster containers from actual encoded files", async () => {
  for (const format of ["jpeg", "png", "gif", "webp", "avif"] as const) {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .toFormat(format)
      .toBuffer();
    expect(imageKind(bytes)).toBe(format);
  }
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode("<svg/>"),
    new TextEncoder().encode("RIFF1234WAVE"),
  ]) {
    expect(() => imageKind(bytes)).toThrow("unsupported");
  }
});

it("uses the specified paper dimensions and centers contained images", () => {
  const papers = [
    ["a3", 841.89, 1190.55],
    ["a4", 595.28, 841.89],
    ["a5", 419.53, 595.28],
    ["b5", 498.9, 708.66],
    ["letter", 612, 792],
    ["legal", 612, 1008],
    ["tabloid", 792, 1224],
  ] as const;
  for (const [pageSize, width, height] of papers) {
    const portrait = imageLayout(
      {
        ...imagePdfDefaults,
        pageSize,
        orientation: "portrait",
        marginMm: 0,
      },
      200,
      100,
    );
    expect(portrait.pageWidth).toBe(width);
    expect(portrait.pageHeight).toBe(height);
    expect(portrait.width).toBeCloseTo(width);
    expect(portrait.height).toBeCloseTo(width / 2);
    expect(portrait.x).toBeCloseTo(0);
    expect(portrait.y).toBeCloseTo((height - width / 2) / 2);
    const landscape = imageLayout(
      {
        ...imagePdfDefaults,
        pageSize,
        orientation: "landscape",
        marginMm: 0,
      },
      100,
      200,
    );
    expect(landscape.pageWidth).toBe(height);
    expect(landscape.pageHeight).toBe(width);
    expect(landscape.height).toBeCloseTo(width);
    expect(landscape.width).toBeCloseTo(width / 2);
    expect(landscape.x).toBeCloseTo((height - width / 2) / 2);
    expect(landscape.y).toBeCloseTo(0);
  }
});

it("rejects empty and unrecognized inputs before creating the qpdf runtime", async () => {
  let created = 0;
  const create = async () => {
    created++;
    throw new Error("qpdf must not start for an invalid PDF");
  };
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode("not a PDF"),
  ]) {
    await expect(removeOwnerProtection(bytes, create)).rejects.toThrow(
      "invalid_pdf",
    );
  }
  expect(created).toBe(0);
});

it("propagates image preparation failure and reports progress only for completed pages", async () => {
  const bytes = await jpeg();
  const job = {
    kind: "images" as const,
    sources: [
      { bytes, name: "first.jpg", rotation: 0 as const },
      { bytes, name: "second.jpg", rotation: 0 as const },
    ],
    options: imagePdfDefaults,
  };
  const progress: number[] = [];
  const failure = new Error("image decoder failed");
  await expect(
    imagesToPdf(
      job,
      async (source) => {
        if (source.name === "second.jpg") throw failure;
        return { bytes: source.bytes, width: 4, height: 2 };
      },
      (done) => progress.push(done),
    ),
  ).rejects.toBe(failure);
  expect(progress).toEqual([1]);
  const result = await imagesToPdf(job, async (source) => ({
    bytes: source.bytes,
    width: 4,
    height: 2,
  }));
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2);
});

it("rejects individual and cumulative image byte limits before decoding", async () => {
  const oversized = new Uint8Array(MAX_PDF_INPUT + 1);
  oversized.set([0xff, 0xd8]);
  expect(() =>
    checkImageSource({ bytes: oversized, name: "large.jpg", rotation: 0 }),
  ).toThrow("too_large");
  let prepared = 0;
  const half = oversized.subarray(0, MAX_PDF_INPUT / 2 + 1);
  await expect(
    imagesToPdf(
      {
        kind: "images",
        sources: [
          { bytes: half, name: "one.jpg", rotation: 0 },
          { bytes: half, name: "two.jpg", rotation: 0 },
        ],
        options: imagePdfDefaults,
      },
      async () => {
        prepared++;
        return { bytes: half, width: 1, height: 1 };
      },
    ),
  ).rejects.toThrow("too_large");
  expect(prepared).toBe(0);
  let created = 0;
  await expect(
    removeOwnerProtection(oversized, async () => {
      created++;
      throw new Error("must not create qpdf");
    }),
  ).rejects.toThrow("too_large");
  expect(created).toBe(0);
});

it("validates decoded image dimensions before embedding and remains reusable", async () => {
  const bytes = await jpeg();
  const job = {
    kind: "images" as const,
    sources: [{ bytes, name: "one.jpg", rotation: 0 as const }],
    options: imagePdfDefaults,
  };
  const progress: number[] = [];
  for (const [width, height] of [
    [0, 2],
    [4, Infinity],
    [8001, 8000],
  ]) {
    await expect(
      imagesToPdf(
        job,
        async () => ({ bytes, width, height }),
        (done) => progress.push(done),
      ),
    ).rejects.toThrow("too_large");
  }
  expect(progress).toEqual([]);
  const recovered = await imagesToPdf(job, async () => ({
    bytes,
    width: 4,
    height: 2,
  }));
  const doc = await PDFDocument.load(recovered.bytes);
  expect(doc.getPageCount()).toBe(1);
  expect(doc.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
});

it("rejects incomplete qpdf runtimes and preserves a valid runtime identity", () => {
  const fs = {
    writeFile: (_path: string, _bytes: Uint8Array) => {},
    readFile: (_path: string) => new Uint8Array(),
    unlink: (_path: string) => {},
  };
  for (const value of [
    null,
    undefined,
    1,
    "module",
    {},
    { callMain: 1 },
    { callMain: () => 0 },
    { callMain: () => 0, FS: null },
    { callMain: () => 0, FS: "filesystem" },
    { callMain: () => 0, FS: {} },
    { callMain: () => 0, FS: { ...fs, writeFile: null } },
    { callMain: () => 0, FS: { ...fs, readFile: null } },
    { callMain: () => 0, FS: { ...fs, unlink: null } },
  ])
    expect(() => qpdfRuntime(value)).toThrow("unsupported");
  const runtime = { callMain: (_args: string[]) => 0, FS: fs };
  expect(qpdfRuntime(runtime)).toBe(runtime);
});

it("cleans qpdf files when its external runtime throws during execution", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const bytes = await document.save();
  const failure = new Error("qpdf execution failed");
  const removed: string[] = [];
  const files = new Map<string, Uint8Array>();
  await expect(
    removeOwnerProtection(bytes, async () => ({
      callMain() {
        throw failure;
      },
      FS: {
        writeFile(path, value) {
          files.set(path, value);
        },
        readFile(path) {
          const value = files.get(path);
          if (!value) throw new Error("missing file");
          return value;
        },
        unlink(path) {
          removed.push(path);
          if (!files.delete(path)) throw new Error("missing file");
        },
      },
    })),
  ).rejects.toBe(failure);
  expect(removed).toEqual(["/input.pdf", "/output.pdf"]);
  expect(files.size).toBe(0);
});

it("rejects oversized prepared image output before embedding it", async () => {
  const source = await jpeg();
  const oversized = new Uint8Array(MAX_PDF_OUTPUT + 1);
  const progress: number[] = [];
  await expect(
    imagesToPdf(
      {
        kind: "images",
        sources: [{ bytes: source, name: "source.jpg", rotation: 0 }],
        options: imagePdfDefaults,
      },
      async () => ({ bytes: oversized, width: 4, height: 2 }),
      (done) => progress.push(done),
    ),
  ).rejects.toThrow("too_large");
  expect(progress).toEqual([]);
});

it("requires actual byte arrays for image sources", () => {
  for (const bytes of [null, undefined, [], new ArrayBuffer(2), "image"]) {
    expect(() =>
      checkImageSource({
        bytes: bytes as unknown as Uint8Array,
        name: "invalid.jpg",
        rotation: 0,
      }),
    ).toThrow("read_failed");
  }
});

it("preserves runtime initialization failures for valid PDF input", async () => {
  const document = await PDFDocument.create();
  document.addPage([200, 300]);
  const bytes = await document.save();
  const failure = new Error("WASM initialization failed");
  let created = 0;
  await expect(
    removeOwnerProtection(bytes, async () => {
      created++;
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(created).toBe(1);
  expect((await PDFDocument.load(bytes)).getPage(0).getSize()).toEqual({
    width: 200,
    height: 300,
  });
});

it("rejects failed qpdf status checks and always releases both temporary paths", async () => {
  const document = await PDFDocument.create();
  document.addPage([100, 120]);
  const bytes = await document.save();
  const scenarios = [
    {
      needs: 0,
      decrypt: 0,
      encrypted: 2,
      check: 0,
      error: "encrypted_pdf",
      calls: 1,
    },
    {
      needs: 1,
      decrypt: 0,
      encrypted: 2,
      check: 0,
      error: "invalid_pdf",
      calls: 1,
    },
    {
      needs: 2,
      decrypt: 2,
      encrypted: 2,
      check: 0,
      error: "invalid_pdf",
      calls: 2,
    },
    {
      needs: 2,
      decrypt: 0,
      encrypted: 0,
      check: 0,
      error: "invalid_pdf",
      calls: 3,
    },
    {
      needs: 2,
      decrypt: 0,
      encrypted: 2,
      check: 2,
      error: "invalid_pdf",
      calls: 4,
    },
  ];
  for (const scenario of scenarios) {
    const removed: string[] = [];
    const commands: string[][] = [];
    const files = new Map<string, Uint8Array>();
    await expect(
      removeOwnerProtection(bytes, async () => ({
        callMain(args: string[]) {
          commands.push(args);
          switch (args[0]) {
            case "--requires-password":
              return scenario.needs;
            case "--decrypt":
              files.set("/output.pdf", bytes);
              return scenario.decrypt;
            case "--is-encrypted":
              return scenario.encrypted;
            case "--check":
              return scenario.check;
            default:
              throw new Error(`Unexpected command: ${args[0]}`);
          }
        },
        FS: {
          writeFile(path: string, content: Uint8Array) {
            files.set(path, content);
          },
          readFile(path: string) {
            const content = files.get(path);
            if (!content) throw new Error("missing output");
            return content;
          },
          unlink(path: string) {
            removed.push(path);
            if (!files.delete(path)) throw new Error("missing file");
          },
        },
      })),
    ).rejects.toThrow(scenario.error);
    expect(commands).toHaveLength(scenario.calls);
    expect(commands[0]).toEqual(["--requires-password", "/input.pdf"]);
    expect(removed).toEqual(["/input.pdf", "/output.pdf"]);
    expect(files.size).toBe(0);
  }
});

it("classifies actually encrypted PDF input and preserves unlocked page geometry", async () => {
  const original = await PDFDocument.create();
  original.addPage([123, 456]);
  const clearBytes = await original.save();
  original.encrypt({
    userPassword: "",
    ownerPassword: "owner",
    permissions: { copying: false },
  });
  const encryptedBytes = await original.save();
  await expect(PDFDocument.load(encryptedBytes)).rejects.toThrow();
  for (const needs of [0, 1, 2, 3]) {
    const files = new Map<string, Uint8Array>();
    const removed: string[] = [];
    const commands: string[] = [];
    const operation = removeOwnerProtection(encryptedBytes, async () => ({
      callMain(args: string[]) {
        commands.push(args[0]);
        switch (args[0]) {
          case "--requires-password":
            return needs;
          case "--decrypt":
            files.set("/output.pdf", clearBytes);
            return 0;
          case "--is-encrypted":
            return 2;
          case "--check":
            return 0;
          default:
            throw new Error("Unexpected qpdf command");
        }
      },
      FS: {
        writeFile(path: string, content: Uint8Array) {
          files.set(path, content);
        },
        readFile(path: string) {
          const result = files.get(path);
          if (!result) throw new Error("Missing output");
          return result;
        },
        unlink(path: string) {
          removed.push(path);
          files.delete(path);
        },
      },
    }));
    if (needs === 3) {
      const result = await operation;
      expect(result.wasEncrypted).toBe(true);
      expect(result.warnings).toEqual(["signatures_invalidated"]);
      expect(result.pages).toBe(1);
      const decoded = await PDFDocument.load(result.bytes);
      expect(decoded.isEncrypted).toBe(false);
      expect(decoded.getPage(0).getSize()).toEqual({ width: 123, height: 456 });
      expect(commands).toEqual([
        "--requires-password",
        "--decrypt",
        "--is-encrypted",
        "--check",
      ]);
    } else {
      await expect(operation).rejects.toThrow("encrypted_pdf");
      expect(commands).toEqual(["--requires-password"]);
    }
    expect(removed).toEqual(["/input.pdf", "/output.pdf"]);
    expect(files.size).toBe(0);
  }
});

it("rejects oversized qpdf output and excessive real PDF page counts with cleanup", async () => {
  const inputDocument = await PDFDocument.create();
  inputDocument.addPage([10, 10]);
  const input = await inputDocument.save();
  const excessive = await PDFDocument.create();
  for (let page = 0; page <= 10000; page++) excessive.addPage([1, 1]);
  const manyPages = await excessive.save();
  for (const output of [new Uint8Array(MAX_PDF_OUTPUT + 1), manyPages]) {
    const removed: string[] = [];
    const commands: string[] = [];
    await expect(
      removeOwnerProtection(input, async () => ({
        callMain(args: string[]) {
          commands.push(args[0]);
          if (args[0] === "--requires-password" || args[0] === "--is-encrypted")
            return 2;
          if (args[0] === "--decrypt" || args[0] === "--check") return 0;
          throw new Error("Unexpected qpdf command");
        },
        FS: {
          writeFile(path: string, bytes: Uint8Array) {
            expect(path).toBe("/input.pdf");
            expect(bytes).toBe(input);
          },
          readFile(path: string) {
            expect(path).toBe("/output.pdf");
            return output;
          },
          unlink(path: string) {
            removed.push(path);
          },
        },
      })),
    ).rejects.toThrow("too_large");
    expect(removed).toEqual(["/input.pdf", "/output.pdf"]);
    expect(commands).toEqual(
      output === manyPages
        ? ["--requires-password", "--decrypt", "--is-encrypted", "--check"]
        : ["--requires-password", "--decrypt"],
    );
  }
});

it("recognizes a complete 24-bit BMP image without treating unrelated RIFF containers as WebP", () => {
  // One red pixel, a 40-byte DIB header, and a four-byte aligned BGR row.
  const bmp = new Uint8Array(58);
  const header = new DataView(bmp.buffer);
  bmp.set([0x42, 0x4d]);
  header.setUint32(2, bmp.length, true);
  header.setUint32(10, 54, true);
  header.setUint32(14, 40, true);
  header.setInt32(18, 1, true);
  header.setInt32(22, 1, true);
  header.setUint16(26, 1, true);
  header.setUint16(28, 24, true);
  header.setUint32(34, 4, true);
  bmp.set([0, 0, 255, 0], 54);
  expect(imageKind(bmp)).toBe("bmp");
  expect(() =>
    imageKind(new TextEncoder().encode("RIFF\u0004\u0000\u0000\u0000WAVE")),
  ).toThrow("unsupported");
  expect(() =>
    imageKind(
      new TextEncoder().encode(
        "\u0000\u0000\u0000\u0018ftypisom\u0000\u0000\u0000\u0000isommp42",
      ),
    ),
  ).toThrow("unsupported");
});

it("maps unreadable or still-encrypted qpdf output to a domain error and releases files", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([80, 90]);
  const input = await doc.save();
  doc.encrypt({ userPassword: "secret", ownerPassword: "owner" });
  const encrypted = await doc.save();
  for (const output of [new TextEncoder().encode("not a PDF"), encrypted]) {
    const removed: string[] = [];
    await expect(
      removeOwnerProtection(input, async () => ({
        callMain(args: string[]) {
          return args[0] === "--requires-password" ||
            args[0] === "--is-encrypted"
            ? 2
            : 0;
        },
        FS: {
          writeFile() {},
          readFile() {
            return output;
          },
          unlink(path: string) {
            removed.push(path);
          },
        },
      })),
    ).rejects.toMatchObject({ code: "invalid_pdf", message: "invalid_pdf" });
    expect(removed).toEqual(["/input.pdf", "/output.pdf"]);
  }
});

it("rejects a saved PDF when container overhead pushes valid embedded JPEG bytes over the output limit", async () => {
  const original = await jpeg(1, 1);
  // JPEG decoders permit data after EOI. The actual embedded stream reaches
  // the limit; PDF objects and cross references then exceed it on save.
  const padded = new Uint8Array(MAX_PDF_OUTPUT);
  padded.set(original);
  const progress: number[] = [];
  await expect(
    imagesToPdf(
      {
        kind: "images",
        sources: [{ name: "pixel.jpg", bytes: original, rotation: 0 }],
        options: imagePdfDefaults,
      },
      async () => ({ bytes: padded, width: 1, height: 1 }),
      (done) => progress.push(done),
    ),
  ).rejects.toMatchObject({ code: "too_large" });
  expect(progress).toEqual([1]);
}, 30000);
