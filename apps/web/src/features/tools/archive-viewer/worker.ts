import hljs from "highlight.js/lib/common";
import {
  ArchiveError,
  type ArchiveJob,
  type ArchiveResult,
} from "@workspace/tools/archive";
import { processArchive } from "@workspace/tools/archive/runtime";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<ArchiveJob>) => void;
  postMessage(data: unknown, transfer?: Transferable[]): void;
};
scope.onmessage = async (e) => {
  try {
    const result: ArchiveResult & { highlighted?: string } =
      await processArchive(e.data);
    const entry = result.entries.find((entry) => entry.id === e.data.entryId);
    if (result.previewText !== undefined && entry) {
      const ext = entry.path.split(".").pop()?.toLowerCase() ?? "";
      const languages: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        mjs: "javascript",
        ts: "typescript",
        tsx: "typescript",
        html: "xml",
        plist: "xml",
        md: "markdown",
        sh: "bash",
        zsh: "bash",
        conf: "ini",
        toml: "ini",
        yml: "yaml",
        py: "python",
        rb: "ruby",
        rs: "rust",
        txt: "plaintext",
        csv: "plaintext",
        log: "plaintext",
      };
      const language = languages[ext] ?? ext;
      const value = hljs.highlight(result.previewText, {
        language: hljs.getLanguage(language) ? language : "plaintext",
        ignoreIllegals: true,
      }).value;
      if (value.length <= 4 * 1048576) result.highlighted = value;
    }
    scope.postMessage({ result }, result.bytes ? [result.bytes.buffer] : []);
  } catch (error) {
    scope.postMessage({
      error: error instanceof ArchiveError ? error.code : "read_failed",
    });
  }
};
