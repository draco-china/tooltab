import { createRequire } from "node:module";
import { afterAll, expect, it } from "vitest";
import { parse } from "yaml";
import Parser from "web-tree-sitter";
import { convertDocker } from "../../src/project/docker";

const require = createRequire(import.meta.url);
await Parser.init({
  locateFile: () => require.resolve("web-tree-sitter/tree-sitter.wasm"),
});
const language = await Parser.Language.load(
  require.resolve("tree-sitter-bash/tree-sitter-bash.wasm"),
);
const parser = new Parser();
parser.setLanguage(language);
afterAll(() => parser.delete());

it("maps official Docker examples and all audited resource, security, network, health, mount fields", () => {
  const command = `docker run -dit --name web -p 127.0.0.1:8080:80 -e EMPTY= --env-file ./synthetic.env -v data:/data:ro --mount type=bind,source=/tmp/synthetic,target=/app,readonly,bind-propagation=rshared --network example --restart unless-stopped --entrypoint /bin/sh -w /app -u 1000 --hostname demo --add-host example:127.0.0.1 --label k=v --cap-add NET_ADMIN --cap-drop SYS_ADMIN --dns 1.1.1.1 --dns-search example --device /dev/null:/dev/null --security-opt no-new-privileges --sysctl net.ipv4.ip_forward=1 --log-driver json-file --log-opt max-size=10m --health-cmd 'echo healthy' --health-interval 30s --health-timeout 5s --health-retries 3 --health-start-period 10s --init --privileged=false --read-only --platform linux/amd64 --ipc host --pid host --shm-size 64m --gpus '"device=0,1"' --cpus 1.5 --cpuset-cpus 0-1 -m 512m --memory-swap 1g --expose 9000 --link db:db --tmpfs /run --ulimit nofile=1024:2048 nginx:alpine -c 'echo hello'`;
  const result = convertDocker(command, parser);
  expect(result.error).toBeNull();
  expect(result.serviceCount).toBe(1);
  const value = parse(result.output),
    s = value.services.web;
  expect(s.image).toBe("nginx:alpine");
  expect(s.command).toEqual(["-c", "echo hello"]);
  expect(s.privileged).toBe(false);
  expect(s.stdin_open).toBe(true);
  expect(s.tty).toBe(true);
  expect(s.environment).toEqual(["EMPTY="]);
  expect(s.entrypoint).toBe("/bin/sh");
  expect(s.healthcheck).toEqual({
    test: ["CMD-SHELL", "echo healthy"],
    interval: "30s",
    timeout: "5s",
    retries: 3,
    start_period: "10s",
  });
  expect(s.deploy.resources).toEqual({
    limits: { cpus: "1.5", memory: "512m" },
    reservations: {
      devices: [{ capabilities: ["gpu"], device_ids: ["0", "1"] }],
    },
  });
  expect(s.logging).toEqual({
    driver: "json-file",
    options: { "max-size": "10m" },
  });
  expect(s.ulimits).toEqual({ nofile: { soft: 1024, hard: 2048 } });
  expect(s.volumes[1]).toEqual({
    type: "bind",
    target: "/app",
    source: "/tmp/synthetic",
    read_only: true,
    bind: { propagation: "rshared" },
  });
  expect(value.volumes).toEqual({ data: {} });
  expect(value.networks).toEqual({ example: {} });
  for (const k of [
    "ports",
    "env_file",
    "working_dir",
    "user",
    "hostname",
    "extra_hosts",
    "labels",
    "cap_add",
    "cap_drop",
    "dns",
    "dns_search",
    "devices",
    "security_opt",
    "sysctls",
    "init",
    "read_only",
    "platform",
    "ipc",
    "pid",
    "shm_size",
    "cpuset",
    "memswap_limit",
    "expose",
    "links",
    "tmpfs",
  ])
    expect(s).toHaveProperty(k);
});
it("handles multiple commands, short options, literal shell data, quotes, empty args, named and Windows mounts", () => {
  const r = convertDocker(
    "# example\nsudo docker run -p8080:80 --name same -v 'C:\\data:/data:ro' alpine printf '' '$HOME' \"$(echo synthetic)\"; docker run --name same --net host --no-healthcheck alpine\ndocker run --mount type=tmpfs,target=/run,tmpfs-mode=1777,tmpfs-size=1024 alpine",
    parser,
  );
  expect(r.serviceCount).toBe(3);
  expect(r.warnings.some((w) => w.includes("not evaluated"))).toBe(true);
  const v = parse(r.output);
  expect(v.services.same.command).toEqual([
    "printf",
    "",
    "$$HOME",
    "$$(echo synthetic)",
  ]);
  expect(v.services.same.volumes).toEqual(["C:\\data:/data:ro"]);
  expect(v.services.same_2.network_mode).toBe("host");
  expect(v.services.same_2.healthcheck.disable).toBe(true);
  expect(v.services.alpine.volumes[0].tmpfs).toEqual({
    mode: 1023,
    size: "1024",
  });
});
it("reports unsupported/invalid input without silently reassigning arguments or losing other valid commands", () => {
  for (const input of [
    "docker run --unknown value alpine",
    "docker run --health-retries 3junk alpine",
    "docker run --network host --network demo alpine",
    "docker run --mount type=bind,target=/app,unknown=1 alpine",
    "docker run --ulimit n=9007199254740993 alpine",
  ]) {
    const result = convertDocker(input, parser);
    expect(result.error).not.toBeNull();
    expect(result.output).toBe("");
    expect(result.warnings.length).toBeGreaterThan(0);
  }
  expect(convertDocker("docker run 'unterminated", parser).error).toMatch(
    /syntax/,
  );
  expect(
    convertDocker("for x in a; do docker run alpine; done", parser).error,
  ).toMatch(/control flow/);
  const r = convertDocker(
    "docker run --unknown value alpine; docker run --rm --pull always -P --gpus all alpine",
    parser,
  );
  expect(r.serviceCount).toBe(1);
  expect(r.warnings.length).toBe(4);
  expect(
    parse(r.output).services.alpine.deploy.resources.reservations.devices[0]
      .count,
  ).toBe("all");
  expect(() => convertDocker("\ud800", parser)).toThrow("invalid_unicode");
  expect(() => convertDocker("a".repeat(8388609), parser)).toThrow("too_large");
});
it("does not mutate prototypes through attacker controlled service, label or logging keys", () => {
  const r = convertDocker(
    "docker run --name __proto__ --log-opt __proto__=safe --sysctl constructor=safe alpine",
    parser,
  );
  expect(r.serviceCount).toBe(1);
  expect({}).not.toHaveProperty("safe");
  expect(r.output).toContain("__proto__");
});
it("preserves nested shell expressions literally, complete short clusters, mount aliases and Docker client prefix", () => {
  const r = convertDocker(
    `docker --context synthetic container run -itp8080:80 --mount type=tmpfs,target=/run,tmpfs_size=4096,rw --gpus count=all --health-cmd test --no-healthcheck alpine echo "$(printf 'a b')"`,
    parser,
  );
  expect(r.error).toBeNull();
  const s = parse(r.output).services.alpine;
  expect(s.ports).toEqual(["8080:80"]);
  expect(s.stdin_open).toBe(true);
  expect(s.tty).toBe(true);
  expect(s.command).toEqual(["echo", "$$(printf 'a b')"]);
  expect(s.healthcheck).toEqual({ disable: true });
  expect(s.volumes[0].tmpfs.size).toBe("4096");
  expect(s.deploy.resources.reservations.devices[0].count).toBe("all");
});

