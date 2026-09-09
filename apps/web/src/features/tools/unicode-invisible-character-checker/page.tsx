import { LOREM_LABELS } from "@/features/tools/text-utilities/lorem";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Link,
  ListBox,
  Select,
  Table,
  TextArea,
  toast,
} from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { Download, FileSearch, FileText, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  INVISIBLE_CATEGORIES,
  type InvisibleCategory,
} from "@workspace/tools/text/invisible";
import {
  MAX_UTILITY_INPUT,
  TextUtilityError,
  type UtilityJob,
  type UtilityResult,
  utilityFiles,
} from "../text-utilities/logic";
import { LOREM_LOCALES, type LoremLocale } from "@workspace/tools/text/lorem";
import { runUtilityWorker } from "../text-utilities/worker-client";

const errorMessages = {
  invalid_input: m["common.utilityerrorInvalidInput"],
  invalid_options: m["shared.textUtilities.utilityerrorInvalidOptions"],
  invalid_morse: m["shared.textUtilities.utilityerrorInvalidMorse"],
  too_large: m["shared.textUtilities.utilityerrorTooLarge"],
  audio_too_long: m["shared.textUtilities.utilityerrorAudioTooLong"],
  unsupported: m["shared.textUtilities.utilityerrorUnsupported"],
  timeout: m["shared.textUtilities.utilityerrorTimeout"],
  busy: m["shared.textUtilities.utilityerrorBusy"],
  read_failed: m["shared.textUtilities.utilityerrorReadFailed"],
  artifact_required: m["shared.textUtilities.utilityerrorArtifactRequired"],
} as const;

