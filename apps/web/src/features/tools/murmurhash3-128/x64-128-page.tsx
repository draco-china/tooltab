import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Input,
  Label,
  Skeleton,
  Spinner,
  TextArea,
} from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { parseMurmurSeed } from "@workspace/tools/hash/murmur";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import type { HashResult } from "./streaming-logic";
import { textBytes } from "@workspace/tools/hash/input";
import { blobChunks } from "@workspace/tools/hash/browser";
import { runStreamHash } from "./worker-client";

const DEFAULT_TEXT = "I will not buy this record, it is scratched.";
const DEBOUNCE_MS = 250;

type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: HashResult }
  | { status: "error"; message: string };

async function* zeroingFileChunks(file: File, signal: AbortSignal) {
  for await (const chunk of blobChunks(file, signal)) {
    try {
      yield chunk;
    } finally {
      chunk.fill(0);
    }
  }
}

async function* zeroingTextChunks(text: string, signal: AbortSignal) {
  const chunk = textBytes(text);
  try {
    signal.throwIfAborted();
    yield chunk;
  } finally {
    chunk.fill(0);
  }
}

function formatFileSize(size: number, locale: string) {
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${format(size / 1024)} KB`;
  return `${format(size / (1024 * 1024))} MB`;
}

function MurmurHash3X64128Content() {
  const locale = getLocale();
  const fileError = m["tools.highwayhashHashTextOrFile.fileHashErrorLabel"]();
  const seedInvalid = m["tools.murmurhash3X64128HashTextOrFile.seedInvalid"]();
  const textError = m["tools.highwayhashHashTextOrFile.textHashErrorLabel"]();
  const textId = useId();
  const seedId = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [seedInput, setSeedInput] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DigestState>({ status: "loading" });

  let seed: bigint | null;
  try {
    seed = BigInt(parseMurmurSeed(seedInput));
  } catch {
    seed = null;
  }

  useEffect(() => {
    const controller = new AbortController();
    if (!file && !text.length) {
      setState({ status: "idle" });
      return () => controller.abort();
    }
    if (seed === null) {
      setState({ status: "error", message: seedInvalid });
      return () => controller.abort();
    }

    setState({ status: "loading" });
    const timer = window.setTimeout(() => {
      const source = file
        ? zeroingFileChunks(file, controller.signal)
        : zeroingTextChunks(text, controller.signal);
      void runStreamHash(
        "Murmur3-x64-128",
        source,
        controller.signal,
        undefined,
        seed,
      )
        .then((digest) => {
          if (!controller.signal.aborted) setState({ status: "ready", digest });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setState({
              status: "error",
              message: file ? fileError : textError,
            });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fileError, seedInvalid, textError, file, seed, text]);

  const sourceDescription = file
    ? `${file.name} • ${formatFileSize(file.size, locale)}`
    : m["common.adler32plaintextdescription"]();

  return (
    <>
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {file ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
                <p className="text-sm font-medium break-all">{file.name}</p>
                <p className="text-sm text-muted">
                  {formatFileSize(file.size, locale)}
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor={textId}>
                  {m["common.adler32plaintextlabel"]()}
                </Label>
                <TextArea
                  id={textId}
                  aria-label={m["common.adler32plaintextlabel"]()}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                  spellCheck={false}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
            )}
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              fileName={file ? sourceDescription : undefined}
              clearLabel={m["common.adler32plaintextlabel"]()}
              onSelect={setFile}
              onClear={file ? () => setFile(null) : undefined}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.murmurSeed"]()}</Card.Title>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <div className="grid gap-2">
              <Label htmlFor={seedId}>
                {m["tools.murmurhash3X64128HashTextOrFile.seedLabel"]()}
              </Label>
              <Input
                id={seedId}
                aria-label={m[
                  "tools.murmurhash3X64128HashTextOrFile.seedLabel"
                ]()}
                aria-invalid={seed === null}
                className="min-h-11 font-mono"
                placeholder={m[
                  "tools.murmurhash3X64128HashTextOrFile.seedPlaceholder"
                ]()}
                spellCheck={false}
                value={seedInput}
                onChange={(event) => setSeedInput(event.target.value)}
              />
              {seed === null ? (
                <p className="text-sm text-danger" role="alert">
                  {seedInvalid}
                </p>
              ) : null}
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>{m["common.adler32hashresultlabel"]()}</Card.Title>
              <Card.Description>
                {file
                  ? sourceDescription
                  : m["common.adler32hashresultdescription"]()}
              </Card.Description>
            </div>
            {state.status === "loading" ? <Spinner size="sm" /> : null}
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <DigestSection state={state} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.murmurhash3X64128HashTextOrFile.article.title"]()}</h2>
        <p>{m["tools.murmurhash3X64128HashTextOrFile.article.summary"]()}</p>
        <p>
          <strong>
            {m["tools.murmurhash3X64128HashTextOrFile.article.usesTitle"]()}
          </strong>
        </p>
        <ul>
          {[
            [
              m["tools.murmurhash3X64128HashTextOrFile.article.uses00"](),
              m["tools.murmurhash3X64128HashTextOrFile.article.uses01"](),
            ],
            [
              m["tools.murmurhash3X64128HashTextOrFile.article.uses10"](),
              m["tools.murmurhash3X64128HashTextOrFile.article.uses11"](),
            ],
            [
              m["tools.murmurhash3X64128HashTextOrFile.article.uses20"](),
              m["tools.murmurhash3X64128HashTextOrFile.article.uses21"](),
            ],
            [
              m["tools.murmurhash3X64128HashTextOrFile.article.uses30"](),
              m["tools.murmurhash3X64128HashTextOrFile.article.uses31"](),
            ],
          ].map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>
              {m[
                "tools.murmurhash3X64128HashTextOrFile.article.itemSeparator"
              ]()}
              {body}
            </li>
          ))}
        </ul>
        <p>
          <strong>
            {m["tools.murmurhash3X64128HashTextOrFile.article.seedTitle"]()}
          </strong>
        </p>
        <p>
          {m["tools.murmurhash3X64128HashTextOrFile.article.seedBody0"]()}
          <code>0</code>
          {m["tools.murmurhash3X64128HashTextOrFile.article.seedBody1"]()}
          <code>0x</code>
          {m["tools.murmurhash3X64128HashTextOrFile.article.seedBody2"]()}
        </p>
        <p>
          <strong>
            {m["tools.murmurhash3X64128HashTextOrFile.article.safetyTitle"]()}
          </strong>
        </p>
        <p>{m["tools.murmurhash3X64128HashTextOrFile.article.safety"]()}</p>
      </ToolArticle>
    </>
  );
}

function DigestSection({
  state,
}: Readonly<{
  state: DigestState;
}>) {
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
        {m["common.adler32plaintextdescription"]()}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3">
      {(
        [
          ["hex", m["common.adler32hexlabel"]()],
          ["base64", m["common.adler32base64label"]()],
          ["decimal", m["common.adler32decimallabel"]()],
          ["binary", m["common.adler32binarylabel"]()],
        ] as const
      ).map(([format, label]) => {
        const value = state.status === "ready" ? state.digest[format] : "";
        return (
          <section
            key={format}
            className="grid gap-3 rounded-xl border border-separator bg-default/20 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{label}</h3>
              <ToolCopyButton
                value={value}
                copyLabel={m["common.adler32copyresultlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={state.status === "loading"}
              />
            </div>
            {state.status === "loading" ? (
              <Skeleton className="h-5 w-full rounded-lg" />
            ) : (
              <code className="block text-xs leading-6 break-all sm:text-sm">
                {value}
              </code>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function MurmurHash3X64128() {
  return (
    <ToolPage>
      <MurmurHash3X64128Content />
    </ToolPage>
  );
}