it("preserves empty input and reports no valid docker command", () => {
  expect(convertDocker("", parser)).toEqual({
    output: "",
    warnings: [],
    error: null,
    serviceCount: 0,
  });
  const result = convertDocker("printf hello", parser);
  expect(result.output).toBe("");
  expect(result.serviceCount).toBe(0);
  expect(result.error).toBe("No valid docker run commands found.");
  expect(result.warnings).toContain(
    "Skipped a command that is not docker run.",
  );
});

it("reports parser and shell boundary diagnostics", () => {
  const cases = [
    ["docker run \\", "Invalid shell syntax."],
    ["docker run $'ansi' alpine", "ANSI-C quoted strings are not supported"],
    ["docker run 'unterminated", "Invalid shell syntax."],
    [
      "for x in a; do docker run alpine; done",
      "Shell control flow is not converted",
    ],
  ] as const;
  for (const [input, message] of cases) {
    const result = convertDocker(input, parser);
    expect(result.output).toBe("");
    expect(result.serviceCount).toBe(0);
    expect(result.error).toContain(message);
  }
  const redirected = convertDocker("docker run alpine < input.txt", parser);
  expect(redirected.error).toBeNull();
  expect(redirected.warnings).toContain(
    "Shell input/output redirections are not executed or included in Compose.",
  );
});

