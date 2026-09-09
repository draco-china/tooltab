import sanitizeHtml from "sanitize-html";

const tags = [
  ...sanitizeHtml.defaults.allowedTags,
  "img",
  "input",
  "details",
  "summary",
  "del",
  "s",
  "kbd",
];
export function sanitizeOutput(html: string) {
  return sanitizeHtml(html, {
    allowedTags: tags,
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["id", "class", "title", "lang", "dir"],
      img: ["src", "alt", "title", "width", "height"],
      input: [{ name: "type", values: ["checkbox"] }, "checked", "disabled"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}
export function sanitizePreview(html: string) {
  return sanitizeHtml(html, {
    allowedTags: tags.filter((t) => t !== "img"),
    allowedAttributes: {
      "*": ["id", "class", "title", "lang", "dir"],
      a: ["href"],
      input: [{ name: "type", values: ["checkbox"] }, "checked", "disabled"],
      td: ["colspan", "rowspan", "align"],
      th: ["colspan", "rowspan", "align"],
    },
    transformTags: {
      a: (_tag, attrs): sanitizeHtml.Tag => ({
        tagName: "a",
        attribs: attrs.href?.startsWith("#") ? { href: attrs.href } : {},
      }),
      img: (_tag, attrs) => ({
        tagName: "span",
        attribs: {},
        text: attrs.alt ? `[${attrs.alt}]` : "[image]",
      }),
      input: (_tag, attrs) => ({
        tagName: "input",
        attribs: {
          type: "checkbox",
          disabled: "",
          ...(Object.hasOwn(attrs, "checked") ? { checked: "" } : {}),
        },
      }),
    },
    allowedSchemes: [],
    allowProtocolRelative: false,
  });
}
export const PREVIEW_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; media-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function securePreviewDocument(
  html: string,
  css: string,
  language: string,
  direction: "ltr" | "rtl",
) {
  const lang = language.replace(/[^A-Za-z0-9-]/g, "");
  return `<!doctype html><html lang="${lang}" dir="${direction}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main><article>${sanitizePreview(html)}</article></main></body></html>`;
}
