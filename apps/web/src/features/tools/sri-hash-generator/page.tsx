import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Skeleton, TextArea } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { formatFileSize } from "@/lib/file-size";
import { safeLocalStorage } from "@/lib/safe-storage";
import { getLocale } from "@/paraglide/runtime.js";
import { generateSri, integrityText } from "@workspace/tools/hash/integrity";

type Digest = Awaited<ReturnType<typeof generateSri>>;
type State =
  | { status: "idle" | "loading" | "error" }
  | { status: "ready"; digest: Digest };

const DEFAULT_TEXT = "Hello ToolTab";
const STORAGE_KEY = "tools:sri-hash-generator:text";

function SriHashGeneratorToolContent() {
  const locale = getLocale();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const deferredText = useDeferredValue(text);
  const revision = useRef(0);

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);
  useEffect(() => {
    const current = ++revision.current;
    const controller = new AbortController();
    void (async () => {
      try {
        const source =
          file ?? (deferredText ? integrityText(deferredText) : null);
        if (!source) {
          if (revision.current === current) setState({ status: "idle" });
          return;
        }
        setState({ status: "loading" });
        const digest = await generateSri(source, controller.signal);
        if (revision.current === current) setState({ status: "ready", digest });
      } catch {
        if (!controller.signal.aborted && revision.current === current)
          setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [deferredText, file]);

  return (
    <div className="grid gap-8">
      <div className="grid items-stretch gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32inputlabel"]()}</Card.Title>
            <Card.Description>
              {file
                ? `${file.name} · ${formatFileSize(file.size, locale)}`
                : m["tools.sriHashGenerator.plainTextDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {file ? (
              <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
                <div>
                  <p className="font-medium break-all">{file.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatFileSize(file.size, locale)}
                  </p>
                </div>
              </div>
            ) : (
              <TextArea
                aria-label={m["common.adler32plaintextlabel"]()}
                value={text}
                spellCheck={false}
                className="min-h-64 flex-1 resize-y font-mono text-sm"
                onChange={(event) => setText(event.currentTarget.value)}
              />
            )}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="block">
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              fileName={file?.name}
              clearLabel={m["common.adler32plaintextlabel"]()}
              onSelect={setFile}
              onClear={file ? () => setFile(null) : undefined}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["common.adler32hashresultlabel"]()}</Card.Title>
            <Card.Description>
              {m["tools.sriHashGenerator.hashResultDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent
            className="gap-4 py-4"
            aria-busy={state.status === "loading"}
          >
            {state.status === "loading" ? (
              <OutputSkeleton label={m["common.adler32hashresultlabel"]()} />
            ) : state.status === "error" ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {m["tools.sriHashGenerator.errorDescription"]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : state.status === "ready" ? (
              <DigestList digest={state.digest} />
            ) : (
              <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
                {m["tools.sriHashGenerator.emptyDescription"]()}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <SriArticle />
    </div>
  );
}

function DigestList({ digest }: { digest: Digest }) {
  return (
    <div className="grid gap-3">
      {[
        [m["tools.sriHashGenerator.sha256SriLabel"](), digest.sha256],
        [m["tools.sriHashGenerator.sha384SriLabel"](), digest.sha384],
        [m["tools.sriHashGenerator.sha512SriLabel"](), digest.sha512],
      ].map(([label, value]) => (
        <div
          key={label}
          className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-default/20 p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 font-mono text-sm break-all">{value}</p>
          </div>
          <ToolCopyButton
            value={value}
            copyLabel={m["common.adler32copyresultlabel"]()}
            copiedLabel={m["common.actions.copied"]()}
          />
        </div>
      ))}
    </div>
  );
}

function OutputSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

function SriArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.sriHashGenerator.articleTitle"]()}</h2>
      <p>{m["tools.sriHashGenerator.articleSummary"]()}</p>
      <h3>{m["shared.asciiArt.article.howTitle"]()}</h3>
      <ol>
        {[
          m["tools.sriHashGenerator.articleHowItems0"](),
          m["tools.sriHashGenerator.articleHowItems1"](),
          m["tools.sriHashGenerator.articleHowItems2"](),
          m["tools.sriHashGenerator.articleHowItems3"](),
          m["tools.sriHashGenerator.articleHowItems4"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <h3>{m["tools.sriHashGenerator.articleBenefitsTitle"]()}</h3>
      <ul>
        {[
          m["tools.sriHashGenerator.articleBenefits0"](),
          m["tools.sriHashGenerator.articleBenefits1"](),
          m["tools.sriHashGenerator.articleBenefits2"](),
          m["tools.sriHashGenerator.articleBenefits3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>{m["tools.sriHashGenerator.articleAlgorithmsTitle"]()}</h3>
      <ul>
        {[
          m["tools.sriHashGenerator.articleAlgorithms0"](),
          m["tools.sriHashGenerator.articleAlgorithms1"](),
          m["tools.sriHashGenerator.articleAlgorithms2"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

export default function SriHashGeneratorTool() {
  return (
    <ToolPage instructions={m["tools.sriHashGenerator.usage"]()}>
      <SriHashGeneratorToolContent />
    </ToolPage>
  );
}