it("covers invalid option values without dropping the diagnostic", () => {
  const cases = [
    [
      "docker run --mount type=wat,target=/app alpine",
      "Invalid --mount type or target.",
    ],
    [
      "docker run --mount type=tmpfs,target=/app,tmpfs-mode=99 alpine",
      "Invalid tmpfs mode.",
    ],
    ["docker run --gpus 0 alpine", "Invalid GPU count."],
    ["docker run --gpus device= alpine", "Missing GPU device IDs."],
    ["docker run --gpus unsupported alpine", "Unsupported GPU specification"],
    ["docker run --health-retries nope alpine", "Invalid health retries."],
    ["docker run --ulimit nofile=bad alpine", "Invalid ulimit."],
    ["docker run --sysctl =value alpine", "Missing sysctl name."],
    [
      "docker run --interactive=maybe alpine",
      "Invalid boolean for --interactive.",
    ],
    ["docker run --volume --name foo alpine", "Missing value for --volume."],
    ["docker run --pull --name foo alpine", "Missing value for --pull."],
    ["docker run --mystery value alpine", "Unsupported option --mystery"],
  ] as const;
  for (const [input, message] of cases) {
    const result = convertDocker(input, parser);
    expect(result.output, input).toBe("");
    expect(result.serviceCount, input).toBe(0);
    expect(result.warnings.join("\n"), input).toContain(message);
  }
});

it("handles omitted options, shell assignments, and network mode aliases", () => {
  const result = convertDocker(
    "VALUE=literal docker run --rm --pull always -P --network bridge alpine; docker run --network container:api alpine",
    parser,
  );
  expect(result.error).toBeNull();
  expect(result.serviceCount).toBe(2);
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      "Leading shell variable assignments are not evaluated.",
      "--rm has no equivalent in the generated service and was omitted.",
      "--pull is a command execution policy and is omitted.",
      "--publish-all has no equivalent in the generated service and was omitted.",
    ]),
  );
  const value = parse(result.output);
  expect(value.services.alpine_2.network_mode).toBe("container:api");
});

it("preserves shell escape semantics in generated command arguments", () => {
  const result = convertDocker(
    String.raw`docker run alpine echo hello\ world "a\qb" "a\"b" 'literal\backslash'`,
    parser,
  );
  expect(result.error).toBeNull();
  expect(parse(result.output).services.alpine.command).toEqual([
    "echo",
    "hello world",
    String.raw`a\qb`,
    'a"b',
    String.raw`literal\backslash`,
  ]);
});

it("preserves named volume nocopy settings and declares the volume", () => {
  for (const flag of ["true", "false"]) {
    const result = convertDocker(
      `docker run --mount type=volume,source=cache,target=/cache,volume-nocopy=${flag} alpine`,
      parser,
    );
    expect(result.error).toBeNull();
    const value = parse(result.output);
    expect(value.services.alpine.volumes).toEqual([
      {
        type: "volume",
        source: "cache",
        target: "/cache",
        volume: { nocopy: flag === "true" },
      },
    ]);
    expect(value.volumes).toEqual({ cache: {} });
  }
});

it("handles sudo and explicit end-of-options without carrying host privileges", () => {
  const result = convertDocker(
    "sudo -E docker --host tcp://localhost:2375 run -- alpine echo hello",
    parser,
  );
  expect(result.error).toBeNull();
  expect(parse(result.output).services.alpine.command).toEqual([
    "echo",
    "hello",
  ]);
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.stringContaining("sudo is omitted"),
      expect.stringContaining("connection options are omitted"),
    ]),
  );
});

it("preserves an explicit numeric GPU reservation", () => {
  const result = convertDocker("docker run --gpus 2 alpine", parser);
  expect(result.error).toBeNull();
  expect(
    parse(result.output).services.alpine.deploy.resources.reservations.devices,
  ).toEqual([{ capabilities: ["gpu"], count: 2 }]);
});

