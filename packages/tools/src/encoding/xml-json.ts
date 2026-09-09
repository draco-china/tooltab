import { keepLastJsonKeys, stringifyExactJson } from "./json-object";
import {
  DOMParser,
  ParseError,
  type Element,
  type Node,
  XMLSerializer,
} from "@xmldom/xmldom";
import { isSafeNumber, LosslessNumber } from "lossless-json";
import { isScalar, parseDocument, visit } from "yaml";
export const MAX_XML_INPUT = 32 * 1024 * 1024,
  MAX_XML_OUTPUT = 128 * 1024 * 1024;
export class XmlJsonError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "invalid_options"
      | "invalid_character"
      | "too_large"
      | "too_deep"
      | "unsupported"
      | "timeout"
      | "busy"
      | "read_failed",
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(code);
  }
}
export const xmlDefaults = {
  compact: true,
  ignoreDeclaration: false,
  ignoreInstruction: false,
  ignoreAttributes: false,
  ignoreText: false,
  ignoreCdata: false,
  ignoreDoctype: false,
  ignoreComment: false,
  trim: false,
  nativeType: false,
  alwaysArray: false,
  alwaysChildren: false,
  indentSize: 2,
};
export const jsonDefaults = {
  rootElementName: "root",
  arrayItemTag: "item",
  indentSize: 2,
  includeXmlDeclaration: true,
  fullTagEmptyElement: false,
};
export type XmlOptions = typeof xmlDefaults;
export type JsonOptions = typeof jsonDefaults;
export type XmlJsonJob =
  | { direction: "xml-to-json"; input: string; options?: Partial<XmlOptions> }
  | { direction: "json-to-xml"; input: string; options?: Partial<JsonOptions> };
