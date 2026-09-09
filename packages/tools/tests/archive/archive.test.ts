import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { TextReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { gzipSync } from "fflate";
import { packTar } from "modern-tar";
import { expect, it } from "vitest";
import { processArchive } from "../../src/archive/runtime";
import {
  ARCHIVE_INPUT_LIMIT,
  ARCHIVE_ENTRY_LIMIT,
  ARCHIVE_EXPANDED_LIMIT,
  archiveFormat,
  downloadName,
  folderRows,
  pathIsUnsafe,
  previewKind,
} from "../../src/archive/archive";

it("lists and fully extracts TAR/TGZ/GZ with nested unicode and symlink metadata", async () => {
  const tar = await packTar([
    {
      header: { name: "目录/hello.txt", type: "file", size: 5 },
      body: "hello",
    },
    {
      header: {
        name: "link",
        type: "symlink",
        size: 0,
        linkname: "/etc/passwd",
      },
    },
  ]);
  for (const [bytes, filename] of [
    [tar, "sample.tar"],
    [gzipSync(tar), "sample.tgz"],
    [gzipSync(tar), "sample.gz"],
  ] as const) {
    const list = await processArchive({ bytes, filename, action: "list" });
    expect(list.entries.map((e) => e.kind)).toEqual(["file", "symlink"]);
    expect(list.entries[1].linkTarget).toBe("/etc/passwd");
    const result = await processArchive({
      bytes,
      filename,
      action: "extract",
      entryId: "0",
    });
    expect(new TextDecoder().decode(result.bytes)).toBe("hello");
    await expect(
      processArchive({ bytes, filename, action: "extract", entryId: "1" }),
    ).rejects.toThrow("file_only");
  }
  const gz = await processArchive({
    bytes: gzipSync(new TextEncoder().encode("plain")),
    filename: "hello.txt.gz",
    action: "extract",
    entryId: "0",
  });
  expect(gz.format).toBe("gz");
  expect(new TextDecoder().decode(gz.bytes)).toBe("plain");
});
it("reads ZIP with CRC verification and preserves original paths without following them", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add("../secret.txt", new TextReader("secret"));
  await writer.add("folder/a.txt", new TextReader("inside"));
  const bytes = await writer.close();
  const list = await processArchive({
    bytes,
    filename: "test.zip",
    action: "list",
  });
  expect(list.entries[0].unsafePath).toBe(true);
  expect(list.entries[0].path).toBe("../secret.txt");
  expect(downloadName(list.entries[0].path)).toBe("secret.txt");
  const extract = await processArchive({
    bytes,
    filename: "test.zip",
    action: "extract",
    entryId: "1",
  });
  expect(new TextDecoder().decode(extract.bytes)).toBe("inside");
  expect(folderRows(list.entries, "folder/", "")[0].name).toBe("a.txt");
});
it("recognizes traversal, absolute and Windows paths without falsely trimming ordinary names", () => {
  for (const p of ["../x", "/x", "C:\\x", "a/../../x", "\\\\server\\share"])
    expect(pathIsUnsafe(p)).toBe(true);
  expect(pathIsUnsafe(" my file.txt ")).toBe(false);
});