it("covers mount defaults and aliases, including writable and empty-source cases", () => {
  const result = convertDocker(
    "docker run -v :/empty --mount target=/default --mount type=volume,target=/src --mount type=bind,src=/host,dst=/dst,rw --mount type=bind,src=/host2,destination=/dst2 --mount type=tmpfs,target=/tmp alpine",
    parser,
  );
  expect(result.error).toBeNull();
  const value = parse(result.output);
  expect(value.services.alpine.volumes).toEqual([
    ":/empty",
    { type: "volume", target: "/default" },
    { type: "volume", target: "/src" },
    { type: "bind", target: "/dst", source: "/host" },
    { type: "bind", target: "/dst2", source: "/host2" },
    { type: "tmpfs", target: "/tmp" },
  ]);
  expect(value.volumes).toBeUndefined();
  const invalid = convertDocker(
    "docker run --mount type=volume alpine",
    parser,
  );
  expect(invalid.warnings).toContain("Invalid --mount type or target.");
});

it("handles direct shell substitutions, pipelines, line continuations, and double-quote escapes", () => {
  const result = convertDocker(
    String.raw`docker run alpine printf $(printf value) "a\qb" "a\"b" "price$" \
next | cat`,
    parser,
  );
  expect(result.error).toBeNull();
  expect(parse(result.output).services.alpine.command).toEqual([
    "printf",
    "$$(printf value)",
    String.raw`a\qb`,
    'a"b',
    "price$$",
    "next",
  ]);
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Shell expressions are preserved"),
      expect.stringContaining("Shell operators separate commands"),
    ]),
  );
  expect(convertDocker("docker", parser).warnings).toContain(
    "Skipped a command that is not docker run.",
  );
});

it("preserves locale-quoted message text without treating it as interpolation", () => {
  const result = convertDocker(
    String.raw`docker run alpine $"hello"tail foo$"bar" '$"single"' "literal$HOME" foo\$HOME $(printf value)`,
    parser,
  );
  expect(result.error).toBeNull();
  expect(parse(result.output).services.alpine.command).toEqual([
    "hellotail",
    "foobar",
    '$$"single"',
    "literal$$HOME",
    "foo$$HOME",
    "$$(printf value)",
  ]);
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      "Locale translations are preserved as literal text; locale translation is not evaluated.",
      "Shell expressions are preserved as literal text; variables and substitutions are not evaluated.",
    ]),
  );
  expect(
    convertDocker('docker run alpine $"leading"', parser).warnings,
  ).toContain(
    "Locale translations are preserved as literal text; locale translation is not evaluated.",
  );
});

it("keeps locale quote offsets correct with Unicode text", () => {
  const result = convertDocker('docker run alpine 中文😀$"消息😀"tail', parser);
  expect(result.error).toBeNull();
  expect(parse(result.output).services.alpine.command).toEqual([
    "中文😀消息😀tail",
  ]);
  expect(result.warnings).toContain(
    "Locale translations are preserved as literal text; locale translation is not evaluated.",
  );
});

it("joins an escaped newline inside a Docker argument", () => {
  const result = convertDocker("docker run alpine printf foo\\\nbar", parser);
  expect(result.error).toBeNull();
  expect(parse(result.output).services.alpine.command).toEqual([
    "printf",
    "foobar",
  ]);
});

it("covers short option fallback and explicit no-healthcheck booleans", () => {
  const result = convertDocker(
    "docker run -x alpine; docker run --no-healthcheck=false alpine; docker run --no-healthcheck=true busybox; docker run --no-healthcheck=maybe ignored",
    parser,
  );
  expect(result.serviceCount).toBe(2);
  expect(result.warnings).toContain(
    "Unsupported option -x; this command was not converted because its argument boundaries are ambiguous.",
  );
  const value = parse(result.output);
  expect(value.services.alpine.healthcheck).toEqual({ disable: false });
  expect(value.services.busybox.healthcheck).toEqual({ disable: true });
});

it("rejects missing images and sanitizes names that contain no usable characters", () => {
  const missing = convertDocker("docker run --", parser);
  expect(missing.error).toBe("No valid docker run commands found.");
  expect(missing.warnings).toContain("Missing Docker image.");
  expect(missing.serviceCount).toBe(0);

  const result = convertDocker("docker run --name '!!!' alpine", parser);
  expect(result.error).toBeNull();
  expect(Object.keys(parse(result.output).services)).toEqual(["service"]);
});

