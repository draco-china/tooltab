import { curlErrorMessage } from "../../src/network/curl";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import parser from "curlconverter/dist/src/shell/Parser.js";
import { asyncFetch, convertCurl } from "../../src/network/curl";
import {
  TARGETS,
  MAX_CURL_INPUT,
  MAX_CURL_OUTPUT,
} from "../../src/network/curl-contract";

it("keeps curlconverter callback input parsing available after buffer wrapping", () => {
  const input = "curl https://callback.example.test/path";
  const tree = parser.parse((index) => input.slice(index), undefined, {
    bufferSize: 64,
  });
  expect(tree.rootNode.text).toBe(input);
  expect(tree.rootNode.firstNamedChild?.type).toBe("command");
});

it("all 47 audited targets produce complete output", () => {
  expect(TARGETS).toHaveLength(47);
  for (const target of TARGETS) {
    const result = convertCurl({
      target: target[0],
      input:
        'curl -X POST https://api.example.com/v1/messages -H "Content-Type: application/json" -H "X-Test: value" --data-raw \'{"message":"hello"}\'',
    });
    expect(result.error, target[0]).toBeNull();
    expect(result.output, target[0]).toContain("example.com");
    expect(result.output, target[0]).toContain("hello");
    expect(result.filename).toBe(`converted.${target[3]}`);
  }
});

it("preserves authentication, cookies, query/data flags and forms", () => {
  const result = convertCurl({
    target: "json",
    input:
      'curl -u synthetic:pa:ss -H "X-Test: value" -b a=1 --data-urlencode "q=hello world" -G https://example.com/path',
  });
  expect(JSON.parse(result.output)).toMatchObject({
    method: "get",
    headers: { "X-Test": "value", Cookie: "a=1" },
    queries: { q: "hello world" },
    auth: { user: "synthetic", password: "pa:ss" },
    auth_type: "basic",
  });
  const form = convertCurl({
    target: "python-requests",
    input:
      'curl https://example.com -F "name=value" -F "document=@synthetic.txt;type=text/plain"',
  });
  expect(form.output).toContain("synthetic.txt");
  expect(form.output).toContain("text/plain");
  expect(form.output).toContain("files=");
});

it("preserves shell syntax, heredocs, warnings and parse errors", () => {
  const heredoc = convertCurl({
    target: "python-requests",
    input: "curl https://example.com --data-binary @- <<'EOF'\nhello\nEOF",
  });
  expect(heredoc.error).toBeNull();
  expect(heredoc.output).toContain("hello");
  expect(
    convertCurl({ target: "python-requests", input: "curl 'unterminated" })
      .error,
  ).toBeTruthy();
  const unsupported = convertCurl({
    target: "javascript-fetch",
    input: "curl --http3 ftp://example.com/file",
  });
  expect(unsupported.warnings.length).toBeGreaterThan(0);
  const ansi = convertCurl({
    target: "json",
    input: "curl -H $'X-Test: value' https://example.com",
  });
  expect(JSON.parse(ansi.output).headers["X-Test"]).toBe("value");
});

it("never executes substitutions, reads files or expands environment values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tooltab-curl-"));
  const originalSecret = process.env.SYNTHETIC_SECRET;
  process.env.SYNTHETIC_SECRET = "SYNTHETIC_ENV_CONTENT";
  try {
    const data = join(dir, "input.txt"),
      sentinel = join(dir, "should-not-exist");
    await writeFile(data, "SYNTHETIC_FILE_CONTENT_MUST_NOT_BE_READ");
    const file = convertCurl({
      target: "python-requests",
      input: `curl --data-binary @${data} https://example.com`,
    });
    expect(file.output).toContain(data);
    expect(file.output).not.toContain("SYNTHETIC_FILE_CONTENT");
    const environment = convertCurl({
      target: "python-requests",
      input: 'curl -H "X-Token: $SYNTHETIC_SECRET" https://example.com',
    });
    expect(environment.error).toBeNull();
    expect(environment.output).toContain("SYNTHETIC_SECRET");
    expect(environment.output).not.toContain("SYNTHETIC_ENV_CONTENT");
    convertCurl({
      target: "python-requests",
      input: `curl "$(touch ${sentinel})"`,
    });
    await expect(access(sentinel)).rejects.toThrow();
  } finally {
    if (originalSecret === undefined) delete process.env.SYNTHETIC_SECRET;
    else process.env.SYNTHETIC_SECRET = originalSecret;
    await rm(dir, { recursive: true, force: true });
  }
});