function changeTarFlag(tar: Uint8Array<ArrayBuffer>, flag: string) {
  const bytes = tar.slice();
  bytes[156] = flag.charCodeAt(0);
  bytes.fill(32, 148, 156);
  const sum = bytes.subarray(0, 512).reduce((n, b) => n + b, 0);
  bytes.set(
    new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `),
    148,
  );
  return bytes;
}
it("keeps duplicate paths distinct and refuses sparse/unknown entry extraction", async () => {
  const tar = await packTar([
    { header: { name: "same", size: 1 }, body: "a" },
    { header: { name: "same", size: 1 }, body: "b" },
  ]);
  const list = await processArchive({
    bytes: tar,
    filename: "x.tar",
    action: "list",
  });
  expect(list.entries.map((e) => e.id)).toEqual(["0", "1"]);
  const second = await processArchive({
    bytes: tar,
    filename: "x.tar",
    action: "extract",
    entryId: "1",
  });
  expect(new TextDecoder().decode(second.bytes)).toBe("b");
  const unknown = changeTarFlag(tar, "Z");
  expect(
    (
      await processArchive({
        bytes: unknown,
        filename: "x.tar",
        action: "list",
      })
    ).entries[0].kind,
  ).toBe("other");
  await expect(
    processArchive({
      bytes: unknown,
      filename: "x.tar",
      action: "extract",
      entryId: "0",
    }),
  ).rejects.toThrow("file_only");
  await expect(
    processArchive({
      bytes: changeTarFlag(tar, "S"),
      filename: "x.tar",
      action: "list",
    }),
  ).rejects.toThrow("unsupported");
});
it("highlights escaped HTML data and keeps preview limits separate from complete extraction", async () => {
  const content = '<script>alert("hi")</script>';
  const tar = await packTar([
    { header: { name: "index.html", size: content.length }, body: content },
  ]);
  const preview = await processArchive({
    bytes: tar,
    filename: "x.tar",
    action: "preview",
    entryId: "0",
  });
  expect(preview.previewText).toBe(content);
  const large = new Uint8Array(1048577).fill(97),
    archive = await packTar([
      { header: { name: "large.txt", size: large.length }, body: large },
    ]);
  await expect(
    processArchive({
      bytes: archive,
      filename: "x.tar",
      action: "preview",
      entryId: "0",
    }),
  ).rejects.toThrow("preview_limit");
  const full = await processArchive({
    bytes: archive,
    filename: "x.tar",
    action: "extract",
    entryId: "0",
  });
  expect(full.bytes?.length).toBe(large.length);
  expect(full.bytes?.every((b) => b === 97)).toBe(true);
});

it("lists ZIP directories, Unix links and encrypted entries without extracting them", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add("folder/", undefined, { directory: true });
  await writer.add("link", new TextReader("../target"), { unixMode: 0o120777 });
  await writer.add("secret.txt", new TextReader("private"), {
    password: "test-password",
  });
  const bytes = await writer.close();
  const job = { bytes, filename: "metadata.zip" };
  const result = await processArchive({ ...job, action: "list" });
  expect(
    result.entries.map(({ kind, encrypted }) => ({ kind, encrypted })),
  ).toEqual([
    { kind: "directory", encrypted: false },
    { kind: "symlink", encrypted: false },
    { kind: "file", encrypted: true },
  ]);
  for (const entryId of ["0", "1"]) {
    await expect(
      processArchive({ ...job, action: "extract", entryId }),
    ).rejects.toThrow("file_only");
  }
  await expect(
    processArchive({ ...job, action: "preview", entryId: "2" }),
  ).rejects.toThrow("encrypted");
  await expect(
    processArchive({ ...job, action: "extract", entryId: "99" }),
  ).rejects.toThrow("entry_not_found");
});

it("previews ZIP text and binary entries without treating binary data as highlighted text", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add("sample.json", new TextReader('{"answer":42}'));
  await writer.add("sample.bin", new TextReader("opaque"));
  const bytes = await writer.close();
  const text = await processArchive({
    bytes,
    filename: "preview.zip",
    action: "preview",
    entryId: "0",
  });
  expect(text.previewText).toBe('{"answer":42}');
  const binary = await processArchive({
    bytes,
    filename: "preview.zip",
    action: "preview",
    entryId: "1",
  });
  expect(new TextDecoder().decode(binary.bytes)).toBe("opaque");
  expect(binary).not.toHaveProperty("previewText");
});

it("preserves gzip embedded names and timestamps and handles empty contents", async () => {
  for (const [content, filename, expectedName] of [
    ["", ".gz", "archive.bin"],
    ["plain text", "content.txt.gz", "content.txt"],
  ]) {
    const bytes = gzipSync(new TextEncoder().encode(content), { mtime: 0 });
    const job = { bytes, filename };
    const listed = await processArchive({ ...job, action: "list" });
    expect(listed.entries[0]).toMatchObject({
      path: expectedName,
      size: content.length,
      modifiedAt: null,
    });
    const extracted = await processArchive({
      ...job,
      action: "extract",
      entryId: "0",
    });
    expect(new TextDecoder().decode(extracted.bytes)).toBe(content);
    await expect(
      processArchive({ ...job, action: "extract", entryId: "missing" }),
    ).rejects.toThrow("entry_not_found");
  }
  const bytes = gzipSync(new TextEncoder().encode("named text"), {
    filename: "../named.txt",
    mtime: new Date("2024-01-01T00:00:00Z"),
  });
  const preview = await processArchive({
    bytes,
    filename: "unknown.gz",
    action: "preview",
    entryId: "0",
  });
  expect(preview.entries[0]).toMatchObject({
    path: "../named.txt",
    unsafePath: true,
    modifiedAt: "2024-01-01T00:00:00.000Z",
  });
  expect(preview.previewText).toBe("named text");
});

it("rejects streamed gzip text previews past the limit while allowing full extraction", async () => {
  const content = new Uint8Array(1048577).fill(97);
  const bytes = gzipSync(content, { mtime: 0 });
  const job = { bytes, filename: "large.txt.gz" };
  await expect(
    processArchive({ ...job, action: "preview", entryId: "0" }),
  ).rejects.toThrow("preview_limit");
  const result = await processArchive({
    ...job,
    action: "extract",
    entryId: "0",
  });
  expect(result.bytes).toEqual(content);
  expect(result.uncompressedBytes).toBe(content.length);
});

it("lists TAR directory and hardlink metadata and rejects non-file extraction", async () => {
  const bytes = await packTar([
    { header: { name: "folder/", type: "directory", size: 0 } },
    {
      header: {
        name: "hardlink",
        type: "link",
        size: 0,
        linkname: "folder/source",
      },
    },
  ]);
  const job = { bytes, filename: "metadata.tar" };
  const result = await processArchive({ ...job, action: "list" });
  expect(result.entries.map(({ kind }) => kind)).toEqual([
    "directory",
    "other",
  ]);
  expect(result.entries[1].linkTarget).toBe("folder/source");
  expect(result.uncompressedBytes).toBe(0);
  for (const entryId of ["0", "1"]) {
    await expect(
      processArchive({ ...job, action: "extract", entryId }),
    ).rejects.toThrow("file_only");
  }
});

it("decodes gzip optional extra fields and comments without exposing them as filenames", async () => {
  const original = gzipSync(new TextEncoder().encode("payload"), {
    filename: "note.txt",
    mtime: 0,
  });
  // RFC 1952: extra field precedes the zero-terminated filename and comment.
  const filenameEnd = original.indexOf(0, 10) + 1;
  const extra = new Uint8Array([3, 0, 11, 22, 33]);
  const comment = new TextEncoder().encode("archive comment\0");
  const bytes = new Uint8Array(original.length + extra.length + comment.length);
  bytes.set(original.subarray(0, 10));
  bytes[3] |= 4 | 16;
  bytes.set(extra, 10);
  bytes.set(original.subarray(10, filenameEnd), 10 + extra.length);
  bytes.set(comment, filenameEnd + extra.length);
  bytes.set(
    original.subarray(filenameEnd),
    filenameEnd + extra.length + comment.length,
  );
  const result = await processArchive({
    bytes,
    filename: "unknown.gz",
    action: "extract",
    entryId: "0",
  });
  expect(result.entries[0].path).toBe("note.txt");
  expect(new TextDecoder().decode(result.bytes)).toBe("payload");
});

it("rejects ZIP entries whose declared expanded size exceeds the safe budget before extraction", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add("oversize.txt", new TextReader("small"));
  const bytes = await writer.close();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let central = -1;
  for (let at = 0; at + 46 <= bytes.length; at++) {
    if (view.getUint32(at, true) === 0x02014b50) {
      central = at;
      break;
    }
  }
  expect(central).toBeGreaterThanOrEqual(0);
  view.setUint32(central + 24, 512 * 1048576 + 1, true);
  await expect(
    processArchive({ bytes, filename: "oversize.zip", action: "list" }),
  ).rejects.toThrow("expanded_limit");

  const previewWriter = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await previewWriter.add("preview.txt", new TextReader("small"));
  const previewBytes = await previewWriter.close();
  const previewView = new DataView(
    previewBytes.buffer,
    previewBytes.byteOffset,
    previewBytes.byteLength,
  );
  let previewCentral = -1;
  for (let at = 0; at + 46 <= previewBytes.length; at++) {
    if (previewView.getUint32(at, true) === 0x02014b50) {
      previewCentral = at;
      break;
    }
  }
  expect(previewCentral).toBeGreaterThanOrEqual(0);
  previewView.setUint32(previewCentral + 24, 1048577, true);
  await expect(
    processArchive({
      bytes: previewBytes,
      filename: "preview.zip",
      action: "preview",
      entryId: "0",
    }),
  ).rejects.toThrow("preview_limit");
});

it("recognizes every supported archive signature and rejects unknown input", () => {
  expect(archiveFormat(Uint8Array.from([80, 75, 3, 4]), "x")).toBe("zip");
  expect(archiveFormat(Uint8Array.from([80, 75, 5, 6]), "x")).toBe("zip");
  expect(archiveFormat(Uint8Array.from([31, 139]), "x.tgz")).toBe("tgz");
  expect(archiveFormat(Uint8Array.from([31, 139]), "x.TAR.GZ")).toBe("tgz");
  expect(archiveFormat(Uint8Array.from([31, 139]), "x.gz")).toBe("gz");
  const tarHeader = new Uint8Array(512);
  tarHeader.set(new TextEncoder().encode("ustar"), 257);
  expect(archiveFormat(tarHeader, "x")).toBe("tar");
  expect(archiveFormat(new Uint8Array(512), "x.TAR")).toBe("tar");
  expect(() => archiveFormat(new Uint8Array(), "x")).toThrow("unsupported");
  expect(() =>
    archiveFormat(new Uint8Array(ARCHIVE_INPUT_LIMIT + 1), "x"),
  ).toThrow("input_limit");
});

it("sanitizes download names and detects unsafe archive paths", () => {
  expect(downloadName("/folder/clean.txt")).toBe("clean.txt");
  expect(downloadName('\\folder\\bad<>:"|?*.txt')).toBe("bad_______.txt");
  expect(downloadName("/".repeat(2))).toBe("archive-entry.bin");
  expect(downloadName("/.")).toBe("archive-entry.bin");
  expect(downloadName("/..")).toBe("archive-entry.bin");
  expect(pathIsUnsafe("/absolute")).toBe(true);
  expect(pathIsUnsafe("\\absolute")).toBe(true);
  expect(pathIsUnsafe("C:\\absolute")).toBe(true);
  expect(pathIsUnsafe("folder/../file")).toBe(true);
  expect(pathIsUnsafe("bad\u0000name")).toBe(true);
  expect(pathIsUnsafe("folder/file.txt")).toBe(false);
});

it("builds virtual folder rows with duplicate folders, unsafe roots and filters", () => {
  const entries = [
    {
      id: "0",
      path: "folder/",
      kind: "directory",
      size: 0,
      compressedSize: null,
      modifiedAt: null,
      unsafePath: false,
      encrypted: false,
    },
    {
      id: "1",
      path: "folder/a.txt",
      kind: "file",
      size: 1,
      compressedSize: null,
      modifiedAt: null,
      unsafePath: false,
      encrypted: false,
    },
    {
      id: "2",
      path: "folder/b.txt",
      kind: "file",
      size: 1,
      compressedSize: null,
      modifiedAt: null,
      unsafePath: false,
      encrypted: false,
    },
    {
      id: "3",
      path: "../unsafe.txt",
      kind: "file",
      size: 1,
      compressedSize: null,
      modifiedAt: null,
      unsafePath: true,
      encrypted: false,
    },
    {
      id: "4",
      path: "folder//empty.txt",
      kind: "file",
      size: 1,
      compressedSize: null,
      modifiedAt: null,
      unsafePath: false,
      encrypted: false,
    },
  ] as const;
  expect(folderRows([...entries], "", "").map((row) => row.name)).toEqual([
    "folder",
    "../unsafe.txt",
  ]);
  expect(folderRows([...entries], "folder/", "A")).toEqual([
    expect.objectContaining({ name: "a.txt", entry: entries[1] }),
  ]);
  expect(folderRows([...entries], "missing/", "")).toEqual([]);
  expect(folderRows([entries[3]], "nested/", "")).toEqual([]);
});

it("classifies every preview extension family", () => {
  expect(previewKind("source.TS")).toBe("text");
  expect(previewKind("photo.JPEG")).toBe("image");
  expect(previewKind("document.PDF")).toBe("pdf");
  expect(previewKind("archive.bin")).toBeNull();
  expect(previewKind("no-extension")).toBeNull();
});

it("reads real PAX metadata before decoding the following TAR entry", async () => {
  const bytes = await packTar([
    {
      header: {
        name: "fallback.txt",
        size: 7,
        pax: { path: "nested/pax-name.txt", comment: "fixture" },
      },
      body: "payload",
    },
  ]);
  const result = await processArchive({
    bytes,
    filename: "pax.tar",
    action: "extract",
    entryId: "0",
  });
  expect(result.entries[0].path).toBe("nested/pax-name.txt");
  expect(new TextDecoder().decode(result.bytes)).toBe("payload");
});

it("rejects a corrupted ZIP payload and can process a valid archive afterward", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add("payload.txt", new TextReader("stable payload"));
  const bytes = await writer.close();
  const corrupted = bytes.slice();
  const view = new DataView(
    corrupted.buffer,
    corrupted.byteOffset,
    corrupted.byteLength,
  );
  let local = -1;
  for (let at = 0; at + 30 <= corrupted.length; at++) {
    if (view.getUint32(at, true) === 0x04034b50) {
      local = at;
      break;
    }
  }
  expect(local).toBeGreaterThanOrEqual(0);
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  corrupted[local + 30 + nameLength + extraLength] ^= 0xff;
  await expect(
    processArchive({
      bytes: corrupted,
      filename: "broken.zip",
      action: "extract",
      entryId: "0",
    }),
  ).rejects.toThrow();
  const valid = await processArchive({
    bytes,
    filename: "valid.zip",
    action: "extract",
    entryId: "0",
  });
  expect(new TextDecoder().decode(valid.bytes)).toBe("stable payload");
});

it("reads gzip timestamps from the supplied byte view, not its backing buffer prefix", async () => {
  const bytes = gzipSync(new TextEncoder().encode("offset payload"), {
    filename: "offset.txt",
    mtime: new Date("2024-01-01T00:00:00Z"),
  });
  const backing = new Uint8Array(bytes.length + 23).fill(0xff);
  backing.set(bytes, 11);
  const view = backing.subarray(11, 11 + bytes.length);
  const result = await processArchive({
    bytes: view,
    filename: "data.gz",
    action: "preview",
    entryId: "0",
  });
  expect(result.entries[0].modifiedAt).toBe("2024-01-01T00:00:00.000Z");
  expect(result.entries[0].path).toBe("offset.txt");
  expect(result.archiveBytes).toBe(bytes.length);
  expect(result.previewText).toBe("offset payload");
  expect(backing.subarray(0, 11)).toEqual(new Uint8Array(11).fill(0xff));
});

it("validates TAR octal and base-256 sizes before reading entry bodies", async () => {
  const tar = await packTar([
    { header: { name: "payload.txt", size: 3 }, body: "abc" },
  ]);
  const sizeField = (value: Uint8Array) => {
    const bytes = tar.slice();
    bytes.fill(0, 124, 136);
    bytes.set(value, 124);
    return changeTarFlag(bytes, "0");
  };
  const valid = new Uint8Array(12);
  valid[0] = 0x80;
  valid[11] = 3;
  const result = await processArchive({
    bytes: sizeField(valid),
    filename: "base256.tar",
    action: "extract",
    entryId: "0",
  });
  expect(new TextDecoder().decode(result.bytes)).toBe("abc");
  expect(result.entries[0].size).toBe(3);
  const negative = valid.slice();
  negative[0] = 0xff;
  const huge = valid.slice();
  huge[1] = 1;
  for (const [field, error] of [
    [negative, "invalid_input"],
    [huge, "expanded_limit"],
    [new TextEncoder().encode("00000000009"), "invalid_input"],
    [new TextEncoder().encode("77777777777"), "expanded_limit"],
  ] as const) {
    await expect(
      processArchive({
        bytes: sizeField(field),
        filename: "invalid.tar",
        action: "list",
      }),
    ).rejects.toThrow(error);
  }
  const retried = await processArchive({
    bytes: tar,
    filename: "valid.tar",
    action: "extract",
    entryId: "0",
  });
  expect(new TextDecoder().decode(retried.bytes)).toBe("abc");
});

it("rejects malformed PAX records and sparse metadata without poisoning later TAR reads", async () => {
  const regular = await packTar([
    { header: { name: "payload.txt", size: 3 }, body: "abc" },
  ]);
  const paxRecord = (value: string) => {
    let length = value.length + 3;
    while (String(length).length + value.length + 2 !== length)
      length = String(length).length + value.length + 2;
    return `${length} ${value}\n`;
  };
  for (const [record, expected] of [
    ["0 x=x\n", "invalid_input"],
    ["99999999999999999999 x=x\n", "invalid_input"],
    ["1 x=x\n", "invalid_input"],
    ["99 x=x\n", "invalid_input"],
    ["6 x=x!", "invalid_input"],
    [paxRecord("size=-1"), "invalid_input"],
    [paxRecord("size=9007199254740992"), "invalid_input"],
    [paxRecord("size=536870913"), "expanded_limit"],
    [paxRecord("GNU.sparse.map=0,3"), "unsupported"],
  ]) {
    const body = new TextEncoder().encode(record);
    const extension = changeTarFlag(
      await packTar([
        { header: { name: "PaxHeaders/payload", size: body.length }, body },
      ]),
      "x",
    );
    const prefix = extension.subarray(
      0,
      512 + Math.ceil(body.length / 512) * 512,
    );
    const bytes = new Uint8Array(prefix.length + regular.length);
    bytes.set(prefix);
    bytes.set(regular, prefix.length);
    await expect(
      processArchive({ bytes, filename: "pax.tar", action: "list" }),
    ).rejects.toThrow(expected);
  }
  const good = await processArchive({
    bytes: regular,
    filename: "normal.tar",
    action: "extract",
    entryId: "0",
  });
  expect(new TextDecoder().decode(good.bytes)).toBe("abc");
});

it("rejects a late gzip checksum failure and can extract the valid archive afterwards", async () => {
  const content = new Uint8Array(256 * 1024);
  let state = 0x12345678;
  for (let i = 0; i < content.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    content[i] = state >>> 24;
  }
  const valid = gzipSync(content, { mtime: 0 });
  const corrupted = valid.slice();
  corrupted[corrupted.length - 8] ^= 0xff;
  await expect(
    processArchive({
      bytes: corrupted,
      filename: "payload.bin.gz",
      action: "extract",
      entryId: "0",
    }),
  ).rejects.toThrow();
  const recovered = await processArchive({
    bytes: valid,
    filename: "payload.bin.gz",
    action: "extract",
    entryId: "0",
  });
  expect(recovered.bytes).toEqual(content);
  expect(recovered.entries[0].size).toBe(content.length);
});

it("rejects gzip header and early checksum errors then accepts a fresh valid input", async () => {
  const valid = gzipSync(new TextEncoder().encode("ready"), { mtime: 0 });
  const method = valid.slice();
  method[2] = 0;
  const reserved = valid.slice();
  reserved[3] |= 0x20;
  const checksum = valid.slice();
  checksum[checksum.length - 8] ^= 0xff;
  for (const bytes of [method, reserved, checksum, valid.subarray(0, 12)]) {
    await expect(
      processArchive({
        bytes,
        filename: "broken.txt.gz",
        action: "preview",
        entryId: "0",
      }),
    ).rejects.toThrow();
  }
  const result = await processArchive({
    bytes: valid,
    filename: "ready.txt.gz",
    action: "preview",
    entryId: "0",
  });
  expect(result.previewText).toBe("ready");
  expect(result.entries[0]).toMatchObject({ path: "ready.txt", size: 5 });
});

it("creates and alphabetizes virtual folders when TAR contains only file entries", async () => {
  const bytes = await packTar([
    { header: { name: "zebra/last.txt", size: 1 }, body: "z" },
    { header: { name: "alpha/first.txt", size: 1 }, body: "a" },
    { header: { name: "root.txt", size: 1 }, body: "r" },
  ]);
  const { entries } = await processArchive({
    bytes,
    filename: "folders.tar",
    action: "list",
  });
  expect(folderRows(entries, "", "")).toEqual([
    { key: "folder:alpha/", name: "alpha", directory: "alpha/", entry: null },
    { key: "folder:zebra/", name: "zebra", directory: "zebra/", entry: null },
    { key: "2", name: "root.txt", directory: null, entry: entries[2] },
  ]);
  expect(entries.map((entry) => entry.path)).toEqual([
    "zebra/last.txt",
    "alpha/first.txt",
    "root.txt",
  ]);
});

it("honors local and global PAX size metadata for consecutive file entries", async () => {
  const regular = await packTar([
    { header: { name: "first.txt", size: 3 }, body: "abc" },
    { header: { name: "second.txt", size: 3 }, body: "xyz" },
  ]);
  for (const flag of ["x", "g"]) {
    const record = new TextEncoder().encode("9 size=3\n");
    const extension = changeTarFlag(
      await packTar([
        {
          header: { name: "PaxHeaders/size", size: record.length },
          body: record,
        },
      ]),
      flag,
    );
    const overridden = regular.slice();
    for (const offset of flag === "g" ? [0, 1024] : [0]) {
      const header = overridden.slice(offset, offset + 512);
      header.fill(0, 124, 136);
      overridden.set(changeTarFlag(header, "0"), offset);
    }
    const bytes = new Uint8Array(1024 + overridden.length);
    bytes.set(extension.subarray(0, 1024));
    bytes.set(overridden, 1024);
    const list = await processArchive({
      bytes,
      filename: "sizes.tar",
      action: "list",
    });
    expect(list.entries.map(({ path, size }) => ({ path, size }))).toEqual([
      { path: "first.txt", size: 3 },
      { path: "second.txt", size: 3 },
    ]);
    for (const [entryId, expected] of [
      ["0", "abc"],
      ["1", "xyz"],
    ]) {
      const result = await processArchive({
        bytes,
        filename: "sizes.tar",
        action: "extract",
        entryId,
      });
      expect(new TextDecoder().decode(result.bytes)).toBe(expected);
    }
  }
});

it("rejects malformed GZIP headers before reading compressed content", async () => {
  const original = gzipSync(new TextEncoder().encode("hello"));
  for (const kind of [
    "method",
    "reserved",
    "name",
    "extra",
    "header-crc",
  ] as const) {
    const bytes = original.slice();
    if (kind === "method") bytes[2] = 0;
    if (kind === "reserved") bytes[3] = 0x20;
    if (kind === "name") {
      bytes[3] = 8;
      bytes.fill(65, 10);
    }
    if (kind === "extra" || kind === "header-crc") {
      bytes[3] = kind === "extra" ? 4 : 6;
      const size = kind === "extra" ? 65535 : bytes.length - 20;
      bytes[10] = size & 255;
      bytes[11] = size >> 8;
    }
    await expect(
      processArchive({ bytes, filename: "bad.gz", action: "list" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  }
});

it("bounds real GZIP expansion while streaming a small compressed input", async () => {
  const block = new Uint8Array(1024 * 1024);
  const compressed = Readable.from(
    (function* () {
      for (
        let offset = 0;
        offset <= ARCHIVE_EXPANDED_LIMIT;
        offset += block.length
      )
        yield block;
    })(),
  ).pipe(createGzip());
  const chunks: Buffer[] = [];
  for await (const chunk of compressed) chunks.push(chunk);
  const bytes = new Uint8Array(Buffer.concat(chunks));
  expect(bytes.length).toBeLessThan(1024 * 1024);
  await expect(
    processArchive({ bytes, filename: "expanded.gz", action: "list" }),
  ).rejects.toMatchObject({ code: "expanded_limit" });
  const next = await processArchive({
    bytes: gzipSync(new TextEncoder().encode("ready")),
    filename: "ready.txt.gz",
    action: "extract",
    entryId: "0",
  });
  expect(new TextDecoder().decode(next.bytes)).toBe("ready");
}, 30_000);

it("rejects a real TAR exceeding the entry count without extracting file contents", async () => {
  const single = await packTar([
    { header: { name: "empty.txt", size: 0 }, body: "" },
  ]);
  const bytes = new Uint8Array((ARCHIVE_ENTRY_LIMIT + 1) * 512 + 1024);
  for (let index = 0; index <= ARCHIVE_ENTRY_LIMIT; index++)
    bytes.set(single.subarray(0, 512), index * 512);
  await expect(
    processArchive({ bytes, filename: "many.tar", action: "list" }),
  ).rejects.toMatchObject({ code: "entry_limit" });
}, 30_000);

it("accepts an empty PAX header before a regular TAR entry", async () => {
  const extension = changeTarFlag(
    await packTar([
      { header: { name: "PaxHeaders/empty", size: 0 }, body: "" },
    ]),
    "x",
  );
  const regular = await packTar([
    { header: { name: "value.txt", size: 2 }, body: "ok" },
  ]);
  const bytes = new Uint8Array(512 + regular.length);
  bytes.set(extension.subarray(0, 512));
  bytes.set(regular, 512);
  const result = await processArchive({
    bytes,
    filename: "empty-pax.tar",
    action: "extract",
    entryId: "0",
  });
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0].path).toBe("value.txt");
  expect(new TextDecoder().decode(result.bytes)).toBe("ok");
});

it("limits accumulated TAR names and link targets below the entry-count limit", async () => {
  const name = "n".repeat(99),
    prefix = "p".repeat(149),
    target = "t".repeat(99);
  const original = await packTar([
    { header: { name, type: "symlink", size: 0, linkname: target } },
  ]);
  original.set(new TextEncoder().encode(prefix), 345);
  const header = changeTarFlag(original, "2").subarray(0, 512);
  const single = new Uint8Array(1536);
  single.set(header);
  const valid = await processArchive({
    bytes: single,
    filename: "link.tar",
    action: "list",
  });
  expect(valid.entries[0].path).toBe(`${prefix}/${name}`);
  expect(valid.entries[0].linkTarget).toBe(target);
  const metadataPerEntry = prefix.length + 1 + name.length + target.length;
  const count = Math.floor((16 * 1048576) / metadataPerEntry) + 1;
  expect(count).toBeLessThan(ARCHIVE_ENTRY_LIMIT);
  const bytes = new Uint8Array(count * 512 + 1024);
  for (let index = 0; index < count; index++) bytes.set(header, index * 512);
  await expect(
    processArchive({ bytes, filename: "names.tar", action: "list" }),
  ).rejects.toMatchObject({ code: "entry_limit" });
}, 30_000);

it("reports unsupported native decompression and recovers when the capability is restored", async () => {
  const bytes = gzipSync(new TextEncoder().encode("platform capability"));
  const job = {
    bytes,
    filename: "native.txt.gz",
    action: "extract" as const,
    entryId: "0",
  };
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "DecompressionStream",
  )!;
  try {
    Object.defineProperty(globalThis, "DecompressionStream", {
      configurable: true,
      value: undefined,
    });
    await expect(processArchive(job)).rejects.toMatchObject({
      code: "unsupported",
    });
  } finally {
    Object.defineProperty(globalThis, "DecompressionStream", descriptor);
  }
  const restored = await processArchive(job);
  expect(new TextDecoder().decode(restored.bytes)).toBe("platform capability");
});

it("rejects an oversized PAX metadata body before allocating its parser buffer", async () => {
  const value = `comment=${"x".repeat(16 * 1048576)}`;
  let length = value.length + 3;
  while (String(length).length + value.length + 2 !== length)
    length = String(length).length + value.length + 2;
  const body = new TextEncoder().encode(`${length} ${value}\n`);
  const bytes = changeTarFlag(
    await packTar([
      { header: { name: "PaxHeaders/large", size: body.length }, body },
    ]),
    "x",
  );
  expect(bytes.length).toBeLessThan(ARCHIVE_INPUT_LIMIT);
  await expect(
    processArchive({ bytes, filename: "large-pax.tar", action: "list" }),
  ).rejects.toMatchObject({ code: "entry_limit" });
}, 30_000);

it("enforces the entry limit on a ZIP64 central directory", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
    zip64: false,
  });
  await writer.add("d/", undefined, { directory: true });
  const template = await writer.close();
  const view = new DataView(
    template.buffer,
    template.byteOffset,
    template.byteLength,
  );
  const end = template.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const centralOffset = view.getUint32(end + 16, true);
  const local = template.subarray(0, centralOffset);
  const central = template.subarray(
    centralOffset,
    centralOffset + view.getUint32(end + 12, true),
  );
  const count = ARCHIVE_ENTRY_LIMIT + 1;
  const directoryOffset = local.length * count;
  const directorySize = central.length * count;
  const zip64Offset = directoryOffset + directorySize;
  const bytes = new Uint8Array(zip64Offset + 56 + 20 + 22);
  const output = new DataView(bytes.buffer);
  for (let index = 0; index < count; index++) {
    bytes.set(local, index * local.length);
    const at = directoryOffset + index * central.length;
    bytes.set(central, at);
    output.setUint32(at + 42, index * local.length, true);
  }
  // ZIP64 end record and locator preserve the full count beyond 65535 entries.
  output.setUint32(zip64Offset, 0x06064b50, true);
  output.setBigUint64(zip64Offset + 4, 44n, true);
  output.setUint16(zip64Offset + 12, 45, true);
  output.setUint16(zip64Offset + 14, 45, true);
  output.setBigUint64(zip64Offset + 24, BigInt(count), true);
  output.setBigUint64(zip64Offset + 32, BigInt(count), true);
  output.setBigUint64(zip64Offset + 40, BigInt(directorySize), true);
  output.setBigUint64(zip64Offset + 48, BigInt(directoryOffset), true);
  const locator = zip64Offset + 56;
  output.setUint32(locator, 0x07064b50, true);
  output.setBigUint64(locator + 8, BigInt(zip64Offset), true);
  output.setUint32(locator + 16, 1, true);
  const eocd = locator + 20;
  output.setUint32(eocd, 0x06054b50, true);
  output.setUint16(eocd + 8, 65535, true);
  output.setUint16(eocd + 10, 65535, true);
  output.setUint32(eocd + 12, directorySize, true);
  output.setUint32(eocd + 16, directoryOffset, true);
  expect(bytes.length).toBeLessThan(ARCHIVE_INPUT_LIMIT);
  await expect(
    processArchive({ bytes, filename: "many.zip", action: "list" }),
  ).rejects.toMatchObject({ code: "entry_limit" });
}, 30_000);

it("limits the combined expanded size of individually valid ZIP entries", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  const block = new Uint8Array(1024 * 1024);
  for (let index = 0; index < 2; index++) {
    let remaining = ARCHIVE_EXPANDED_LIMIT / 2 + block.length;
    await writer.add(
      `${index}.bin`,
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!remaining) controller.close();
          else {
            controller.enqueue(block);
            remaining -= block.length;
          }
        },
      }),
    );
  }
  const bytes = await writer.close();
  expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
  await expect(
    processArchive({ bytes, filename: "combined.zip", action: "list" }),
  ).rejects.toMatchObject({ code: "expanded_limit" });
}, 30_000);

it("returns a domain error when a ZIP directory understates the actual output", async () => {
  const writer = new ZipWriter(new Uint8ArrayWriter(), {
    useWebWorkers: false,
  });
  await writer.add("preview.txt", new TextReader("a".repeat(1048576 + 1)));
  const bytes = await writer.close();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const central = view.getUint32(bytes.length - 22 + 16, true);
  expect(view.getUint32(central, true)).toBe(0x02014b50);
  view.setUint32(central + 24, 1, true);
  await expect(
    processArchive({
      bytes,
      filename: "understated.zip",
      action: "preview",
      entryId: "0",
    }),
  ).rejects.toMatchObject({ code: "invalid_input" });
});

it("keeps real TAR payloads readable when a PAX timestamp exceeds the Date range", async () => {
  const bytes = await packTar([
    {
      header: {
        name: "future.txt",
        size: 7,
        pax: { mtime: "100000000000000000000" },
      },
      body: "payload",
    },
  ]);
  const result = await processArchive({
    bytes,
    filename: "future.tar",
    action: "extract",
    entryId: "0",
  });
  expect(result.entries[0]).toMatchObject({
    path: "future.txt",
    modifiedAt: null,
    size: 7,
  });
  expect(new TextDecoder().decode(result.bytes)).toBe("payload");
});

it("rejects a TAR truncated inside the next header after a complete entry", async () => {
  const tar = await packTar([
    { header: { name: "first.txt", type: "file", size: 0 }, body: "" },
    { header: { name: "second.txt", type: "file", size: 0 }, body: "" },
  ]);
  for (const length of [513, 767, 1023]) {
    const bytes = tar.slice(0, length);
    for (const [input, filename] of [
      [bytes, "truncated.tar"],
      [gzipSync(bytes), "truncated.tgz"],
    ] as const) {
      await expect(
        processArchive({ bytes: input, filename, action: "list" }),
      ).rejects.toThrow();
    }
  }
});

it("extracts the file following PAX metadata spanning decompression chunks", async () => {
  const tar = await packTar([
    {
      header: {
        name: "fallback.txt",
        size: 7,
        pax: {
          comment: "metadata".repeat(16384),
          path: "nested/after-large-pax.txt",
        },
      },
      body: "payload",
    },
  ]);
  for (const [bytes, filename] of [
    [tar, "large-pax.tar"],
    [gzipSync(tar), "large-pax.tgz"],
  ] as const) {
    const result = await processArchive({
      bytes,
      filename,
      action: "extract",
      entryId: "0",
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].path).toBe("nested/after-large-pax.txt");
    expect(new TextDecoder().decode(result.bytes)).toBe("payload");
  }
});

it.each([0, 6])(
  "rejects consistent but understated ZIP sizes at compression level %s",
  async (level) => {
    const writer = new ZipWriter(new Uint8ArrayWriter(), {
      useWebWorkers: false,
      dataDescriptor: false,
    });
    await writer.add("preview.txt", new TextReader("a".repeat(1048577)), {
      level,
      dataDescriptor: false,
    });
    const bytes = await writer.close();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const central = view.getUint32(bytes.length - 22 + 16, true);
    const local = view.getUint32(central + 42, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint16(local + 6, true) & 8).toBe(0);
    view.setUint32(central + 24, 1048576, true);
    view.setUint32(local + 22, 1048576, true);
    await expect(
      processArchive({
        bytes,
        filename: "understated.zip",
        action: "preview",
        entryId: "0",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  },
);

it.each([
  Array.from({ length: 255 }, (_, i) => String.fromCharCode(i + 1)).join(""),
  `${"é".repeat(9000)}.txt`,
])("preserves literal GZIP Latin-1 filename bytes", async (filename) => {
  const content = new TextEncoder().encode("unchanged payload");
  const bytes = gzipSync(content, { filename });
  const result = await processArchive({
    bytes,
    filename: "download.gz",
    action: "extract",
    entryId: "0",
  });
  expect(result.entries[0].path).toBe(filename);
  expect(result.bytes).toEqual(content);
});

it("consumes legacy trailing-slash directory bodies without losing the following file", async () => {
  const tar = await packTar([
    { header: { name: "folderx", type: "file", size: 5 }, body: "hello" },
    { header: { name: "after.txt", type: "file", size: 5 }, body: "after" },
  ]);
  // Legacy archives may mark a directory by its name while retaining a file type flag.
  tar[6] = 47;
  tar.fill(32, 148, 156);
  const sum = tar.subarray(0, 512).reduce((value, byte) => value + byte, 0);
  tar.set(
    new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `),
    148,
  );
  for (const [bytes, filename] of [
    [tar, "legacy.tar"],
    [gzipSync(tar), "legacy.tgz"],
  ] as const) {
    const result = await processArchive({
      bytes,
      filename,
      action: "extract",
      entryId: "1",
    });
    expect(result.entries[0]).toMatchObject({
      path: "folder/",
      kind: "directory",
      size: 0,
    });
    expect(result.entries[1]).toMatchObject({
      path: "after.txt",
      kind: "file",
      size: 5,
    });
    expect(new TextDecoder().decode(result.bytes)).toBe("after");
  }
});

