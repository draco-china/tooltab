import * as z from "zod/v4";
import {
  JoseToolError,
  MAX_JOSE_INPUT,
} from "@workspace/tools/crypto/jose-common";
import type { JoseJob, JoseResult } from "@/features/tools/jose-tools/jobs";
import { JWT_ALGORITHMS } from "@workspace/tools/crypto/jwt";
import {
  runJose,
  joseTokenSchema as tokenOutput,
  joseConverterSchema as converterOutput,
} from "@/features/tools/jose-tools/worker-client";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const text = z.string().max(MAX_JOSE_INPUT),
  algorithm = z.enum(JWT_ALGORITHMS),
  now = z.number().finite().min(-8640000000000).max(8640000000000).optional();
export const jwtDecoderSchema = z.strictObject({
  token: z.string().max(MAX_JOSE_INPUT * 4),
  action: z.enum(["decode", "verify"]).default("decode"),
  key: text.default(""),
  algorithm: z.union([z.literal("auto"), algorithm]).default("auto"),
  now,
});
export const jwtSignerSchema = z.strictObject({
  payload: text,
  header: text.default("{}"),
  key: text,
  keyFormat: z.enum(["secret", "pem", "jwk"]),
  algorithm,
  iatNow: z.boolean().default(false),
  expirationOffset: z
    .union([
      z.literal(900),
      z.literal(3600),
      z.literal(86400),
      z.literal(604800),
      z.null(),
    ])
    .default(null),
  now,
});
export const jwkPemSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("jwkToPem"),
    input: text,
    index: z.number().int().min(0).max(99).default(0),
    outputType: z.enum(["public", "private"]).default("public"),
  }),
  z.strictObject({
    mode: z.literal("pemToJwk"),
    input: text,
    pretty: z.boolean().default(true),
  }),
]);
let active = 0;
async function execute(job: JoseJob, signal?: AbortSignal) {
  const abort = signal ?? new AbortController().signal;
  abort.throwIfAborted();
  if (active >= 2) throw new JoseToolError("busy");
  active++;
  try {
    return await runJose(
      job,
      abort,
      import.meta.env.PROD
        ? () =>
            new Worker(serviceWorkerUrl("jose-tools-worker", import.meta.url), {
              type: "module",
            })
        : undefined,
    );
  } finally {
    active--;
  }
}
function tokenResult(result: JoseResult) {
  if (!("token" in result)) throw new JoseToolError("operation_failed");
  return {
    token: result.token,
    headerJson: result.headerJson,
    payloadJson: result.payloadJson,
    signature: result.signature,
    algorithm: typeof result.header.alg === "string" ? result.header.alg : null,
    signatureValid: "signatureValid" in result ? result.signatureValid : null,
    claims: result.claims.map((c) => ({
      ...c,
      value:
        typeof c.value === "number" && !Number.isFinite(c.value)
          ? String(c.value)
          : c.value,
    })),
  };
}
export const joseOperations: Operation[] = [
  {
    id: "jwt-decoder-verifier",
    name: "tooltab_jwt_decoder_verifier",
    description:
      "Locally decode compact JWT or verify JWS with an explicit supported algorithm/key type and local PEM/JWK/JWKS. No remote key fetching. Signature status is independent of exp/nbf/iat inspection. Returns exact JSON text for header/payload; never an authorization decision.",
    inputSchema: jwtDecoderSchema,
    outputSchema: tokenOutput,
    bodyLimit: 8000000,
    idempotent: true,
    async run(value, signal) {
      const p = jwtDecoderSchema.parse(value);
      return tokenResult(
        await execute(
          p.action === "decode"
            ? { mode: "decode", token: p.token, now: p.now }
            : { mode: "verify", options: p },
          signal,
        ),
      );
    },
  },
  {
    id: "jwt-signer",
    name: "tooltab_jwt_signer",
    description:
      "Sign a compact JWT using HS/RS/PS/ES256/384/512 with secret, private JWK or PKCS8 PEM. Optional iat-now and expiration offsets. Keys never saved or returned; output token is not proof of identity. All computation in local cancellable Worker.",
    inputSchema: jwtSignerSchema,
    outputSchema: tokenOutput,
    bodyLimit: 8000000,
    idempotent: false,
    async run(value, signal) {
      return tokenResult(
        await execute(
          { mode: "sign", options: jwtSignerSchema.parse(value) },
          signal,
        ),
      );
    },
  },
  {
    id: "jwk-pem-converter",
    name: "tooltab_jwk_pem_converter",
    description:
      "Convert selected RSA/EC/OKP JWK or JWKS key to SPKI/PKCS8, or PEM PKCS1/SEC1/SPKI/PKCS8 blocks to JWK/JWKS. Explicit private-key conversion may return private material. No automatic artifacts or persistence. Unsupported blocks are reported.",
    inputSchema: jwkPemSchema,
    outputSchema: converterOutput,
    bodyLimit: 8000000,
    idempotent: true,
    async run(value, signal) {
      return execute(jwkPemSchema.parse(value), signal);
    },
  },
];
