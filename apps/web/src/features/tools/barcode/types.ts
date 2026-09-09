import { z } from "zod";
export const barcodeReadJobSchema = z.strictObject({
  kind: z.literal("read"),
  data: z.instanceof(Uint8ClampedArray),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type BarcodeReadJob = z.infer<typeof barcodeReadJobSchema>;
