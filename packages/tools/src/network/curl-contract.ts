export const MAX_CURL_INPUT = 8 * 1024 * 1024;
export const MAX_CURL_OUTPUT = 32 * 1024 * 1024;

export const TARGETS = [
  [
    "javascript-fetch",
    "JavaScript (fetch)",
    "JavaScript",
    "js",
    "javascript",
    "toJavaScriptWarn",
  ],
  [
    "javascript-jquery",
    "JavaScript (jQuery)",
    "JavaScript",
    "js",
    "javascript",
    "toJavaScriptJqueryWarn",
  ],
  [
    "javascript-xhr",
    "JavaScript (XHR)",
    "JavaScript",
    "js",
    "javascript",
    "toJavaScriptXHRWarn",
  ],
  [
    "node-fetch",
    "Node.js (fetch)",
    "Node.js",
    "js",
    "javascript",
    "toNodeWarn",
  ],
  [
    "node-axios",
    "Node.js (axios)",
    "Node.js",
    "js",
    "javascript",
    "toNodeAxiosWarn",
  ],
  ["node-got", "Node.js (got)", "Node.js", "js", "javascript", "toNodeGotWarn"],
  [
    "node-http",
    "Node.js (http)",
    "Node.js",
    "js",
    "javascript",
    "toNodeHttpWarn",
  ],
  ["node-ky", "Node.js (ky)", "Node.js", "js", "javascript", "toNodeKyWarn"],
  [
    "node-superagent",
    "Node.js (superagent)",
    "Node.js",
    "js",
    "javascript",
    "toNodeSuperAgentWarn",
  ],
  [
    "node-request",
    "Node.js (request)",
    "Node.js",
    "js",
    "javascript",
    "toNodeRequestWarn",
  ],
  [
    "python-requests",
    "Python (requests)",
    "Python",
    "py",
    "python",
    "toPythonWarn",
  ],
  [
    "python-http",
    "Python (http.client)",
    "Python",
    "py",
    "python",
    "toPythonHttpWarn",
  ],
  ["java", "Java (HttpClient)", "Java", "java", "java", "toJavaWarn"],
  [
    "java-httpurlconnection",
    "Java (HttpURLConnection)",
    "Java",
    "java",
    "java",
    "toJavaHttpUrlConnectionWarn",
  ],
  ["java-okhttp", "Java (OkHttp)", "Java", "java", "java", "toJavaOkHttpWarn"],
  ["java-jsoup", "Java (Jsoup)", "Java", "java", "java", "toJavaJsoupWarn"],
  ["php", "PHP", "PHP", "php", "php", "toPhpWarn"],
  ["php-guzzle", "PHP (Guzzle)", "PHP", "php", "php", "toPhpGuzzleWarn"],
  ["php-requests", "PHP (Requests)", "PHP", "php", "php", "toPhpRequestsWarn"],
  ["ruby", "Ruby", "Ruby", "rb", "ruby", "toRubyWarn"],
  [
    "ruby-httparty",
    "Ruby (HTTParty)",
    "Ruby",
    "rb",
    "ruby",
    "toRubyHttpartyWarn",
  ],
  ["r-httr", "R (httr)", "R", "r", "r", "toRWarn"],
  ["r-httr2", "R (httr2)", "R", "r", "r", "toRHttr2Warn"],
  [
    "powershell-restmethod",
    "PowerShell (Invoke-RestMethod)",
    "PowerShell",
    "ps1",
    "powershell",
    "toPowershellRestMethodWarn",
  ],
  [
    "powershell-webrequest",
    "PowerShell (Invoke-WebRequest)",
    "PowerShell",
    "ps1",
    "powershell",
    "toPowershellWebRequestWarn",
  ],
  ["http", "HTTP", "command", "http", "http", "toHTTPWarn"],
  ["httpie", "HTTPie", "command", "sh", "bash", "toHttpieWarn"],
  ["wget", "Wget", "command", "sh", "bash", "toWgetWarn"],
  ["json", "JSON", "data", "json", "json", "toJsonStringWarn"],
  ["har", "HAR", "data", "har", "json", "toHarStringWarn"],
  ["ansible", "Ansible", "other", "yml", "yaml", "toAnsibleWarn"],
  ["c", "C", "other", "c", "c", "toCWarn"],
  ["csharp", "C#", "other", "cs", "csharp", "toCSharpWarn"],
  ["clojure", "Clojure", "other", "clj", "clojure", "toClojureWarn"],
  ["cfml", "CFML", "other", "cfm", "plaintext", "toCFMLWarn"],
  ["dart", "Dart", "other", "dart", "dart", "toDartWarn"],
  ["elixir", "Elixir", "other", "ex", "elixir", "toElixirWarn"],
  ["go", "Go", "other", "go", "go", "toGoWarn"],
  ["julia", "Julia", "other", "jl", "julia", "toJuliaWarn"],
  ["kotlin", "Kotlin", "other", "kt", "kotlin", "toKotlinWarn"],
  ["lua", "Lua", "other", "lua", "lua", "toLuaWarn"],
  ["matlab", "MATLAB", "other", "m", "matlab", "toMATLABWarn"],
  [
    "objective-c",
    "Objective-C",
    "other",
    "m",
    "objectivec",
    "toObjectiveCWarn",
  ],
  ["ocaml", "OCaml", "other", "ml", "ocaml", "toOCamlWarn"],
  ["perl", "Perl", "other", "pl", "perl", "toPerlWarn"],
  ["rust", "Rust", "other", "rs", "rust", "toRustWarn"],
  ["swift", "Swift", "other", "swift", "swift", "toSwiftWarn"],
] as const;

export type CurlTarget = (typeof TARGETS)[number][0];
export const TARGET_IDS = TARGETS.map((target) => target[0]);

export type CurlOptions = { input: string; target: CurlTarget };
export type CurlWarning = { code: string; message: string };
export type CurlConversionResult = {
  output: string;
  warnings: CurlWarning[];
  error: string | null;
  filename: string;
};

export class CurlToolError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
