import { readFileSync } from "node:fs";
import { plugin } from "bun";
import {
  type OpenapiJob,
  ProjectConfigError,
} from "@workspace/tools/project/openapi-contract";

plugin({
  name: "openapi-local-ts5-ast",
  setup(build) {
    build.onLoad(
      { filter: /node_modules\/openapi-typescript\/.*\.mjs$/ },
      (args) => ({
        contents:
          (args.path.endsWith("/lib/utils.mjs")
            ? "const process = {env:{}};\n"
            : "") +
          readFileSync(args.path, "utf8").replaceAll(
            "from 'typescript'",
            `from ${JSON.stringify(import.meta.resolve("typescript-legacy"))}`,
          ),
        loader: "js",
      }),
    );
  },
});
const core = import("@workspace/tools/project/openapi");
self.onmessage = async (event: MessageEvent<OpenapiJob>) => {
  try {
    self.postMessage({
      result: (await core).generateOpenapi(
        event.data.input,
        event.data.options,
      ),
    });
  } catch (e) {
    self.postMessage({
      error: {
        code: e instanceof ProjectConfigError ? e.code : "generation_failed",
        refs: e instanceof ProjectConfigError ? e.refs : [],
      },
    });
  }
};