it("sniffs and extracts a gzipped TAR across short native decompression chunks", async () => {
  const payload = "分块 payload 😀".repeat(80);
  const tar = await packTar([
    {
      header: {
        name: "payload.txt",
        size: new TextEncoder().encode(payload).length,
      },
      body: payload,
    },
  ]);
  // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "DecompressionStream",
  )!;
  const NativeDecompressionStream = DecompressionStream;
  // Exercise valid stream chunk boundaries while retaining the real GZIP decoder.
  class ShortChunkDecompressionStream {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<BufferSource>;
    constructor(format: CompressionFormat) {
      const native = new NativeDecompressionStream(format);
      this.writable = native.writable;
      this.readable = native.readable.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            for (let at = 0; at < chunk.length; at += 37)
              controller.enqueue(chunk.subarray(at, at + 37));
          },
        }),
      );
    }
  }
  try {
    Object.defineProperty(globalThis, "DecompressionStream", {
      configurable: true,
      value: ShortChunkDecompressionStream,
    });
    const result = await processArchive({
      bytes: gzipSync(tar),
      filename: "unknown.gz",
      action: "extract",
      entryId: "0",
    });
    expect(result.format).toBe("tgz");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].path).toBe("payload.txt");
    expect(new TextDecoder().decode(result.bytes)).toBe(payload);
  } finally {
    Object.defineProperty(globalThis, "DecompressionStream", descriptor);
  }
});
