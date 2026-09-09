import { m } from "@/paraglide/messages.js";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Skeleton,
  Table,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";

import { safeLocalStorage } from "@/lib/safe-storage";
import {
  HttpTextError,
  parseCookieHeaders,
} from "@workspace/tools/network/cookie";

type HeaderType = "cookie" | "set-cookie";
type ParsedCookies = ReturnType<typeof parseCookieHeaders>;

const STORAGE_KEYS = {
  type: "tools:cookie-parser:type",
  input: "tools:cookie-parser:input",
} as const;

const EXAMPLES: Record<HeaderType, string> = {
  cookie: "Cookie: session=abc123; theme=light; logged_in=true",
  "set-cookie":
    "Set-Cookie: session=abc123; Path=/; HttpOnly; SameSite=Lax\nSet-Cookie: theme=dark; Max-Age=86400; Secure",
};

const renderKeys = new WeakMap<object, string>();
let nextRenderKey = 0;
function renderKey(value: object) {
  const existing = renderKeys.get(value);
  if (existing) return existing;
  nextRenderKey += 1;
  const key = String(nextRenderKey);
  renderKeys.set(value, key);
  return key;
}

type ParseState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; result: ParsedCookies; json: string }
  | { status: "error"; message: string };

function parse(input: string, type: HeaderType): ParseState {
  if (!input.trim()) return { status: "empty" };
  try {
    const result = parseCookieHeaders(input, type);
    return { status: "ready", result, json: JSON.stringify(result, null, 2) };
  } catch (cause) {
    return {
      status: "error",
      message:
        cause instanceof HttpTextError && cause.code === "too_large"
          ? m["shared.httpText.cookieParserTooLargeError"]()
          : m["shared.httpText.cookieParserParseError"](),
    };
  }
}

function invalidReason(reason: string) {
  if (reason === "wrong_header_type")
    return m["tools.cookieParser.wrongHeaderReason"]();
  if (reason === "invalid_cookie_pair")
    return m["tools.cookieParser.invalidPairReason"]();
  if (reason === "invalid_attribute")
    return m["tools.cookieParser.invalidAttributeReason"]();
  return reason;
}

function ResultSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="space-y-3 py-1"
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

