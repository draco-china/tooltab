import {
  decodeToken,
  type SignOptions,
  signToken,
  type VerifyOptions,
  verifyToken,
} from "@workspace/tools/crypto/jwt";
import { jwkToPem, pemToJwk } from "@workspace/tools/crypto/pem";
export type JoseJob =
  | { mode: "decode"; token: string; now?: number }
  | { mode: "verify"; options: VerifyOptions }
  | { mode: "sign"; options: SignOptions }
  | {
      mode: "jwkToPem";
      input: string;
      index: number;
      outputType: "public" | "private";
    }
  | { mode: "pemToJwk"; input: string; pretty: boolean };
export type JoseResult =
  | ReturnType<typeof decodeToken>
  | Awaited<ReturnType<typeof verifyToken>>
  | Awaited<ReturnType<typeof signToken>>
  | Awaited<ReturnType<typeof jwkToPem>>;
export async function executeJose(job: JoseJob): Promise<JoseResult> {
  switch (job.mode) {
    case "decode":
      return decodeToken(job.token, job.now);
    case "verify":
      return verifyToken(job.options);
    case "sign":
      return signToken(job.options);
    case "jwkToPem":
      return jwkToPem(job.input, job.index, job.outputType);
    case "pemToJwk":
      return pemToJwk(job.input, job.pretty);
  }
}
