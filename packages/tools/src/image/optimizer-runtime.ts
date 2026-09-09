import { type Config, optimize } from "svgo/browser";
import {
  inspectPng,
  metrics,
  OPTIMIZER_OUTPUT_LIMIT,
  OptimizerError,
  type OptimizerJob,
  type OptimizerResult,
  type SvgOptions,
  validateJob,
} from "./optimizer";

export function svgConfig(options: SvgOptions): Config {
  return {
    multipass: options.multipass,
    plugins: [
      {
        name: "tooltab-resource-guard",
        fn(root) {
          const roots = root.children.filter((n) => n.type === "element");
          if (
            roots.length !== 1 ||
            roots[0].type !== "element" ||
            roots[0].name !== "svg"
          )
            throw new OptimizerError("invalid_input");
          let count = 0;
          const stack = [...root.children];
          while (stack.length) {
            const node = stack.pop();
            if (++count > 100000) throw new OptimizerError("input_limit");
            if (node?.type === "element")
              for (const child of node.children) stack.push(child);
          }
        },
      },
      {
        name: "preset-default",
        params: {
          overrides: {
            removeComments: options.removeComments ? {} : false,
            removeMetadata: options.removeMetadata ? null : false,
            cleanupIds: options.cleanupIds ? {} : false,
            convertColors: options.convertColors ? {} : false,
            inlineStyles: options.inlineStyles ? {} : false,
          },
        },
      },
      ...(options.removeDimensions ? ["removeDimensions" as const] : []),
    ],
  };
}

/** Environment-dependent optimizer entry; SVG uses SVGO and PNG loads oxipng only on demand. */
export async function optimizeImage(
  job: OptimizerJob,
  wasmBinary?: Uint8Array<ArrayBuffer>,
): Promise<OptimizerResult> {
  validateJob(job);
  try {
    if (job.kind === "svg") {
      const output = optimize(job.input, svgConfig(job.options)).data;
      return metrics(
        new TextEncoder().encode(job.input).length,
        new TextEncoder().encode(output),
      );
    }
    if (!wasmBinary) throw new OptimizerError("unsupported");
    const { default: init, optimise } = await import(
      "@jsquash/oxipng/codec/pkg/squoosh_oxipng.js"
    );
    await init(wasmBinary);
    const before = inspectPng(job.bytes),
      bytes = new Uint8Array(
        optimise(
          job.bytes,
          job.options.level,
          job.options.interlace,
          job.options.optimiseAlpha,
        ),
      ),
      after = inspectPng(bytes, OPTIMIZER_OUTPUT_LIMIT),
      structural = new Set(["IHDR", "IDAT", "IEND", "PLTE", "tRNS"]);
    const ancillary = before.chunks.filter((c) => !structural.has(c.type));
    const removed = [
        ...new Set(
          ancillary
            .filter((c) => !after.chunks.some((d) => d.type === c.type))
            .map((c) => c.type),
        ),
      ],
      changed = [
        ...new Set(
          ancillary
            .filter(
              (c) =>
                after.chunks.some((d) => d.type === c.type) &&
                !after.chunks.some(
                  (d) =>
                    d.type === c.type &&
                    d.bytes.length === c.bytes.length &&
                    d.bytes.every((b, i) => b === c.bytes[i]),
                ),
            )
            .map((c) => c.type),
        ),
      ];
    return {
      ...metrics(job.bytes.length, bytes),
      width: after.width,
      height: after.height,
      bitDepth: after.bitDepth,
      animated: after.animated,
      interlaced: bytes[28] === 1,
      chunksRemoved: removed,
      chunksChanged: changed,
    };
  } catch (error) {
    if (error instanceof OptimizerError) throw error;
    throw new OptimizerError("optimize_failed");
  }
}
