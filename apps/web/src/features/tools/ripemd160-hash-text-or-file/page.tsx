import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Label,
  Skeleton,
  Spinner,
  TextArea,
} from "@heroui/react";
import { FileText, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { formatFileSize } from "@/lib/file-size";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { blobChunks, textBytes } from "./logic";
import type { HashResult } from "@workspace/tools/hash/ripemd160";
import { runRipemd160Hash } from "./worker-client";

const DEFAULT_TEXT = "Hello, browser-native world!";
const STORAGE_KEY = "tools:ripemd160-hash-text-or-file:text";
const DEBOUNCE_MS = 250;
type DigestState =
  | { status: "idle" | "loading" }
  | { status: "ready"; digest: HashResult }
  | { status: "error"; message: string };

function Ripemd160ToolContent() {
  const locale = getLocale();
  const textError = m["tools.ripemd128HashTextOrFile.textError"](
    {},
    { locale },
  );
  const fileError = m["tools.ripemd128HashTextOrFile.fileError"](
    {},
    { locale },
  );
  const inputId = useId();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DigestState>({ status: "loading" });

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (!file && !text) {
      setState({ status: "idle" });
      return () => controller.abort();
    }
    setState({ status: "loading" });
    const timer = window.setTimeout(
      () => {
        void hashSource(file, text, controller.signal)
          .then((digest) => {
            if (!controller.signal.aborted) {
              setState({ status: "ready", digest });
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setState({
                status: "error",
                message: file ? fileError : textError,
              });
            }
          });
      },
      file ? 0 : DEBOUNCE_MS,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fileError, textError, file, text]);

  const sourceDescription = file
    ? `${file.name} • ${formatFileSize(file.size, locale)}`
    : m["common.adler32plaintextdescription"]({}, { locale });

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["common.adler32inputlabel"]({}, { locale })}
            </Card.Title>
            <Card.Description>{sourceDescription}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {file ? (
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center">
                <FileText aria-hidden className="size-5 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium break-all">{file.name}</p>
                  <p className="text-sm text-muted">
                    {formatFileSize(file.size, locale)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex min-h-8 items-center justify-between gap-3">
                  <Label htmlFor={inputId}>
                    {m["common.adler32plaintextlabel"]({}, { locale })}
                  </Label>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={m["shared.asciiArt.clear"]({}, { locale })}
                    isDisabled={!text}
                    onPress={() => setText("")}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                </div>
                <TextArea
                  id={inputId}
                  aria-label={m["common.adler32plaintextlabel"]({}, { locale })}
                  spellCheck={false}
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                  className="min-h-64 flex-1 resize-y font-mono text-sm"
                />
              </div>
            )}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="block">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]({}, { locale })}
              fileName={file?.name}
              clearLabel={m["common.adler32plaintextlabel"]({}, { locale })}
              inputTestId="ripemd-file-input"
              onSelect={setFile}
              onClear={file ? () => setFile(null) : undefined}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1">
              <Card.Title>
                {m["common.adler32hashresultlabel"]({}, { locale })}
              </Card.Title>
              <Card.Description>
                {file
                  ? sourceDescription
                  : m["common.adler32hashresultdescription"]({}, { locale })}
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
        <h2>
          {m["tools.ripemd160HashTextOrFile.article.title"]({}, { locale })}
        </h2>
        <p>
          {m["tools.ripemd160HashTextOrFile.article.summary"]({}, { locale })}
        </p>
        <p>
          <strong>
            {m["shared.blakeHash.blake2bArticleCharacteristicsLabel"](
              {},
              { locale },
            )}
          </strong>
        </p>
        <ul>
          {[
            [
              m["shared.blakeHash.blake2bArticleCharacteristics2Title"](
                {},
                { locale },
              ),
              m["shared.blakeHash.blake2bArticleCharacteristics2Body"](
                {},
                { locale },
              ),
            ],
            [
              m["tools.md4HashTextOrFile.article.characteristics10"](
                {},
                { locale },
              ),
              m["tools.ripemd160HashTextOrFile.article.characteristics11"](
                {},
                { locale },
              ),
            ],
            [
              m["shared.blakeHash.blake2bArticleCharacteristics3Title"](
                {},
                { locale },
              ),
              m["shared.blakeHash.blake2bArticleCharacteristics3Body"](
                {},
                { locale },
              ),
            ],
            [
              m["tools.md4HashTextOrFile.article.characteristics30"](
                {},
                { locale },
              ),
              m["tools.ripemd160HashTextOrFile.article.characteristics31"](
                {},
                { locale },
              ),
            ],
            [
              m["tools.ripemd160HashTextOrFile.article.characteristics40"](
                {},
                { locale },
              ),
              m["tools.ripemd160HashTextOrFile.article.characteristics41"](
                {},
                { locale },
              ),
            ],
          ].map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong>: {body}
            </li>
          ))}
        </ul>
        <p>
          <strong>
            {m["tools.keccakHashTextOrFile.article.securityTitle"](
              {},
              { locale },
            )}
          </strong>
          <br />✅{" "}
          <strong>
            {m["tools.ripemd160HashTextOrFile.article.securityStrong"](
              {},
              { locale },
            )}
          </strong>
          {m["tools.ripemd160HashTextOrFile.article.security"]({}, { locale })}
        </p>
        <p>
          <strong>
            {m["common.adler32articlecommonuses"]({}, { locale })}
          </strong>
        </p>
        <ul>
          {[
            m["tools.ripemd160HashTextOrFile.article.uses0"]({}, { locale }),
            m["shared.blakeHash.blake2bArticleCommonUses1"]({}, { locale }),
            m["tools.ripemd160HashTextOrFile.article.uses2"]({}, { locale }),
            m["tools.ripemd160HashTextOrFile.article.uses3"]({}, { locale }),
            m["tools.ripemd160HashTextOrFile.article.uses4"]({}, { locale }),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          <strong>
            {m["tools.ripemd160HashTextOrFile.article.comparisonTitle"](
              {},
              { locale },
            )}
          </strong>
        </p>
        <ul>
          {[
            m["tools.ripemd160HashTextOrFile.article.comparison0"](
              {},
              { locale },
            ),
            m["tools.ripemd160HashTextOrFile.article.comparison1"](
              {},
              { locale },
            ),
            m["tools.ripemd160HashTextOrFile.article.comparison2"](
              {},
              { locale },
            ),
            m["tools.ripemd160HashTextOrFile.article.comparison3"](
              {},
              { locale },
            ),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          <strong>
            {m["tools.ripemd160HashTextOrFile.article.recommendedTitle"](
              {},
              { locale },
            )}
          </strong>
        </p>
        <ul>
          {[
            m["tools.ripemd160HashTextOrFile.article.recommended0"](
              {},
              { locale },
            ),
            m["tools.ripemd160HashTextOrFile.article.recommended1"](
              {},
              { locale },
            ),
            m["tools.ripemd160HashTextOrFile.article.recommended2"](
              {},
              { locale },
            ),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function Ripemd160Tool() {
  const locale = getLocale();
  return (
    <ToolPage
      instructions={m["tools.ripemd160HashTextOrFile.usage"]({}, { locale })}
    >
      <Ripemd160ToolContent />
    </ToolPage>
  );
}

async function hashSource(
  file: File | null,
  text: string,
  signal: AbortSignal,
) {
  if (file) return runRipemd160Hash(blobChunks(file, signal), signal);
  const bytes = textBytes(text);
  async function* source() {
    try {
      yield bytes;
    } finally {
      bytes.fill(0);
    }
  }
  return runRipemd160Hash(source(), signal);
}

function DigestSection({ state }: { state: DigestState }) {
  const locale = getLocale();
  if (state.status === "idle") {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-separator bg-default/20 p-6 text-center text-sm text-muted">
        {m["tools.ripemd160HashTextOrFile.emptyResultDescription"](
          {},
          { locale },
        )}
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
          ["hex", m["common.adler32hexlabel"]({}, { locale })],
          ["base64", m["common.adler32base64label"]({}, { locale })],
          ["decimal", m["common.adler32decimallabel"]({}, { locale })],
          ["binary", m["common.adler32binarylabel"]({}, { locale })],
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
                copyLabel={m["common.adler32copyresultlabel"]({}, { locale })}
                copiedLabel={m["common.actions.copied"]({}, { locale })}
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
