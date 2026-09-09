import * as z from "zod/v4";
import {
  fromEntropy,
  generate,
  inspect,
  LANGUAGES,
} from "@workspace/tools/crypto/mnemonic";
import type { Operation } from "./operation-contract";

const language = z.enum(LANGUAGES).default("english");
export const mnemonicSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("generate"),
    language,
    wordCount: z
      .union([
        z.literal(12),
        z.literal(15),
        z.literal(18),
        z.literal(21),
        z.literal(24),
      ])
      .default(12),
  }),
  z.strictObject({
    mode: z.literal("validate"),
    language,
    mnemonic: z.string().max(4096),
  }),
  z.strictObject({
    mode: z.literal("entropy-to-mnemonic"),
    language,
    entropy: z.string().max(100),
  }),
  z.strictObject({
    mode: z.literal("mnemonic-to-entropy"),
    language,
    mnemonic: z.string().max(4096),
  }),
]);
export const mnemonicOperation: Operation = {
  id: "bip39-mnemonic-generator",
  name: "tooltab_bip39_mnemonic_generator",
  description:
    "BIP39 generate,validate,entropy↔mnemonic in10wordlists;12/15/18/21/24words;secure WebCrypto entropy. No seed/passphrase or storage. Examples must never fund real wallets.",
  inputSchema: mnemonicSchema,
  outputSchema: z.strictObject({
    mnemonic: z.string(),
    entropy: z.string(),
    wordCount: z.number().int(),
    strength: z.number().int(),
    valid: z.boolean(),
  }),
  bodyLimit: 30000,
  idempotent: false,
  run(value, signal) {
    signal?.throwIfAborted();
    const p = mnemonicSchema.parse(value);
    return p.mode === "generate"
      ? generate(p.wordCount, p.language)
      : p.mode === "entropy-to-mnemonic"
        ? fromEntropy(p.entropy, p.language)
        : inspect(p.mnemonic, p.language);
  },
};
