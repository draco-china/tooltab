import type {
  TextResult,
  ReadingSource,
  InfoResult,
} from "@workspace/tools/pdf/reading";
import type { ImageFormat, ImageOptions } from "@workspace/tools/pdf/rendering";
export type ReadingJob =
  | { kind: "info"; source: ReadingSource }
  | { kind: "text"; source: ReadingSource }
  | ({
      kind: "image";
      source: ReadingSource;
      pages: string;
    } & ImageOptions);
export type ImageFile = {
  name: string;
  bytes: Uint8Array;
  page: number;
  width: number;
  height: number;
};
export type ImageResult = {
  kind: "image";
  pageCount: number;
  files: ImageFile[];
  archive: Uint8Array | null;
  format: ImageFormat;
  dpi: number;
};
export type ReadingResult = InfoResult | TextResult | ImageResult;