const name = /^[A-Za-z_][A-Za-z0-9._-]*$/;
function chars(value: string) {
  if (/[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(value))
    throw new XmlJsonError("invalid_character");
  return value;
}
function object(): Record<string, unknown> {
  return Object.create(null);
}
function exactJson(input: string): unknown {
  // Validate the effective data before recursive revivers or YAML can exhaust
  // their stack. Native parsing also preserves JSON's last-duplicate-key rule.
  function checkDepth(value: unknown, depth: number): void {
    if (depth > 128) throw new XmlJsonError("too_deep");
    if (value !== null && typeof value === "object")
      for (const child of Object.values(value)) checkDepth(child, depth + 1);
  }
  checkDepth(JSON.parse(input), 0);
  let missing = false;
  const parsed = JSON.parse(
    input,
    (_key, value, context?: { source: string }) => {
      if (typeof value !== "number") return value;
      if (!context) {
        missing = true;
        return value;
      }
      return new LosslessNumber(context.source);
    },
  );
  if (!missing) return parsed;
  // JSON whitespace may include leading tabs, which YAML treats as indentation.
  const doc = parseDocument(input.trim(), {
    schema: "json",
    intAsBigInt: true,
    uniqueKeys: false,
  });
  if (doc.errors.length) throw new XmlJsonError("invalid_input");
  visit(doc, (_key, node) => {
    keepLastJsonKeys(node);

    if (
      isScalar(node) &&
      (typeof node.value === "number" || typeof node.value === "bigint")
    )
      // YAML composeScalar always attaches the original numeric token.
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      node.value = new LosslessNumber(node.source!);
  });
  return doc.toJS({ maxAliasCount: 0 });
}
function jsonXml(input: string, partial?: Partial<JsonOptions>) {
  const o = { ...jsonDefaults, ...partial };
  o.rootElementName = o.rootElementName.trim();
  o.arrayItemTag = o.arrayItemTag.trim();
  if (!name.test(o.rootElementName) || !name.test(o.arrayItemTag))
    throw new XmlJsonError("invalid_options");
  const parsed = exactJson(input);
  let bytes = 0;
  const chunks: string[] = [];
  const append = (s: string) => {
    bytes += s.length;
    if (bytes > MAX_XML_OUTPUT) throw new XmlJsonError("too_large");
    chunks.push(s);
  };
  const escapeXml = (s: string, attribute = false) =>
    chars(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', attribute ? "&quot;" : '"');
  // exactJson validates the effective data depth before preserving numbers.
  function render(tag: string, value: unknown, depth: number, key?: string) {
    const pad = " ".repeat(o.indentSize * depth),
      attrs = key === undefined ? "" : ` name="${escapeXml(key, true)}"`;
    append(`${pad}<${tag}${attrs}`);
    const entries = Array.isArray(value)
      ? value.map((v) => [o.arrayItemTag, v] as const)
      : value !== null &&
          typeof value === "object" &&
          !(value instanceof LosslessNumber)
        ? Object.entries(value)
        : null;
    if (value === null || entries?.length === 0) {
      append(o.fullTagEmptyElement ? `></${tag}>` : " />");
      return;
    }
    append(">");
    if (entries) {
      if (o.indentSize) append("\n");
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        render(
          name.test(k) ? k : "property",
          v,
          depth + 1,
          name.test(k) ? undefined : k,
        );
        if (o.indentSize) append("\n");
      }
      append(pad);
    } else append(escapeXml(String(value)));
    append(`</${tag}>`);
  }
  if (o.includeXmlDeclaration)
    append(`<?xml version="1.0" encoding="UTF-8"?>${o.indentSize ? "\n" : ""}`);
  render(o.rootElementName, parsed, 0);
  return chunks.join("");
}
function xmlJson(input: string, partial?: Partial<XmlOptions>) {
  const o = { ...xmlDefaults, ...partial };
  chars(input);
  const parser = new DOMParser({
    onError: (_level, _message, context) => {
      throw new XmlJsonError(
        "invalid_input",
        context.locator?.lineNumber,
        context.locator?.columnNumber,
      );
    },
  });
  const doc = parser.parseFromString(input, "application/xml");
  let count = 0;
  const native = (v: string): unknown => {
    if (!o.nativeType) return v;
    const n = Number(v);
    if (!Number.isNaN(n)) {
      if (!Number.isFinite(n)) throw new XmlJsonError("invalid_input");
      const raw = v.trim();
      if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw))
        return new LosslessNumber(raw);
      if (/^[+-]?\d+$/.test(raw) || /^0[xob][0-9a-f]+$/i.test(raw))
        return new LosslessNumber(BigInt(raw).toString());
      if (!isSafeNumber(raw)) throw new XmlJsonError("invalid_input");
      return n;
    }
    return v.toLowerCase() === "true"
      ? true
      : v.toLowerCase() === "false"
        ? false
        : v;
  };
  function add(target: Record<string, unknown>, key: string, value: unknown) {
    if (Object.hasOwn(target, key)) {
      const old = target[key];
      if (Array.isArray(old)) old.push(value);
      else target[key] = [old, value];
    } else target[key] = o.alwaysArray ? [value] : value;
  }
  function children(parent: Node, depth: number): Record<string, unknown> {
    if (depth > 128) throw new XmlJsonError("too_deep");
    const result = object(),
      list: unknown[] = [];
    for (let n = parent.firstChild; n; n = n.nextSibling) {
      if (++count > 1000000) throw new XmlJsonError("too_large");
      if (n.nodeType === 1) {
        const element = n as Element;
        const item = children(n, depth + 1),
          attributes = object();
        for (let i = 0; i < element.attributes.length; i++) {
          const a = element.attributes[i];
          attributes[a.name] = chars(o.trim ? a.value.trim() : a.value);
        }
        if (!o.ignoreAttributes && Object.keys(attributes).length)
          item[o.compact ? "_attributes" : "attributes"] = attributes;
        if (o.compact) add(result, n.nodeName, item);
        else
          list.push({
            type: "element",
            name: n.nodeName,
            ...item,
            ...(o.alwaysChildren && !item.elements ? { elements: [] } : {}),
          });
        continue;
      }
      let type = "",
        value: unknown = n.nodeValue ?? "";
      if (n.nodeType === 3) {
        if (o.ignoreText || !String(value).trim()) continue;
        type = "text";
        value = native(chars(o.trim ? String(value).trim() : String(value)));
      } else if (n.nodeType === 4) {
        if (o.ignoreCdata) continue;
        type = "cdata";
        value = chars(o.trim ? String(value).trim() : String(value));
      } else if (n.nodeType === 8) {
        if (o.ignoreComment) continue;
        type = "comment";
        value = o.trim ? String(value).trim() : value;
      } else if (n.nodeType === 10) {
        if (o.ignoreDoctype) continue;
        type = "doctype";
        value = new XMLSerializer().serializeToString(n).slice(10, -1);
        if (o.trim) value = String(value).trim();
      } else {
        // The strict DOMParser emits only the handled nodes or processing instructions.
        if (n.nodeName.toLowerCase() === "xml") {
          if (o.ignoreDeclaration) continue;
          const attrs = object();
          // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
          const declaration = parser.parseFromString(
            `<declaration ${String(value)}/>`,
            "application/xml",
          ).documentElement!; // The explicit root is present, or the strict parser throws.
          for (let i = 0; i < declaration.attributes.length; i++) {
            const a = declaration.attributes[i];
            attrs[a.name] = a.value;
          }
          result[o.compact ? "_declaration" : "declaration"] = {
            [o.compact ? "_attributes" : "attributes"]: attrs,
          };
          continue;
        }
        if (o.ignoreInstruction) continue;
        type = "instruction";
        value = o.trim ? String(value).trim() : value;
      }
      if (o.compact) {
        if (type === "instruction") {
          const instruction = object();
          instruction[n.nodeName] = value;
          add(result, "_instruction", instruction);
        } else add(result, `_${type}`, value);
      } else
        list.push(
          type === "instruction"
            ? { type, name: n.nodeName, instruction: value }
            : { type, [type]: value },
        );
    }
    if (!o.compact && list.length) result.elements = list;
    return result;
  }
  const result = children(doc, 0);
  // Check the serialized size before allocating indentation-expanded output.
  // This tree contains only JSON scalars, LosslessNumber, arrays and records.
  let outputBytes = 0;
  const encoder = new TextEncoder();
  const account = (bytes: number) => {
    outputBytes += bytes;
    if (outputBytes > MAX_XML_OUTPUT) throw new XmlJsonError("too_large");
  };
  function measure(value: unknown, depth: number) {
    if (typeof value !== "object" || value instanceof LosslessNumber) {
      account(encoder.encode(stringifyExactJson(value, 0)).length);
      return;
    }
    const array = Array.isArray(value);
    const entries = Object.entries(value as Record<string, unknown>);
    account(2);
    if (entries.length === 0) return;
    account(entries.length - 1);
    if (o.indentSize)
      account(
        entries.length +
          1 +
          o.indentSize * (entries.length * (depth + 1) + depth),
      );
    for (const [key, child] of entries) {
      if (!array)
        account(
          encoder.encode(JSON.stringify(key)).length +
            1 +
            (o.indentSize ? 1 : 0),
        );
      measure(child, depth + 1);
    }
  }
  measure(result, 0);
  return stringifyExactJson(result, o.indentSize);
}
export function convertXmlJson(job: XmlJsonJob) {
  try {
    if (
      job.input.length > MAX_XML_INPUT ||
      new TextEncoder().encode(job.input).length > MAX_XML_INPUT
    )
      throw new XmlJsonError("too_large");
    const indent = job.options?.indentSize ?? 2;
    if (!Number.isInteger(indent) || indent < 0 || indent > 8)
      throw new XmlJsonError("invalid_options");
    if (!job.input.trim()) return { output: "", bytes: 0 };
    const output =
      job.direction === "json-to-xml"
        ? jsonXml(job.input, job.options)
        : xmlJson(job.input, job.options);
    const bytes = new TextEncoder().encode(output).length;
    if (bytes > MAX_XML_OUTPUT) throw new XmlJsonError("too_large");
    return { output, bytes };
  } catch (e) {
    if (e instanceof XmlJsonError) throw e;
    if (e instanceof ParseError)
      throw new XmlJsonError(
        "invalid_input",
        e.locator?.lineNumber,
        e.locator?.columnNumber,
      );
    throw new XmlJsonError("invalid_input");
  }
}
