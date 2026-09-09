import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";

// Fixed local assets; this module is loaded only inside the cURL service Worker.
const publicDirectory = new URL(
  import.meta.url.endsWith(".ts") ? "../../../../public/" : "../../public/",
  import.meta.url,
);
await Parser.init({
  locateFile: () => fileURLToPath(new URL("tree-sitter.wasm", publicDirectory)),
});
const language = await Parser.Language.load(
  fileURLToPath(new URL("tree-sitter-bash.wasm", publicDirectory)),
);
const parser = new Parser();
parser.setLanguage(language);
export default parser;
