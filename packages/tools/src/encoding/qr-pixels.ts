import {
  type QrMatrix,
  QrError,
  type QrOptionsInput,
  qrOptionsSchema,
} from "./qr-contract";
export function qrPixels(
  matrix: Pick<QrMatrix, "count" | "modules">,
  raw: QrOptionsInput = {},
) {
  if (
    !Number.isInteger(matrix.count) ||
    matrix.count < 21 ||
    matrix.count > 177 ||
    (matrix.count - 17) % 4 !== 0 ||
    matrix.modules.length !== matrix.count * matrix.count ||
    matrix.modules.some((value) => value > 1)
  )
    throw new QrError("invalid_input");
  const options = qrOptionsSchema.parse(raw),
    cells = matrix.count + options.margin * 2,
    size = Math.max(options.size, cells),
    data = new Uint8ClampedArray(size * size * 4);
  const color = (s: string) => [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
  ];
  const dark = color(options.darkColor),
    light = color(options.lightColor);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const row = Math.floor((y * cells) / size) - options.margin,
        col = Math.floor((x * cells) / size) - options.margin;
      const chosen =
        row >= 0 &&
        row < matrix.count &&
        col >= 0 &&
        col < matrix.count &&
        matrix.modules[row * matrix.count + col]
          ? dark
          : light;
      const i = (y * size + x) * 4;
      data[i] = chosen[0];
      data[i + 1] = chosen[1];
      data[i + 2] = chosen[2];
      data[i + 3] = 255;
    }
  return { data, width: size, height: size };
}
