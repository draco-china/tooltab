import { m } from "@/paraglide/messages.js";

const keys = {
  "Shell expressions are preserved as literal text; variables and substitutions are not evaluated.":
    m["tools.userAgentParser.dockerDiagnostic1"],
  "Leading shell variable assignments are not evaluated.":
    m["tools.userAgentParser.dockerDiagnostic2"],
  "Shell input/output redirections are not executed or included in Compose.":
    m["tools.userAgentParser.dockerDiagnostic3"],
  "Shell operators separate commands; execution order and pipe semantics are not represented in Compose.":
    m["tools.userAgentParser.dockerDiagnostic4"],
  "sudo is omitted; Compose does not represent host command privileges.":
    m["tools.userAgentParser.dockerDiagnostic5"],
  "Docker client connection options are omitted; this converter does not connect to Docker.":
    m["tools.userAgentParser.dockerDiagnostic6"],
  "Skipped a command that is not docker run.":
    m["tools.userAgentParser.dockerDiagnostic7"],
  "Detach mode is omitted; choose it when starting Compose.":
    m["tools.userAgentParser.dockerDiagnostic8"],
  "--pull is a command execution policy and is omitted.":
    m["tools.userAgentParser.dockerDiagnostic9"],
  "Invalid shell syntax.": m["tools.userAgentParser.dockerDiagnostic10"],
  "No valid docker run commands found.": m["common.dockerDiagnostic11"],
  "Missing Docker image.": m["tools.userAgentParser.dockerDiagnostic12"],
  "network_mode cannot be combined with named networks.":
    m["tools.userAgentParser.dockerDiagnostic13"],
  "Invalid --mount type or target.":
    m["tools.userAgentParser.dockerDiagnostic14"],
  "Invalid tmpfs mode.": m["tools.userAgentParser.dockerDiagnostic15"],
  "Invalid GPU count.": m["tools.userAgentParser.dockerDiagnostic16"],
  "Missing GPU device IDs.": m["tools.userAgentParser.dockerDiagnostic17"],
  "Unsupported GPU specification; use all, a count, or device IDs.":
    m["tools.userAgentParser.dockerDiagnostic18"],
  "Invalid health retries.": m["tools.userAgentParser.dockerDiagnostic19"],
  "Invalid ulimit.": m["tools.userAgentParser.dockerDiagnostic20"],
  "Missing sysctl name.": m["tools.userAgentParser.dockerDiagnostic21"],
  "Shell control flow is not converted. Supply explicit docker run commands.":
    m["tools.userAgentParser.dockerDiagnostic22"],
  "ANSI-C quoted strings are not supported; use ordinary quotes with literal characters.":
    m["tools.userAgentParser.dockerDiagnostic23"],
  "Dangling escape.": m["tools.userAgentParser.dockerDiagnostic24"],
  "Unclosed quote.": m["tools.userAgentParser.dockerDiagnostic25"],
  "Unable to parse command.": m["tools.userAgentParser.dockerDiagnostic26"],
  "Unable to convert command.": m["tools.userAgentParser.dockerDiagnostic27"],
  "Invalid command.": m["tools.userAgentParser.dockerDiagnostic28"],
} as const;
export function dockerDiagnostic(value: string) {
  if (Object.hasOwn(keys, value)) return keys[value as keyof typeof keys]({});
  let match = value.match(/^Missing value for (.+)\.$/);
  if (match) return `${m["common.dockerMissingValue"]()} ${match[1]}`;
  match = value.match(/^Invalid boolean for (.+)\.$/);
  if (match) return `${m["common.dockerInvalidBoolean"]()} ${match[1]}`;
  match = value.match(/^Unsupported --mount option (.+)\.$/);
  if (match) return `${m["common.dockerUnknownMount"]()} ${match[1]}`;
  match = value.match(/^Unsupported option (.+); this command/);
  if (match) return `${m["common.dockerUnknownOption"]()} ${match[1]}`;
  match = value.match(/^(--[^ ]+) has no equivalent/);
  if (match) return `${m["common.dockerOmittedOption"]()} ${match[1]}`;
  return value;
}