function clipText(text: string, limit: number) {
  const end =
    text.length > limit && /[\uD800-\uDBFF]/.test(text[limit - 1] ?? "")
      ? limit - 1
      : limit;
  return text.slice(0, end);
}
function Choice({
  id,
  label,
  value,
  items,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  items: {
    value: string;
    label: string;
  }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Select
        variant="secondary"
        selectedKey={value}
        onSelectionChange={(key) => {
          if (key !== null) onChange(String(key));
        }}
      >
        <Label>{label}</Label>
        <Select.Trigger id={id}>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Section>
              {items.map((item) => (
                <ListBox.Item
                  key={item.value}
                  id={item.value}
                  textValue={String(item.value)}
                >
                  {item.label}
                </ListBox.Item>
              ))}
            </ListBox.Section>
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
export function TextUtilityTool({
  kind,
}: {
  kind: "invisible" | "morse" | "lorem";
}) {
  const pageLocale = getLocale();
  const id = useId();
  const [input, setInput] = useState(""),
    [mode, setMode] = useState("encode"),
    [categories, setCategories] = useState<InvisibleCategory[]>([
      ...INVISIBLE_CATEGORIES,
    ]),
    [locale, setLocale] = useState<LoremLocale>("en"),
    [loremMode, setLoremMode] = useState("paragraphs"),
    [count, setCount] = useState("1"),
    [seed, setSeed] = useState(""),
    [result, setResult] = useState<Exclude<
      UtilityResult,
      {
        kind: "audio";
      }
    > | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [links, setLinks] = useState<
      {
        url: string;
        name: string;
        text: string;
      }[]
    >([]),
    [playing, setPlaying] = useState(false);
  const revision = useRef(0),
    copyRevision = useRef(0),
    audioRevision = useRef(0),
    controller = useRef<AbortController | null>(null),
    reader = useRef<FileReader | null>(null),
    urls = useRef<string[]>([]),
    audio = useRef<HTMLAudioElement | null>(null),
    audioUrl = useRef<string | null>(null);
  function stop() {
    audioRevision.current++;
    audio.current?.pause();
    audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    setPlaying(false);
  }
  function clear() {
    revision.current++;
    controller.current?.abort();
    reader.current?.abort();
    stop();
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setLinks([]);
    setResult(null);
    setError("");
    setBusy(false);
  }
  useEffect(
    () => () => {
      revision.current++;
      controller.current?.abort();
      reader.current?.abort();
      audio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  function fail(e: unknown) {
    setError(
      e instanceof TextUtilityError
        ? errorMessages[e.code]({})
        : m["common.utilityerrorInvalidInput"](),
    );
  }
  async function run() {
    clear();
    const current = revision.current,
      c = new AbortController();
    controller.current = c;
    setBusy(true);
    try {
      let job: UtilityJob;
      if (kind === "invisible") job = { kind, input, categories };
      else if (kind === "morse")
        job = { kind, input, mode: mode as "encode" | "decode" };
      else
        job = {
          kind,
          mode: loremMode as "words" | "sentences" | "paragraphs",
          count: Number(count),
          locale,
          ...(seed === "" ? {} : { seed: Number(seed) }),
        };
      const output = await runUtilityWorker(job, c.signal);
      if (current !== revision.current || output.kind === "audio") return;
      setResult(output);
      setLinks(
        utilityFiles(output).map((file) => {
          const url = URL.createObjectURL(
            new Blob([file.text], {
              type: file.filename.endsWith(".tsv")
                ? "text/tab-separated-values;charset=utf-8"
                : "text/plain;charset=utf-8",
            }),
          );
          urls.current.push(url);
          return { url, name: file.filename, text: file.text };
        }),
      );
    } catch (e) {
      if (current === revision.current && !c.signal.aborted) fail(e);
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  function load(file: File) {
    clear();
    if (file.size > MAX_UTILITY_INPUT) {
      fail(new TextUtilityError("too_large"));
      return;
    }
    const current = revision.current,
      r = new FileReader();
    reader.current = r;
    setBusy(true);
    r.onload = () => {
      if (current !== revision.current) return;
      try {
        setInput(
          new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
            r.result as ArrayBuffer,
          ),
        );
      } catch {
        fail(new TextUtilityError("read_failed"));
      }
      setBusy(false);
    };
    r.onerror = () => {
      if (current === revision.current) {
        fail(new TextUtilityError("read_failed"));
        setBusy(false);
      }
    };
    r.readAsArrayBuffer(file);
  }
  async function play() {
    if (result?.kind !== "morse") return;
    stop();
    const audioCurrent = audioRevision.current;
    const current = revision.current,
      c = new AbortController();
    controller.current = c;
    setBusy(true);
    try {
      const wav = await runUtilityWorker(
        { kind: "audio", input: result.morse },
        c.signal,
      );
      if (
        current !== revision.current ||
        audioCurrent !== audioRevision.current ||
        wav.kind !== "audio"
      )
        return;
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(wav.bytes)], { type: "audio/wav" }),
      );
      audioUrl.current = url;
      const player = new Audio(url);
      audio.current = player;
      player.onended = () => {
        if (audio.current === player) stop();
      };
      await player.play();
      if (
        current === revision.current &&
        audioCurrent === audioRevision.current
      )
        setPlaying(true);
    } catch (e) {
      if (
        current === revision.current &&
        audioCurrent === audioRevision.current &&
        !c.signal.aborted
      ) {
        stop();
        fail(e);
      }
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  async function copy(text: string) {
    const current = revision.current;
    const copyCurrent = ++copyRevision.current;
    try {
      await navigator.clipboard.writeText(text);
      if (current === revision.current && copyCurrent === copyRevision.current)
        toast.success(m["common.actions.copied"]());
    } catch {
      if (current === revision.current && copyCurrent === copyRevision.current)
        toast.danger(m["common.actions.copyError"]());
    }
  }
  const labels = {
    "zero-width": m["tools.unicodeInvisibleCharacterChecker.utilityzero"](),
    "bidi-control": m["tools.unicodeInvisibleCharacterChecker.utilitybidi"](),
    "space-like": m["tools.unicodeInvisibleCharacterChecker.utilityspace"](),
    format: m["tools.unicodeInvisibleCharacterChecker.utilityformat"](),
  };
  if (kind === "invisible") {
    const invisibleResult = result?.kind === "invisible" ? result : null;
    return (
      <div className="grid gap-6" data-tool-panels>
        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <ToolPanelCard>
            <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Card.Title>
                  {m["tools.unicodeInvisibleCharacterChecker.utilityinput"]()}
                </Card.Title>
                <Card.Description>
                  {m["shared.textUtilities.utilityinvisiblenote"]()}
                </Card.Description>
              </div>
              <ToolPanelActionGroup className="shrink-0 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    clear();
                    setInput("Hello\u200b world\u00a0\u202e");
                  }}
                >
                  <FileText aria-hidden className="size-4" />
                  {m["tools.unicodeInvisibleCharacterChecker.utilitysample"]()}
                </Button>
                <Button
                  variant="ghost"
                  isDisabled={!input}
                  onClick={() => {
                    clear();
                    setInput("");
                  }}
                >
                  <X aria-hidden className="size-4" />
                  {m["tools.unicodeInvisibleCharacterChecker.utilityclear"]()}
                </Button>
                {busy ? (
                  <Button variant="outline" onClick={clear}>
                    {m["common.actions.cancel"]()}
                  </Button>
                ) : null}
                <Button isDisabled={busy} onClick={() => void run()}>
                  <FileSearch aria-hidden className="size-4" />
                  {m["tools.unicodeInvisibleCharacterChecker.utilityrun"]()}
                </Button>
              </ToolPanelActionGroup>
            </Card.Header>
            <ToolPanelCardContent className="gap-4 py-4">
              <TextArea
                id={`${id}-input`}
                aria-label={m[
                  "tools.unicodeInvisibleCharacterChecker.utilityinput"
                ]()}
                value={input}
                onChange={(e) => {
                  clear();
                  setInput(e.target.value);
                }}
                className="field-sizing-fixed h-72 max-h-128 font-mono"
              />
              <ToolFilePicker
                label={m[
                  "tools.unicodeInvisibleCharacterChecker.utilityimport"
                ]()}
                onSelect={load}
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </ToolPanelCardContent>
          </ToolPanelCard>

          <ToolPanelCard>
            <Card.Header className="border-b border-separator">
              <Card.Title>
                {m[
                  "tools.unicodeInvisibleCharacterChecker.utilitycategories"
                ]()}
              </Card.Title>
            </Card.Header>
            <ToolPanelCardContent className="gap-2 py-4">
              {INVISIBLE_CATEGORIES.map((category) => (
                <Checkbox
                  key={category}
                  isSelected={categories.includes(category)}
                  onChange={(selected) => {
                    clear();
                    setCategories(
                      selected
                        ? [...categories, category]
                        : categories.filter((value) => value !== category),
                    );
                  }}
                >
                  <Checkbox.Content className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <span>{labels[category]}</span>
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </ToolPanelCardContent>
            <ToolPanelCardFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  clear();
                  setCategories([...INVISIBLE_CATEGORIES]);
                }}
              >
                <RotateCcw aria-hidden className="size-4" />
                {m["tools.unicodeInvisibleCharacterChecker.utilityall"]()}
              </Button>
            </ToolPanelCardFooter>
          </ToolPanelCard>
        </div>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.unicodeInvisibleCharacterChecker.utilityresult"]()}
            </Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            {!invisibleResult ? (
              <div className="flex min-h-44 items-center justify-center text-center text-sm text-muted">
                {m["tools.unicodeInvisibleCharacterChecker.utilityrun"]()}
              </div>
            ) : (
              <section
                className="grid gap-5"
                aria-label={m[
                  "tools.unicodeInvisibleCharacterChecker.utilityresult"
                ]()}
              >
                <div className="grid gap-2">
                  <p className="text-sm font-medium">
                    {m["tools.unicodeInvisibleCharacterChecker.utilityfound"]()}
                    : {invisibleResult.total} ·{" "}
                    {m[
                      "tools.unicodeInvisibleCharacterChecker.utilityremaining"
                    ]()}
                    : {invisibleResult.cleanedCodePoints}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    {INVISIBLE_CATEGORIES.map((category) => (
                      <span key={category}>
                        {labels[category]}: {invisibleResult.counts[category]}
                      </span>
                    ))}
                  </div>
                </div>
                {invisibleResult.findings.length > 0 ? (
                  <Table variant="secondary">
                    <Table.ScrollContainer className="max-h-80">
                      <Table.Content
                        aria-label={m[
                          "tools.unicodeInvisibleCharacterChecker.utilityresult"
                        ]()}
                      >
                        <Table.Header>
                          <Table.Column id="position" isRowHeader>
                            {m[
                              "tools.unicodeInvisibleCharacterChecker.utilityposition"
                            ]()}
                          </Table.Column>
                          <Table.Column id="code">
                            {m[
                              "tools.unicodeInvisibleCharacterChecker.utilitycode"
                            ]()}
                          </Table.Column>
                          <Table.Column id="name">
                            {m[
                              "tools.unicodeInvisibleCharacterChecker.utilityname"
                            ]()}
                          </Table.Column>
                          <Table.Column id="category">
                            {m[
                              "tools.unicodeInvisibleCharacterChecker.utilitycategories"
                            ]()}
                          </Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {invisibleResult.findings.map((finding) => (
                            <Table.Row
                              key={finding.index}
                              id={String(finding.index)}
                            >
                              <Table.Cell>
                                #{finding.index} · {finding.line}:
                                {finding.column}
                              </Table.Cell>
                              <Table.Cell className="font-mono">
                                {finding.code}
                              </Table.Cell>
                              <Table.Cell>{finding.name}</Table.Cell>
                              <Table.Cell>
                                {labels[finding.category as InvisibleCategory]}
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                ) : null}
                {invisibleResult.findingsTruncated ? (
                  <p className="text-sm text-muted">
                    {m[
                      "tools.unicodeInvisibleCharacterChecker.utilitypreviewnote"
                    ]()}
                  </p>
                ) : null}
                {links.map((link) => (
                  <div className="grid gap-3" key={link.url}>
                    <p className="text-sm font-medium">{link.name}</p>
                    <TextArea
                      aria-label={link.name}
                      readOnly
                      value={clipText(link.text, 16000)}
                      className="field-sizing-fixed h-40 max-h-80 font-mono"
                    />
                    {link.text.length > 16000 ? (
                      <p className="text-sm text-muted">
                        {m[
                          "tools.unicodeInvisibleCharacterChecker.utilitypreviewnote"
                        ]()}
                      </p>
                    ) : null}
                    <ToolPanelActionGroup>
                      <Button
                        variant="outline"
                        onClick={() => void copy(link.text)}
                      >
                        {m[
                          "tools.unicodeInvisibleCharacterChecker.utilitycopy"
                        ]()}
                      </Button>
                      <Link
                        href={link.url}
                        download={link.name}
                        className={buttonVariants({ variant: "outline" })}
                      >
                        <Download aria-hidden className="size-4" />
                        {m[
                          "tools.unicodeInvisibleCharacterChecker.utilitydownload"
                        ]()}
                      </Link>
                    </ToolPanelActionGroup>
                  </div>
                ))}
              </section>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {(kind === "morse"
          ? m["shared.textUtilities.utilitymorsenote"]
          : m["shared.textUtilities.utilityloremnote"])({})}
      </p>
      {kind !== "lorem" ? (
        <div>
          <label htmlFor={`${id}-input`}>
            {m["tools.unicodeInvisibleCharacterChecker.utilityinput"]()}
          </label>
          <TextArea
            id={`${id}-input`}
            value={input}
            onChange={(e) => {
              clear();
              setInput(e.target.value);
            }}
            className="field-sizing-fixed h-44 max-h-80 font-mono"
          />
          <ToolFilePicker
            label={m["tools.unicodeInvisibleCharacterChecker.utilityimport"]()}
            onSelect={load}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                clear();
                setInput(
                  mode === "encode"
                    ? "SOS Hello world!"
                    : "... --- ... / .... . .-.. .-.. ---",
                );
              }}
            >
              {m["tools.unicodeInvisibleCharacterChecker.utilitysample"]()}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice
            id={`${id}-locale`}
            label={m["tools.unicodeInvisibleCharacterChecker.utilitylocale"]()}
            value={locale}
            items={LOREM_LOCALES.map((value) => ({
              value,
              label: LOREM_LABELS[value],
            }))}
            onChange={(v) => {
              clear();
              setLocale(v as LoremLocale);
            }}
          />
          <Choice
            id={`${id}-mode`}
            label={m["tools.unicodeInvisibleCharacterChecker.utilitymode"]()}
            value={loremMode}
            items={[
              {
                value: "words",
                label:
                  m["tools.unicodeInvisibleCharacterChecker.utilitywords"](),
              },
              {
                value: "sentences",
                label:
                  m[
                    "tools.unicodeInvisibleCharacterChecker.utilitysentences"
                  ](),
              },
              {
                value: "paragraphs",
                label:
                  m[
                    "tools.unicodeInvisibleCharacterChecker.utilityparagraphs"
                  ](),
              },
            ]}
            onChange={(v) => {
              clear();
              setLoremMode(v);
            }}
          />
          <div>
            <label htmlFor={`${id}-count`}>
              {m["tools.unicodeInvisibleCharacterChecker.utilitycount"]()}
            </label>
            <Input
              id={`${id}-count`}
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => {
                clear();
                setCount(e.target.value);
              }}
            />
          </div>
          <div>
            <label htmlFor={`${id}-seed`}>
              {m["tools.unicodeInvisibleCharacterChecker.utilityseed"]()}
            </label>
            <Input
              id={`${id}-seed`}
              type="number"
              min={0}
              max={4294967295}
              value={seed}
              onChange={(e) => {
                clear();
                setSeed(e.target.value);
              }}
            />
            <p>
              {m["tools.unicodeInvisibleCharacterChecker.utilityseednote"]()}
            </p>
          </div>
        </div>
      )}
      {kind === "morse" && (
        <Choice
          id={`${id}-direction`}
          label={m["tools.unicodeInvisibleCharacterChecker.utilitymode"]()}
          value={mode}
          items={[
            {
              value: "encode",
              label:
                m["tools.unicodeInvisibleCharacterChecker.utilityencode"](),
            },
            {
              value: "decode",
              label:
                m["tools.unicodeInvisibleCharacterChecker.utilitydecode"](),
            },
          ]}
          onChange={(v) => {
            clear();
            setMode(v);
          }}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={busy} onClick={() => void run()}>
          {m["tools.unicodeInvisibleCharacterChecker.utilityrun"]()}
        </Button>
        {busy && (
          <Button variant="outline" onClick={clear}>
            {m["common.actions.cancel"]()}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            clear();
            setInput("");
          }}
        >
          {m["tools.unicodeInvisibleCharacterChecker.utilityclear"]()}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <section
          className="space-y-4"
          aria-label={m[
            "tools.unicodeInvisibleCharacterChecker.utilityresult"
          ]()}
        >
          {result.kind === "lorem" && (
            <p className="text-sm text-muted-foreground">
              {m["tools.unicodeInvisibleCharacterChecker.utilityseed"]()}:{" "}
              {result.seed} ·{" "}
              {result.latin
                ? m["tools.unicodeInvisibleCharacterChecker.utilitylatin"]()
                : LOREM_LABELS[result.locale]}
            </p>
          )}
          {result.kind === "morse" && (
            <>
              <p className="text-sm text-muted-foreground">
                {m["tools.unicodeInvisibleCharacterChecker.utilityduration"]()}:{" "}
                {result.durationSeconds.toLocaleString(pageLocale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                s
              </p>
              {result.unsupported.length > 0 && (
                <p role="status" className="text-sm break-all">
                  {m[
                    "tools.unicodeInvisibleCharacterChecker.utilityunsupported"
                  ]()}
                  : {result.unsupported.slice(0, 500).join(" ")}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  isDisabled={busy || !result.audioAvailable || playing}
                  onClick={() => void play()}
                >
                  {m["tools.unicodeInvisibleCharacterChecker.utilityplay"]()}
                </Button>
                <Button
                  variant="outline"
                  isDisabled={!playing && !busy}
                  onClick={() => {
                    controller.current?.abort();
                    setBusy(false);
                    stop();
                  }}
                >
                  {m["tools.unicodeInvisibleCharacterChecker.utilitystop"]()}
                </Button>
              </div>
              {!result.audioAvailable && (
                <p className="text-sm text-muted-foreground">
                  {m[
                    "tools.unicodeInvisibleCharacterChecker.utilityaudiolimit"
                  ]()}
                </p>
              )}
            </>
          )}
          {result.kind === "invisible" && (
            <>
              <p className="text-sm">
                {m["tools.unicodeInvisibleCharacterChecker.utilityfound"]()}:{" "}
                {result.total} ·{" "}
                {m["tools.unicodeInvisibleCharacterChecker.utilityremaining"]()}
                : {result.cleanedCodePoints}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {INVISIBLE_CATEGORIES.map((c) => (
                  <span key={c}>
                    {labels[c]}: {result.counts[c]}
                  </span>
                ))}
              </div>
              {result.findings.length > 0 && (
                <div className="max-h-80 overflow-auto rounded-xl border border-border">
                  <table className="w-full border-separate border-spacing-0 text-start text-xs">
                    <thead className="bg-surface-secondary">
                      <tr>
                        {[
                          m[
                            "tools.unicodeInvisibleCharacterChecker.utilityposition"
                          ](),
                          m[
                            "tools.unicodeInvisibleCharacterChecker.utilitycode"
                          ](),
                          m[
                            "tools.unicodeInvisibleCharacterChecker.utilityname"
                          ](),
                          m[
                            "tools.unicodeInvisibleCharacterChecker.utilitycategories"
                          ](),
                        ].map((h) => (
                          <th
                            key={h}
                            className="border-b border-separator px-2 py-2.5 text-start"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.findings.map((f) => (
                        <tr key={f.index}>
                          <td className="border-t border-separator px-2 py-2.5">
                            #{f.index} · {f.line}:{f.column}
                          </td>
                          <td className="border-t border-separator px-2 py-2.5 font-mono">
                            {f.code}
                          </td>
                          <td className="border-t border-separator px-2 py-2.5">
                            {f.name}
                          </td>
                          <td className="border-t border-separator px-2 py-2.5">
                            {labels[f.category as InvisibleCategory]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.findingsTruncated && (
                <p className="text-sm text-muted-foreground">
                  {m[
                    "tools.unicodeInvisibleCharacterChecker.utilitypreviewnote"
                  ]()}
                </p>
              )}
            </>
          )}
          {links.map((link) => (
            <div key={link.url}>
              <span>{link.name}</span>
              <TextArea
                aria-label={link.name}
                readOnly
                value={clipText(link.text, 16000)}
                className="field-sizing-fixed h-40 max-h-80 font-mono"
              />
              {link.text.length > 16000 && (
                <p>
                  {m[
                    "tools.unicodeInvisibleCharacterChecker.utilitypreviewnote"
                  ]()}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void copy(link.text)}>
                  {m["tools.unicodeInvisibleCharacterChecker.utilitycopy"]()}
                </Button>
                <a
                  href={link.url}
                  download={link.name}
                  className={
                    "inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium"
                  }
                >
                  {m[
                    "tools.unicodeInvisibleCharacterChecker.utilitydownload"
                  ]()}
                </a>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function UnicodeInvisibleCharacterCheckerPageContent() {
  return <TextUtilityTool kind="invisible" />;
}

export default function UnicodeInvisibleCharacterCheckerPage() {
  return (
    <ToolPage>
      <UnicodeInvisibleCharacterCheckerPageContent />
    </ToolPage>
  );
}
