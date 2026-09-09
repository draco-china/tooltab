import * as z from "zod/v4";
import {
  buildGradient,
  buildShadow,
  gradientSchema,
  gradientSvg,
  shadowSchema,
} from "@workspace/tools/css/generators";
import { gradientRasterBytes } from "./gradient-raster";
import type { Operation } from "./operation-contract";

const gradientInput = gradientSchema.extend({
  width: z.number().int().min(1).max(8192).default(1200),
  height: z.number().int().min(1).max(8192).default(800),
  rasterFormat: z.enum(["png", "jpeg", "webp"]).optional(),
  output: z.enum(["inline", "artifact"]).default("inline"),
});
export const cssGeneratorOperations: Operation[] = [
  {
    id: "css-box-shadow-generator",
    name: "tooltab_css_box_shadow_generator",
    description: "Build validated ordered multi-layer box-shadow CSS.",
    inputSchema: shadowSchema,
    outputSchema: z.strictObject({ value: z.string(), css: z.string() }),
    bodyLimit: 20000,
    idempotent: true,
    run: buildShadow,
  },
  {
    id: "css-gradient-generator",
    name: "tooltab_css_gradient_generator",
    description:
      "Build validated layered linear/radial/conic CSS gradients, config JSON and CSS-bearing SVG. Optional rasterFormat returns actual PNG/JPEG/WebP from shared premultiplied sRGB/OKLCH pixels in a cancellable Bun Worker. Up to 8 layers, 32 stops/layer, 32MP. Inline <=6MiB; artifact <=64MiB, expires in 1h. Raster jobs may take up to 5min.",
    inputSchema: gradientInput,
    outputSchema: z.strictObject({
      backgroundImage: z.string(),
      blendMode: z.string(),
      background: z.string(),
      css: z.string(),
      json: z.string(),
      svg: z.string(),
      raster: z
        .strictObject({
          output: z.string(),
          encoding: z.literal("base64"),
          mimeType: z.string(),
          width: z.number(),
          height: z.number(),
          bytes: z.number(),
        })
        .optional(),
      artifact: z
        .strictObject({
          id: z.string(),
          bytes: z.number(),
          mimeType: z.string(),
          filename: z.string(),
          expiresAt: z.number(),
          path: z.string().optional(),
          downloadUrl: z.string().optional(),
        })
        .optional(),
    }),
    bodyLimit: 1000000,
    idempotent: false,
    async run(input, signal, context) {
      const { width, height, rasterFormat, output, ...config } =
        gradientInput.parse(input);
      const result = {
        ...buildGradient(config),
        svg: gradientSvg(config, width, height),
      };
      if (!rasterFormat) return result;
      if (output === "artifact" && !context)
        throw new Error("Artifact context unavailable");
      const data = await gradientRasterBytes(
        config,
        width,
        height,
        rasterFormat,
        signal,
        output === "artifact" ? 64 * 1024 * 1024 : 6 * 1024 * 1024,
      );
      if (output === "artifact" && context) {
        const record = await context.artifacts.write(
          [data],
          {
            limit: 64 * 1024 * 1024,
            mimeType: `image/${rasterFormat}`,
            filename: `gradient.${rasterFormat}`,
          },
          signal,
        );
        const { id, bytes, mimeType, filename, expiresAt } = record;
        return {
          ...result,
          artifact: {
            id,
            bytes,
            mimeType,
            filename,
            expiresAt,
            ...(context.transport === "mcp"
              ? { path: record.path }
              : { downloadUrl: `/api/v1/artifacts/${id}` }),
          },
        };
      }
      return {
        ...result,
        raster: {
          output: data.toString("base64"),
          encoding: "base64" as const,
          mimeType: `image/${rasterFormat}`,
          width,
          height,
          bytes: data.length,
        },
      };
    },
  },
];
