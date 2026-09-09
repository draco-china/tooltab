import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import { RefreshCcw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import {
  AddressError,
  buildUrl,
  parseUrl,
  SAMPLE_URL,
  type UrlDraft,
} from "@workspace/tools/network/address";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";

type QueryRow = UrlDraft["queryEntries"][number] & { id: string };
type EditorDraft = Omit<UrlDraft, "queryEntries"> & {
  queryEntries: QueryRow[];
};
const STORAGE_KEY = "tools:url-parser-builder:url";

function UrlParserBuilderContent() {
  const sequence = useRef(0);
  const initial = parseUrl(SAMPLE_URL);
  const [input, setInput] = useState(SAMPLE_URL);
  const [draft, setDraft] = useState<EditorDraft>(() =>
    attachRows(initial.draft, sequence),
  );
  const [source, setSource] = useState<"url" | "draft">("url");
  const [parseError, setParseError] = useState(false);

  useEffect(() => {
    safeLocalStorage.removeItem(STORAGE_KEY);
  }, []);

  const result = safeBuild(source, input, draft);
  const draftResult = safeBuild("draft", input, draft);
  const displayedInput =
    source === "url" ? input : (result.value?.url ?? input);

  function update(next: Partial<EditorDraft>) {
    setSource("draft");
    setParseError(false);
    setDraft((current) => ({ ...current, ...next }));
  }

  function load(value: string) {
    setInput(value);
    setSource("url");
    try {
      setDraft(attachRows(parseUrl(value).draft, sequence));
      setParseError(false);
    } catch {
      setParseError(true);
    }
  }

  function reset() {
    const next = parseUrl(SAMPLE_URL);
    setInput(SAMPLE_URL);
    setDraft(attachRows(next.draft, sequence));
    setSource("url");
    setParseError(false);
  }

  return (
    <div className="grid gap-6" data-tool-panels>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Card.Title>
                    {m["tools.urlParserBuilder.inputTitle"]()}
                  </Card.Title>
                  <Chip
                    size="sm"
                    variant="secondary"
                    className={
                      parseError ? "bg-danger/15 text-danger" : undefined
                    }
                  >
                    {parseError
                      ? m["tools.urlParserBuilder.invalidBadge"]()
                      : m["tools.urlParserBuilder.validBadge"]()}
                  </Chip>
                </div>
                <Card.Description>
                  {m["tools.urlParserBuilder.inputDescription"]()}
                </Card.Description>
              </div>
              <ToolPanelActionGroup>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => load(SAMPLE_URL)}
                >
                  <Sparkles aria-hidden className="size-4" />
                  {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
                </Button>
                <Button size="sm" variant="ghost" onPress={reset}>
                  <RefreshCcw aria-hidden className="size-4" />
                  {m["tools.urlParserBuilder.resetLabel"]()}
                </Button>
              </ToolPanelActionGroup>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextField className="grid gap-2" isInvalid={parseError}>
              <Label>{m["shared.addressTools.fullUrl"]()}</Label>
              <TextArea
                aria-label={m["shared.addressTools.fullUrl"]()}
                value={displayedInput}
                rows={4}
                spellCheck={false}
                placeholder={m["tools.urlParserBuilder.urlPlaceholder"]()}
                className="min-h-28 resize-y font-mono text-sm"
                onChange={(event) => load(event.currentTarget.value)}
              />
            </TextField>
            {parseError ? (
              <ErrorFeedback
                title={m["tools.urlParserBuilder.parseErrorTitle"]()}
                description={m[
                  "tools.urlParserBuilder.parseErrorDescription"
                ]()}
              />
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Card.Title>
                  {m["tools.urlParserBuilder.previewTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.urlParserBuilder.previewDescription"]()}
                </Card.Description>
              </div>
              <ToolCopyButton
                value={result.value?.url ?? ""}
                copyLabel={m["tools.urlParserBuilder.copyUrlLabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={!result.value}
              />
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextField className="grid gap-2">
              <Label>{m["tools.urlParserBuilder.finalUrlLabel"]()}</Label>
              <TextArea
                aria-label={m["tools.urlParserBuilder.finalUrlLabel"]()}
                readOnly
                rows={4}
                value={result.value?.url ?? ""}
                className="min-h-28 resize-y font-mono text-sm"
              />
            </TextField>
            {source === "draft" && result.error ? (
              <ErrorFeedback
                title={m["tools.urlParserBuilder.buildErrorTitle"]()}
                description={buildError(result.error, draft)}
              />
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <Metrics result={result.value ?? draftResult.value} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.urlParserBuilder.authorityTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.urlParserBuilder.authorityDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="grid gap-4 py-4 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label={m["shared.addressTools.protocol"]()}
              value={draft.protocol}
              placeholder={m["tools.urlParserBuilder.protocolPlaceholder"]()}
              onChange={(protocol) => update({ protocol })}
            />
            <Field
              label={m["common.httptUsername"]()}
              value={draft.username}
              placeholder={m["tools.urlParserBuilder.usernamePlaceholder"]()}
              onChange={(username) => update({ username })}
            />
            <PasswordField
              value={draft.password}
              onChange={(password) => update({ password })}
            />
            <div className="md:col-span-2 xl:col-span-2">
              <Field
                label={m["shared.addressTools.hostname"]()}
                value={draft.hostname}
                placeholder={m["tools.urlParserBuilder.hostnamePlaceholder"]()}
                onChange={(hostname) => update({ hostname })}
              />
            </div>
            <Field
              label={m["shared.addressTools.port"]()}
              value={draft.port}
              placeholder={m["tools.urlParserBuilder.portPlaceholder"]()}
              inputMode="numeric"
              onChange={(port) => update({ port })}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.urlParserBuilder.locationTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.urlParserBuilder.locationDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <Field
              label={m["tools.jsonSchemaValidator.errorPathLabel"]()}
              value={draft.pathname}
              placeholder={m["tools.urlParserBuilder.pathPlaceholder"]()}
              onChange={(pathname) => update({ pathname })}
            />
            <Field
              label={m["shared.addressTools.fragment"]()}
              value={draft.fragment}
              placeholder={m["tools.urlParserBuilder.fragmentPlaceholder"]()}
              onChange={(fragment) => update({ fragment })}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Card.Title>
                {m["tools.urlParserBuilder.queryTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.urlParserBuilder.queryDescription"]()}
              </Card.Description>
            </div>
            <Button
              size="sm"
              variant="outline"
              isDisabled={draft.queryEntries.length >= 1000}
              onPress={() =>
                update({
                  queryEntries: [
                    ...draft.queryEntries,
                    { id: `query-${++sequence.current}`, key: "", value: "" },
                  ],
                })
              }
            >
              {m["shared.addressTools.add"]()}
            </Button>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-3 py-4">
          {!draft.queryEntries.length ? (
            <div className="rounded-xl border border-dashed border-separator bg-default/20 p-4">
              <p className="font-medium">
                {m["tools.urlParserBuilder.queryEmptyTitle"]()}
              </p>
              <p className="mt-1 text-sm text-muted">
                {m["tools.urlParserBuilder.queryEmptyDescription"]()}
              </p>
            </div>
          ) : null}
          {draft.queryEntries.map((row, index) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-xl border border-separator p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <Field
                label={`${m["tools.urlParserBuilder.paramKeyLabel"]()} ${index + 1}`}
                value={row.key}
                placeholder={m["tools.urlParserBuilder.paramKeyPlaceholder"]()}
                onChange={(key) =>
                  update({
                    queryEntries: draft.queryEntries.map((item) =>
                      item.id === row.id ? { ...item, key } : item,
                    ),
                  })
                }
              />
              <Field
                label={`${m["tools.cronExpressionParser.breakdownValue"]()} ${index + 1}`}
                value={row.value}
                placeholder={m[
                  "tools.urlParserBuilder.paramValuePlaceholder"
                ]()}
                onChange={(value) =>
                  update({
                    queryEntries: draft.queryEntries.map((item) =>
                      item.id === row.id ? { ...item, value } : item,
                    ),
                  })
                }
              />
              <div className="flex items-end justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={m["shared.addressTools.remove"]()}
                  onPress={() =>
                    update({
                      queryEntries: draft.queryEntries.filter(
                        (item) => item.id !== row.id,
                      ),
                    })
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.markdownPreviewer.article.purposeTitle"]()}</h2>
        <p>{m["tools.urlParserBuilder.articleWhatBody"]()}</p>
        <h2>{m["tools.urlParserBuilder.articleWhenTitle"]()}</h2>
        <p>{m["tools.urlParserBuilder.articleWhenBody"]()}</p>
        <h2>{m["tools.urlParserBuilder.articleNotesTitle"]()}</h2>
        <p>{m["tools.urlParserBuilder.articleNotesBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export function UrlParserBuilder() {
  return (
    <ToolPage instructions={m["tools.urlParserBuilder.usage"]()}>
      <UrlParserBuilderContent />
    </ToolPage>
  );
}

function attachRows(
  draft: UrlDraft,
  sequence: { current: number },
): EditorDraft {
  return {
    ...draft,
    queryEntries: draft.queryEntries.map((row) => ({
      ...row,
      id: `query-${++sequence.current}`,
    })),
  };
}

function safeBuild(source: "url" | "draft", input: string, draft: EditorDraft) {
  try {
    return {
      value: source === "url" ? parseUrl(input) : buildUrl(draft),
      error: null as AddressError | null,
    };
  } catch (error) {
    return {
      value: null,
      error:
        error instanceof AddressError ? error : new AddressError("invalid_url"),
    };
  }
}

function buildError(error: AddressError, draft: EditorDraft) {
  if (!draft.protocol.trim())
    return m["tools.urlParserBuilder.missingProtocolDescription"]();
  if (
    !draft.opaque &&
    draft.protocol.trim().replace(/:$/, "") !== "file" &&
    !draft.hostname.trim()
  )
    return m["tools.urlParserBuilder.missingHostnameDescription"]();
  if (error.code === "invalid_port")
    return m["tools.urlParserBuilder.invalidPortDescription"]();
  return m["tools.urlParserBuilder.invalidBuildDescription"]();
}

function ErrorFeedback({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Alert status="danger" role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function Field({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: "numeric";
  onChange: (value: string) => void;
}) {
  return (
    <TextField className="grid gap-2">
      <Label>{label}</Label>
      <Input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </TextField>
  );
}

function PasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField className="grid gap-2">
      <Label>{m["common.httptPassword"]()}</Label>
      <ToolPasswordInput
        aria-label={m["common.httptPassword"]()}
        value={value}
        placeholder={m["tools.urlParserBuilder.passwordPlaceholder"]()}
        showLabel={m["common.httptShow"]()}
        hideLabel={m["common.httptHide"]()}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </TextField>
  );
}

function Metrics({ result }: { result: ReturnType<typeof parseUrl> | null }) {
  const items = [
    { label: m["shared.addressTools.origin"](), value: result?.origin ?? "—" },
    { label: m["shared.addressTools.host"](), value: result?.host ?? "—" },
    {
      label: m["tools.urlParserBuilder.segmentsLabel"](),
      value: String(result?.pathSegments ?? 0),
    },
    {
      label: m["tools.urlParserBuilder.paramsLabel"](),
      value: String(result?.queryCount ?? 0),
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-separator bg-default/20 px-4 py-3"
        >
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {item.label}
          </p>
          <p className="mt-2 font-mono text-sm break-all">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