it("wraps multiple fetch calls and enforces limits and validation order", () => {
  const wrapped = asyncFetch(
    "import fetch from 'node-fetch';\nfetch('https://a.example');\nfetch('https://b.example');",
  );
  expect(wrapped).toContain("const response = await fetch");
  expect(wrapped).toContain("const response2 = await fetch");
  expect(asyncFetch("const value = 42;")).toBe("const value = 42;");
  expect(asyncFetch("import value from 'value';\nconst answer = value;")).toBe(
    "import value from 'value';\nconst answer = value;",
  );
  expect(asyncFetch("fetch('https://example.com');")).toContain(
    "async function run()",
  );
  expect(() => convertCurl({ target: "json", input: "\ud800" })).toThrow(
    "invalid_unicode",
  );
  expect(() =>
    convertCurl({
      target: "unsupported" as (typeof TARGETS)[number][0],
      input: "curl https://example.com",
    }),
  ).toThrow("invalid_target");
  expect(convertCurl({ target: "json", input: "" })).toEqual({
    output: "",
    warnings: [],
    error: null,
    filename: "converted.json",
  });
  const largeValidInput = `curl --data-raw '${"a".repeat(210_000)}' https://example.com`;
  expect(largeValidInput.length).toBeGreaterThan(32 * 1024);
  const largeResult = convertCurl({ target: "json", input: largeValidInput });
  expect(largeResult.error).toBeNull();
  expect(largeResult.output.length).toBeGreaterThan(210_000);
  expect(() =>
    convertCurl({ target: "json", input: "😀".repeat(MAX_CURL_INPUT / 4 + 1) }),
  ).toThrow("too_large");
  expect(() =>
    convertCurl({ target: "json", input: "a".repeat(MAX_CURL_INPUT + 1) }),
  ).toThrow("too_large");
  expect(() =>
    convertCurl({ target: "json", input: "curl -d 'x' https://example.com" }),
  ).not.toThrow();
  expect(MAX_CURL_OUTPUT).toBe(32 * 1024 * 1024);
});

it("rejects actual JSON output expansion beyond the output limit", () => {
  const input = `curl https://example.com --data-binary '${"\u0001".repeat(6 * 1048576)}'`;
  expect(new TextEncoder().encode(input).length).toBeLessThan(MAX_CURL_INPUT);
  expect(() => convertCurl({ target: "json", input })).toThrow(
    "output_too_large",
  );
});

it("converts with the real parser when its prototype parse method is read-only", async () => {
  const prototype = Object.getPrototypeOf(parser);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "parse");
  expect(descriptor).toBeDefined();
  try {
    Object.defineProperty(prototype, "parse", {
      ...descriptor,
      writable: false,
    });
    vi.resetModules();
    const { convertCurl: convertWithReadonlyParser } = await import(
      "../../src/network/curl"
    );
    const result = convertWithReadonlyParser({
      target: "json",
      input: "curl https://readonly.example.test/path -H 'X-Mode: readonly'",
    });
    expect(result.error).toBeNull();
    expect(JSON.parse(result.output)).toMatchObject({
      url: "https://readonly.example.test/path",
      headers: { "X-Mode": "readonly" },
    });
  } finally {
    // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
    Object.defineProperty(prototype, "parse", descriptor!);
    vi.resetModules();
  }
});

it("preserves Error diagnostics and does not expose arbitrary thrown values", () => {
  expect(curlErrorMessage(new Error("Invalid command"))).toBe(
    "Invalid command",
  );
  for (const cause of [
    undefined,
    null,
    "private token",
    42,
    { message: "private token" },
  ])
    expect(curlErrorMessage(cause)).toBe("Conversion failed");
});