it("skips incomplete Docker client prefixes and reports a pipeline warning", () => {
  const skipped = convertDocker("docker --host | cat; docker --host", parser);
  expect(skipped.serviceCount).toBe(0);
  expect(skipped.error).toBe("No valid docker run commands found.");
  expect(skipped.warnings).toContain(
    "Skipped a command that is not docker run.",
  );
  const result = convertDocker("docker --host docker run alpine | cat", parser);
  expect(result.serviceCount).toBe(1);
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Skipped a command that is not docker run"),
      expect.stringContaining("Shell operators separate commands"),
    ]),
  );
});

it("preserves quoted backslashes and removes escaped line continuations", () => {
  const command =
    'docker run --name quoted alpine printf "%s" "left\\\nright" "a\\q"';
  const result = convertDocker(command, parser);
  expect(result.error).toBeNull();
  expect(parse(result.output).services.quoted.command).toEqual([
    "printf",
    "%s",
    "leftright",
    "a\\q",
  ]);
});

it("keeps whitespace around line continuations as argument separators", () => {
  for (const argument of ["foo \\\nbar", "foo\\\n bar"]) {
    const result = convertDocker(
      `docker run alpine printf ${argument}`,
      parser,
    );
    expect(result.error).toBeNull();
    expect(parse(result.output).services.alpine.command).toEqual([
      "printf",
      "foo",
      "bar",
    ]);
  }
  const result = convertDocker(
    "docker run alpine printf foo\\\n\\\nbar",
    parser,
  );
  expect(result.error).toBeNull();
  expect(parse(result.output).services.alpine.command).toEqual([
    "printf",
    "foobar",
  ]);
});

it("rejects YAML output inflated by escaping an abnormal container name", () => {
  const command = `docker run --name 'a${"\x01".repeat(8_200_000)}' alpine`;
  expect(new TextEncoder().encode(command).length).toBeLessThan(8 * 1048576);
  expect(() => convertDocker(command, parser)).toThrow("output_too_large");
}, 30_000);

it("reports a real parser deadline and permits retry after resetting the parser", () => {
  const limited = new Parser();
  limited.setLanguage(language);
  limited.setTimeoutMicros(1);
  try {
    const result = convertDocker(
      `docker run alpine ${"argument ".repeat(100000)}`,
      limited,
    );
    expect(result).toEqual({
      output: "",
      warnings: [],
      error: "Parsing failed",
      serviceCount: 0,
    });
    limited.reset();
    limited.setTimeoutMicros(0);
    const retry = convertDocker("docker run alpine echo recovered", limited);
    expect(retry.error).toBeNull();
    expect(retry.serviceCount).toBe(1);
    expect(parse(retry.output).services.alpine.command).toEqual([
      "echo",
      "recovered",
    ]);
  } finally {
    limited.delete();
  }
});

it("contains non-Error failures from a caller-supplied parser logger", () => {
  const logged = new Parser();
  logged.setLanguage(language);
  logged.setLogger(() => {
    throw "caller logger failed";
  });
  try {
    expect(convertDocker("docker run alpine", logged)).toEqual({
      output: "",
      warnings: [],
      error: "Invalid command.",
      serviceCount: 0,
    });
    logged.setLogger(null);
    logged.reset();
    const retry = convertDocker("docker run alpine", logged);
    expect(retry.error).toBeNull();
    expect(parse(retry.output).services.alpine.image).toBe("alpine");
  } finally {
    logged.setLogger(null);
    logged.delete();
  }
});

it.each([
  [String.raw`foo\$"bar"`, "foo$$bar", false],
  [`'foo$"bar"'`, 'foo$$"bar"', false],
  [`"中文😀$"`, "中文😀$$", false],
  [`$"消息😀"tail`, "消息😀tail", true],
  [`$"$HOME"tail`, "$$HOMEtail", true],
  [`foo$"$(printf value)"`, "foo$$(printf value)", true],
])(
  "preserves locale and literal dollar boundaries in %s",
  (argument, expected, translated) => {
    const result = convertDocker(`docker run alpine ${argument}`, parser);
    expect(result.error).toBeNull();
    expect(parse(result.output).services.alpine.command).toEqual([expected]);
    expect(
      result.warnings.some((warning) =>
        warning.startsWith("Locale translations"),
      ),
    ).toBe(translated);
  },
);
