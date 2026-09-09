import jsQR from "jsqr";
import QRCode from "qrcode";
import { classifyQr, qrPayload } from "./qr-payload";
import {
  QR_PIXEL_LIMIT,
  type QrContentInput,
  QrError,
  type QrMatrix,
  type QrOptionsInput,
  type QrReadResult,
  qrOptionsSchema,
} from "./qr-contract";
export async function generateQr(
  content: QrContentInput,
  raw: QrOptionsInput = {},
): Promise<QrMatrix> {
  const options = qrOptionsSchema.parse(raw),
    payload = qrPayload(content);
  try {
    const qr = QRCode.create(payload, {
      errorCorrectionLevel: options.errorCorrectionLevel,
    });
    const svg = await QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: options.errorCorrectionLevel,
      width: options.size,
      margin: options.margin,
      color: { dark: options.darkColor, light: options.lightColor },
    });
    return {
      payload,
      modules: new Uint8Array(qr.modules.data),
      count: qr.modules.size,
      svg,
    };
  } catch {
    throw new QrError("capacity");
  }
}
export function readQr(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): QrReadResult {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > QR_PIXEL_LIMIT ||
    data.length !== width * height * 4
  )
    throw new QrError("too_large");
  const decoded = jsQR(data, width, height, {
    inversionAttempts: "attemptBoth",
  });
  return decoded
    ? { data: decoded.data, width, height, ...classifyQr(decoded.data) }
    : null;
}