function CookieTable({ result }: { result: ParsedCookies }) {
  if (!result.cookies.length) return null;
  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label={m["shared.httpText.cookieParserCookieCountLabel"]()}
        >
          <Table.Header>
            <Table.Column id="name" isRowHeader>
              {m["common.uaFieldName"]()}
            </Table.Column>
            <Table.Column id="value">
              {m["tools.cronExpressionParser.breakdownValue"]()}
            </Table.Column>
            <Table.Column id="attributes">
              {m["tools.cookieParser.attributesColumn"]()}
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {result.cookies.map((cookie) => (
              <Table.Row key={renderKey(cookie)} id={renderKey(cookie)}>
                <Table.Cell className="align-top font-mono text-xs">
                  {cookie.name}
                </Table.Cell>
                <Table.Cell className="align-top font-mono text-xs break-all">
                  {cookie.value}
                </Table.Cell>
                <Table.Cell className="align-top font-mono text-xs">
                  {cookie.attributes.length
                    ? cookie.attributes
                        .map((attribute) =>
                          attribute.value === null
                            ? attribute.name
                            : `${attribute.name}=${attribute.value}`,
                        )
                        .join("; ")
                    : "—"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

function CookieParserPageContent() {
  const inputId = useId();
  const [type, setType] = useState<HeaderType>("cookie");
  const [input, setInput] = useState(EXAMPLES.cookie);
  const [state, setState] = useState<ParseState>(() =>
    parse(EXAMPLES.cookie, "cookie"),
  );
  const [hydrated, setHydrated] = useState(false);
  const downloadUrl = useRef<string | null>(null);

  useEffect(() => {
    const storedType = safeLocalStorage.getItem(STORAGE_KEYS.type);
    const nextType: HeaderType =
      storedType === "set-cookie" ? "set-cookie" : "cookie";
    safeLocalStorage.removeItem(STORAGE_KEYS.input);
    setType(nextType);
    setInput(EXAMPLES[nextType]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    safeLocalStorage.setItem(STORAGE_KEYS.type, type);
  }, [hydrated, type]);

  useEffect(() => {
    if (!input.trim()) {
      setState({ status: "empty" });
      return;
    }
    setState({ status: "loading" });
    const timeout = window.setTimeout(() => {
      setState(parse(input, type));
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [input, type]);

  useEffect(
    () => () => {
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );

  function invalidateDownload() {
    if (!downloadUrl.current) return;
    URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = null;
  }

  function updateType(nextType: HeaderType) {
    invalidateDownload();
    setType(nextType);
    setInput((current) =>
      !current || current === EXAMPLES[type] ? EXAMPLES[nextType] : current,
    );
  }

  const ready = state.status === "ready" ? state : null;

  return (
    <div className="grid gap-6">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["shared.httpText.cookieParserHeaderTypeLabel"]()}
          </Card.Title>
          <Card.Description>
            {m["tools.cookieParser.headerTypeDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <ToggleButtonGroup
            selectionMode="single"
            aria-label={m["shared.httpText.cookieParserHeaderTypeLabel"]()}
            className="grid w-full grid-cols-2 [&_button]:min-h-11"
            selectedKeys={new Set([type])}
            onSelectionChange={(selection) => {
              const nextType = [...selection][0];
              if (nextType === "cookie" || nextType === "set-cookie") {
                updateType(nextType);
              }
            }}
          >
            <ToggleButton id="cookie">{m["common.httptCookie"]()}</ToggleButton>
            <ToggleButton id="set-cookie">
              {m["common.httptSetCookie"]()}
            </ToggleButton>
          </ToggleButtonGroup>
        </ToolPanelCardContent>
      </ToolPanelCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>{m["tools.userAgentParser.devInput"]()}</Card.Title>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                isDisabled={!input}
                onPress={() => {
                  invalidateDownload();
                  setInput("");
                }}
              >
                {m["common.curlClear"]()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => {
                  invalidateDownload();
                  setInput(EXAMPLES[type]);
                }}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.httptSample"]()}
              </Button>
            </div>
            <Card.Description className="sm:col-span-2">
              {m["shared.httpText.cookieParserInputPlaceholder"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              id={inputId}
              aria-label={m["tools.userAgentParser.devInput"]()}
              dir="ltr"
              rows={10}
              autoComplete="off"
              spellCheck={false}
              className="min-h-72 resize-y font-mono text-sm"
              value={input}
              placeholder={m["shared.httpText.cookieParserInputPlaceholder"]()}
              aria-invalid={state.status === "error"}
              onChange={(event) => {
                invalidateDownload();
                setInput(event.target.value);
              }}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.httpText.cookieParserParsedJsonLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.cookieParser.parsedResultDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {state.status === "loading" ? (
              <ResultSkeleton
                label={m["shared.httpText.cookieParserParsedJsonLabel"]()}
              />
            ) : state.status === "empty" ? (
              <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted">
                {m["tools.cookieParser.emptyOutputDescription"]()}
              </div>
            ) : state.status === "error" ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>{state.message}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-default px-2.5 py-1">
                    {m["shared.httpText.cookieParserCookieCountLabel"]()}:{" "}
                    {state.result.cookies.length}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 ${
                      state.result.invalid.length
                        ? "bg-danger/10 text-danger"
                        : "border border-border"
                    }`}
                  >
                    {m["shared.httpText.cookieParserInvalidCountLabel"]()}:{" "}
                    {state.result.invalid.length}
                  </span>
                </div>

                {!state.result.cookies.length ? (
                  <Alert status="danger" role="alert">
                    <Alert.Indicator>
                      <TriangleAlert aria-hidden className="size-4" />
                    </Alert.Indicator>
                    <Alert.Content>
                      <Alert.Title>
                        {m["shared.httpText.cookieParserNoCookiesTitle"]()}
                      </Alert.Title>
                    </Alert.Content>
                  </Alert>
                ) : null}

                <CookieTable result={state.result} />

                <CodeBlock
                  code={state.json}
                  language="json"
                  title={m["shared.httpText.cookieParserParsedJsonLabel"]()}
                  copyLabel={m["common.actions.copyResult"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  maxHeightClassName="max-h-80"
                  actions={
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      isDisabled={!ready}
                      onPress={() => {
                        if (!ready) return;
                        invalidateDownload();
                        const url = URL.createObjectURL(
                          new Blob([ready.json], { type: "application/json" }),
                        );
                        downloadUrl.current = url;
                        const anchor = document.createElement("a");
                        anchor.href = url;
                        anchor.download =
                          type === "cookie"
                            ? "cookies.json"
                            : "set-cookie.json";
                        anchor.click();
                      }}
                    >
                      <Download aria-hidden className="size-4" />
                      {m["common.httptDownload"]()}
                    </Button>
                  }
                />

                {state.result.invalid.length ? (
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">
                      {m["shared.httpText.cookieParserInvalidFragmentsLabel"]()}
                    </h3>
                    <ul className="space-y-2">
                      {state.result.invalid.map((entry) => (
                        <li
                          key={renderKey(entry)}
                          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 font-mono text-xs"
                        >
                          <span className="break-all">{entry.fragment}</span>
                          <span className="ms-2 text-danger">
                            {invalidReason(entry.reason)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["shared.httpText.cookieParserArticleWhatTitle"]()}</h2>
        <p>{m["shared.httpText.cookieParserArticleWhatBody"]()}</p>
        <h2>{m["shared.httpText.cookieParserArticleDifferenceTitle"]()}</h2>
        <p>{m["shared.httpText.cookieParserArticleDifferenceBody"]()}</p>
        <h2>{m["shared.httpText.cookieParserArticleTipsTitle"]()}</h2>
        <ul>
          {[
            m["tools.cookieParser.articleTips0"](),
            m["shared.httpText.cookieParserArticleTipTwo"](),
            m["shared.httpText.cookieParserArticleTipThree"](),
          ].map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function CookieParserPage() {
  return (
    <ToolPage instructions={m["tools.cookieParser.usage"]()}>
      <CookieParserPageContent />
    </ToolPage>
  );
}
