import type Parser from "web-tree-sitter";
import { stringify } from "yaml";
export const MAX_DOCKER_INPUT = 8 * 1024 * 1024;
export class DockerError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DeveloperParserError";
  }
}
export type DockerResult = {
  output: string;
  warnings: string[];
  error: string | null;
  serviceCount: number;
};
type ObjectValue = Record<string, unknown>;
const arrayOptions: Record<string, string> = {
  publish: "ports",
  env: "environment",
  "env-file": "env_file",
  "add-host": "extra_hosts",
  label: "labels",
  "cap-add": "cap_add",
  "cap-drop": "cap_drop",
  dns: "dns",
  "dns-search": "dns_search",
  device: "devices",
  "security-opt": "security_opt",
  expose: "expose",
  link: "links",
  tmpfs: "tmpfs",
};
const scalarOptions: Record<string, string> = {
  name: "container_name",
  restart: "restart",
  entrypoint: "entrypoint",
  workdir: "working_dir",
  user: "user",
  hostname: "hostname",
  platform: "platform",
  ipc: "ipc",
  pid: "pid",
  "shm-size": "shm_size",
  "cpuset-cpus": "cpuset",
  "memory-swap": "memswap_limit",
};
const booleanOptions: Record<string, string> = {
  interactive: "stdin_open",
  tty: "tty",
  privileged: "privileged",
  "read-only": "read_only",
  init: "init",
};
const shortOptions: Record<string, string> = {
  p: "publish",
  P: "publish-all",
  e: "env",
  v: "volume",
  w: "workdir",
  u: "user",
  m: "memory",
  h: "hostname",
  l: "label",
  i: "interactive",
  t: "tty",
  d: "detach",
};
const owns = (obj: object, key: string) => Object.hasOwn(obj, key);
function object(parent: ObjectValue, key: string): ObjectValue {
  if (!owns(parent, key)) parent[key] = Object.create(null);
  return parent[key] as ObjectValue;
}
function push(parent: ObjectValue, key: string, value: unknown) {
  if (!owns(parent, key)) parent[key] = [];
  (parent[key] as unknown[]).push(value);
}
function keyValue(input: string): [string, string] {
  const i = input.indexOf("=");
  return i < 0 ? [input, ""] : [input.slice(0, i), input.slice(i + 1)];
}
function word(
  node: Parser.SyntaxNode,
  warnings: Set<string>,
  source: string,
): string {
  const raw = source.slice(node.startIndex, node.endIndex);
  if (
    node.type === "ansi_c_string" ||
    node.descendantsOfType("ansi_c_string").length
  )
    throw Error(
      "ANSI-C quoted strings are not supported; use ordinary quotes with literal characters.",
    );
  const protectedParts = new Map(
    node
      .descendantsOfType([
        "command_substitution",
        "simple_expansion",
        "expansion",
        "process_substitution",
      ])
      .map((part) => [part.startIndex - node.startIndex, part.text]),
  );
  // tree-sitter omits the leading locale marker from a standalone string node.
  if (source[node.startIndex - 1] === "$" && raw.startsWith('"'))
    warnings.add(
      "Locale translations are preserved as literal text; locale translation is not evaluated.",
    );
  if (
    [
      "command_substitution",
      "simple_expansion",
      "expansion",
      "process_substitution",
    ].includes(node.type)
  )
    protectedParts.set(0, raw);
  let quote = "",
    out = "";
  for (let i = 0; i < raw.length; i++) {
    const expression = protectedParts.get(i);
    if (expression) {
      warnings.add(
        "Shell expressions are preserved as literal text; variables and substitutions are not evaluated.",
      );
      out += expression;
      i += expression.length - 1;
      continue;
    }
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const c = raw[i]!;
    if (c === "\\" && quote !== "'") {
      // commands rejects parser errors before passing complete shell words here.
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const next = raw[i + 1]!;
      if (next === "\n") {
        i++;
        continue;
      }
      if (quote === '"' && !["$", "`", '"', "\\"].includes(next)) {
        out += c;
        continue;
      }
      out += next;
      i++;
      continue;
    }
    if ((c === "'" || c === '"') && (!quote || quote === c)) {
      quote = quote ? "" : c;
      continue;
    }
    if (c === "$" && quote === "" && raw[i + 1] === '"') {
      warnings.add(
        "Locale translations are preserved as literal text; locale translation is not evaluated.",
      );
      continue;
    }
    if ((c === "$" || c === "`") && quote !== "'")
      warnings.add(
        "Shell expressions are preserved as literal text; variables and substitutions are not evaluated.",
      );
    out += c;
  }
  // Compose interpolation must not secretly resolve the converter host's or deployment environment.
  return out.replaceAll("$", () => "$$");
}
function commands(
  input: string,
  parser: Parser,
  warnings: Set<string>,
): string[][] {
  const tree = parser.parse(input);
  // The configured web-tree-sitter parser returns a Tree or throws on failure.
  try {
    if (tree.rootNode.hasError) throw Error("Invalid shell syntax.");
    const result: string[][] = [];
    function visit(node: Parser.SyntaxNode) {
      if (node.type === "comment") return;
      if (node.type === "command") {
        const args = node.namedChildren.filter(
          (n) => n.type !== "variable_assignment",
        );
        if (args.length !== node.namedChildren.length)
          warnings.add("Leading shell variable assignments are not evaluated.");
        const words: string[] = [];
        for (const [index, arg] of args.entries()) {
          const previous = args[index - 1];
          const gap = previous
            ? input.slice(previous.endIndex, arg.startIndex)
            : "";
          // Bash removes unquoted backslash-newline pairs before tokenization.
          // The parser can expose the joined word as separate named nodes.
          if (previous && /^(?:\\\n)+$/.test(gap))
            words[words.length - 1] += word(arg, warnings, input);
          else words.push(word(arg, warnings, input));
        }
        result.push(words);
        return;
      }
      if (
        [
          "command_substitution",
          "process_substitution",
          "function_definition",
          "if_statement",
          "for_statement",
          "while_statement",
          "case_statement",
        ].includes(node.type)
      )
        throw Error(
          "Shell control flow is not converted. Supply explicit docker run commands.",
        );
      if (node.type === "redirected_statement")
        warnings.add(
          "Shell input/output redirections are not executed or included in Compose.",
        );
      if (node.type === "list" || node.type === "pipeline")
        warnings.add(
          "Shell operators separate commands; execution order and pipe semantics are not represented in Compose.",
        );
      for (const child of node.namedChildren) visit(child);
    }
    visit(tree.rootNode);
    return result;
  } finally {
    tree.delete();
  }
}
function volume(input: string, names: Set<string>) {
  const windows = /^[A-Za-z]:[\\/]/.test(input),
    parts = input.split(":");
  const source = windows ? `${parts.shift()}:${parts.shift()}` : parts.shift();
  if (!source) return input;
  if (parts.length && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source))
    names.add(source);
  return input;
}
function mount(input: string, names: Set<string>): ObjectValue {
  const data: ObjectValue = Object.create(null);
  let readOnly = false;
  for (const part of input.split(",")) {
    const [k, v] = keyValue(part.trim());
    if (k === "rw") {
      readOnly = false;
      continue;
    }
    if (["readonly", "ro"].includes(k)) {
      readOnly = v !== "false";
      continue;
    }
    data[k] = v;
  }
  const type = String(data.type ?? "volume"),
    source = String(data.source ?? data.src ?? ""),
    target = String(data.target ?? data.dst ?? data.destination ?? "");
  if (!["bind", "volume", "tmpfs"].includes(type) || !target)
    throw Error("Invalid --mount type or target.");
  const known = new Set([
    "type",
    "source",
    "src",
    "target",
    "dst",
    "destination",
    "bind-propagation",
    "volume-nocopy",
    "tmpfs-size",
    "tmpfs_size",
    "tmpfs-mode",
  ]);
  for (const key of Object.keys(data))
    if (!known.has(key)) throw Error(`Unsupported --mount option ${key}.`);
  const result: ObjectValue = { type, target };
  if (source) result.source = source;
  if (readOnly) result.read_only = true;
  if (type === "volume") {
    if (source) names.add(source);
    if (owns(data, "volume-nocopy"))
      result.volume = { nocopy: data["volume-nocopy"] !== "false" };
  }
  if (type === "bind" && data["bind-propagation"])
    result.bind = { propagation: data["bind-propagation"] };
  if (type === "tmpfs") {
    const tmpfs: ObjectValue = {};
    if (data["tmpfs-size"] || data.tmpfs_size)
      tmpfs.size = data["tmpfs-size"] ?? data.tmpfs_size;
    if (data["tmpfs-mode"]) {
      if (!/^[0-7]{3,4}$/.test(String(data["tmpfs-mode"])))
        throw Error("Invalid tmpfs mode.");
      tmpfs.mode = Number.parseInt(String(data["tmpfs-mode"]), 8);
    }
    if (Object.keys(tmpfs).length) result.tmpfs = tmpfs;
  }
  return result;
}
function gpu(input: string): ObjectValue {
  const value = input.replace(/^"|"$/g, "").replace(/^count=/, "");
  if (value === "all") return { capabilities: ["gpu"], count: "all" };
  if (/^\d+$/.test(value)) {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 1)
      throw Error("Invalid GPU count.");
    return { capabilities: ["gpu"], count };
  }
  if (value.startsWith("device=")) {
    const ids = value.slice(7).split(",").filter(Boolean);
    if (!ids.length) throw Error("Missing GPU device IDs.");
    return { capabilities: ["gpu"], device_ids: ids };
  }
  throw Error(
    "Unsupported GPU specification; use all, a count, or device IDs.",
  );
}
export function convertDocker(input: string, parser: Parser): DockerResult {
  if (new TextEncoder().encode(input).length > MAX_DOCKER_INPUT)
    throw new DockerError("too_large");
  for (const c of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const cp = c.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) throw new DockerError("invalid_unicode");
  }
  if (!input.trim())
    return { output: "", warnings: [], error: null, serviceCount: 0 };
  const warnings = new Set<string>(),
    services: ObjectValue = Object.create(null),
    networks = new Set<string>(),
    volumes = new Set<string>();
  try {
    for (const original of commands(input, parser, warnings)) {
      const args = [...original];
      if (args[0] === "sudo") {
        args.shift();
        if (args.at(0) === "-E") args.shift();
        warnings.add(
          "sudo is omitted; Compose does not represent host command privileges.",
        );
      }
      if (args[0] === "docker") {
        while (
          ["--context", "--host", "--config", "-H", "-c"].includes(
            args.at(1) ?? "",
          )
        ) {
          if (!args[2]) break;
          args.splice(1, 2);
          warnings.add(
            "Docker client connection options are omitted; this converter does not connect to Docker.",
          );
        }
        if (args[1] === "container") args.splice(1, 1);
      }
      if (args[0] !== "docker" || args[1] !== "run") {
        warnings.add("Skipped a command that is not docker run.");
        continue;
      }
      const service: ObjectValue = Object.create(null),
        localNetworks = new Set<string>(),
        localVolumes = new Set<string>();
      let failed = false;
      try {
        let i = 2;
        while (i < args.length) {
          // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
          const token = args[i]!;
          if (token === "--") {
            i++;
            break;
          }
          if (!token.startsWith("-") || token === "-") break;
          let flag: string, inline: string | undefined;
          if (token.startsWith("--")) {
            const at = token.indexOf("=");
            flag = token.slice(2, at < 0 ? undefined : at);
            if (at >= 0) inline = token.slice(at + 1);
          } else {
            const short = token.slice(1);
            if (
              /^[itd]/.test(short) &&
              !/^[itd]+$/.test(short) &&
              !short.includes("=")
            ) {
              // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
              const flags = short.match(/^[itd]+/)![0];
              args.splice(
                i,
                1,
                ...Array.from(flags, (c) => `-${c}`),
                `-${short.slice(flags.length)}`,
              );
              continue;
            }
            if (/^[itd]+$/.test(short)) {
              for (const c of short) {
                if (c === "d")
                  warnings.add(
                    "Detach mode is omitted; choose it when starting Compose.",
                  );
                else service[c === "i" ? "stdin_open" : "tty"] = true;
              }
              i++;
              continue;
            }
            // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
            flag = shortOptions[short[0]!] ?? "";
            inline = short.length > 1 ? short.slice(1) : undefined;
          }
          i++;
          const take = () => {
            if (inline !== undefined) return inline;
            const v = args[i];
            if (v === undefined || v.startsWith("--"))
              throw Error(`Missing value for --${flag}.`);
            i++;
            return v;
          };
          if (owns(booleanOptions, flag)) {
            if (inline !== undefined && !["true", "false"].includes(inline))
              throw Error(`Invalid boolean for --${flag}.`);
            // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
            service[booleanOptions[flag]!] = inline !== "false";
          } else if (["detach", "rm", "publish-all"].includes(flag))
            warnings.add(
              `--${flag} has no equivalent in the generated service and was omitted.`,
            );
          else if (flag === "pull") {
            take();
            warnings.add(
              "--pull is a command execution policy and is omitted.",
            );
          } else if (owns(arrayOptions, flag))
            // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
            push(service, arrayOptions[flag]!, take());
          else if (owns(scalarOptions, flag))
            // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
            service[scalarOptions[flag]!] = take();
          else if (flag === "volume")
            push(service, "volumes", volume(take(), localVolumes));
          else if (flag === "mount")
            push(service, "volumes", mount(take(), localVolumes));
          else if (flag === "network" || flag === "net") {
            const v = take();
            if (
              ["host", "none", "bridge"].includes(v) ||
              v.startsWith("container:")
            )
              service.network_mode = v;
            else localNetworks.add(v);
          } else if (flag === "sysctl") {
            const [k, v] = keyValue(take());
            if (!k) throw Error("Missing sysctl name.");
            object(service, "sysctls")[k] = v;
          } else if (flag === "log-driver")
            object(service, "logging").driver = take();
          else if (flag === "log-opt") {
            const [k, v] = keyValue(take());
            object(object(service, "logging"), "options")[k] = v;
          } else if (flag === "health-cmd")
            object(service, "healthcheck").test = ["CMD-SHELL", take()];
          else if (
            [
              "health-interval",
              "health-timeout",
              "health-start-period",
            ].includes(flag)
          )
            object(service, "healthcheck")[flag.slice(7).replaceAll("-", "_")] =
              take();
          else if (flag === "health-retries") {
            const v = take();
            if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)))
              throw Error("Invalid health retries.");
            object(service, "healthcheck").retries = Number(v);
          } else if (flag === "no-healthcheck") {
            if (inline !== undefined && !["true", "false"].includes(inline))
              throw Error(`Invalid boolean for --${flag}.`);
            object(service, "healthcheck").disable = inline !== "false";
          } else if (flag === "cpus" || flag === "memory")
            object(object(object(service, "deploy"), "resources"), "limits")[
              flag
            ] = take();
          else if (flag === "gpus")
            object(
              object(object(service, "deploy"), "resources"),
              "reservations",
            ).devices = [gpu(take())];
          else if (flag === "ulimit") {
            const [k, v] = keyValue(take()),
              [soft, hard = soft] = v.split(":");
            if (
              !k ||
              !soft ||
              !hard ||
              ![soft, hard].every(
                (s) =>
                  /^-?\d+$/.test(s) &&
                  Number.isSafeInteger(Number(s)) &&
                  Number(s) >= -1,
              )
            )
              throw Error("Invalid ulimit.");
            object(service, "ulimits")[k] = {
              soft: Number(soft),
              hard: Number(hard),
            };
          } else
            throw Error(
              `Unsupported option ${token}; this command was not converted because its argument boundaries are ambiguous.`,
            );
        }
        if ((service.healthcheck as ObjectValue | undefined)?.disable === true)
          service.healthcheck = { disable: true };
        const image = args[i];
        if (!image || image.startsWith("-"))
          throw Error("Missing Docker image.");
        service.image = image;
        if (args.length > i + 1) service.command = args.slice(i + 1);
        if (service.network_mode && localNetworks.size)
          throw Error("network_mode cannot be combined with named networks.");
        if (localNetworks.size) service.networks = [...localNetworks];
      } catch (e) {
        failed = true;
        // This block only invokes local string helpers, which throw Error instances.
        warnings.add((e as Error).message);
      }
      if (failed) continue;
      let name =
        String(service.container_name ?? service.image)
          .replace(/[^a-zA-Z0-9_.-]+/g, "_")
          .replace(/^[^a-zA-Z0-9]+/, "") || "service";
      const base = name;
      let n = 2;
      while (owns(services, name)) name = `${base}_${n++}`;
      services[name] = service;
      for (const v of localNetworks) networks.add(v);
      for (const v of localVolumes) volumes.add(v);
    }
  } catch (e) {
    return {
      output: "",
      warnings: [...warnings],
      error: e instanceof Error ? e.message : "Invalid command.",
      serviceCount: 0,
    };
  }
  const serviceCount = Object.keys(services).length;
  if (!serviceCount)
    return {
      output: "",
      warnings: [...warnings],
      error: "No valid docker run commands found.",
      serviceCount: 0,
    };
  const result: ObjectValue = { services };
  if (networks.size)
    result.networks = Object.fromEntries([...networks].map((n) => [n, {}]));
  if (volumes.size)
    result.volumes = Object.fromEntries([...volumes].map((n) => [n, {}]));
  const output = stringify(result, { lineWidth: 100 });
  if (output.length > 32 * 1024 * 1024)
    throw new DockerError("output_too_large");
  return { output, warnings: [...warnings], error: null, serviceCount };
}
