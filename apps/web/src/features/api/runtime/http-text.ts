import { parseCookieHeaders } from "@workspace/tools/network/cookie";
import * as z from "zod/v4";
import {
  decodeBasicAuth,
  generateBasicAuth,
  MAX_AUTH_HEADER,
  MAX_CREDENTIAL_LENGTH as MAX_HTTP_TEXT,
} from "@workspace/tools/encoding/basic-auth";
import type { Operation } from "./operation-contract";

const encoding = z.enum(["utf8", "latin1"]).default("utf8");
const generateSchema = z.strictObject({
  username: z.string().max(MAX_HTTP_TEXT),
  password: z.string().max(MAX_HTTP_TEXT),
  encoding,
});
const decodeSchema = z.strictObject({
  input: z.string().max(MAX_AUTH_HEADER),
  encoding,
});
const cookieSchema = z.strictObject({
  input: z.string().max(MAX_HTTP_TEXT),
  type: z.enum(["cookie", "set-cookie"]),
});
export const httpTextOperations: Operation[] = [
  {
    id: "basic-auth-generator",
    name: "tooltab_basic_auth_generator",
    description:
      "Encode synthetic or explicitly supplied Basic credentials locally; Base64 is not encryption. No network requests. UTF8 default or Latin1 compatibility.",
    inputSchema: generateSchema,
    outputSchema: z.strictObject({
      value: z.string(),
      header: z.string(),
      curl: z.string(),
    }),
    bodyLimit: 700000,
    idempotent: true,
    run(input) {
      const a = generateSchema.parse(input);
      return generateBasicAuth(a.username, a.password, a.encoding);
    },
  },
  {
    id: "basic-auth-decoder",
    name: "tooltab_basic_auth_decoder",
    description:
      "Decode a Basic header or full Authorization line strictly; splits on first colon and rejects invalid bytes.",
    inputSchema: decodeSchema,
    outputSchema: z.strictObject({
      username: z.string(),
      password: z.string(),
    }),
    bodyLimit: 700000,
    idempotent: true,
    run(input) {
      const a = decodeSchema.parse(input);
      return decodeBasicAuth(a.input, a.encoding, MAX_HTTP_TEXT);
    },
  },
  {
    id: "cookie-parser",
    name: "tooltab_cookie_parser",
    description:
      "Parse Cookie request or separate Set-Cookie response lines; preserve raw fragments,duplicates,unknown attributes and invalid fragments without sending data.",
    inputSchema: cookieSchema,
    outputSchema: z.strictObject({
      cookies: z.array(
        z.strictObject({
          name: z.string(),
          value: z.string(),
          raw: z.string(),
          attributes: z.array(
            z.strictObject({
              name: z.string(),
              value: z.string().nullable(),
              raw: z.string(),
            }),
          ),
        }),
      ),
      invalid: z.array(
        z.strictObject({ fragment: z.string(), reason: z.string() }),
      ),
    }),
    bodyLimit: 700000,
    idempotent: true,
    run(input) {
      const a = cookieSchema.parse(input);
      return parseCookieHeaders(a.input, a.type);
    },
  },
];
