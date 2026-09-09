import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Card,
  Chip,
  Input,
  Label,
  ScrollShadow,
  TextField,
} from "@heroui/react";
import { Network, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { safeLocalStorage } from "@/lib/safe-storage";
import { CidrError, rangeToCidrs } from "@workspace/tools/network/cidr";

type Result =
  | { status: "empty" | "incomplete" | "invalid" | "mixed" | "reversed" }
  | ({ status: "success" } & ReturnType<typeof rangeToCidrs>);

const START_STORAGE_KEY = "tools:ip-range-to-cidr-converter:start";
const END_STORAGE_KEY = "tools:ip-range-to-cidr-converter:end";
const LEGACY_START_STORAGE_KEY = "tools:ip-range-to-cidr:start";
const LEGACY_END_STORAGE_KEY = "tools:ip-range-to-cidr:end";

function convert(start: string, end: string): Result {
  if (!start.trim() && !end.trim()) return { status: "empty" };
  if (!start.trim() || !end.trim()) return { status: "incomplete" };
  try {
    return { status: "success", ...rangeToCidrs(start, end) };
  } catch (error) {
    if (!(error instanceof CidrError)) return { status: "invalid" };
    if (error.code === "mixed_family") return { status: "mixed" };
    if (error.code === "reversed") return { status: "reversed" };
    return { status: "invalid" };
  }
}

function statusCopy(result: Result) {
  if (result.status === "empty")
    return {
      title: m["tools.ipRangeToCidrConverter.emptyTitle"](),
      description: m["tools.ipRangeToCidrConverter.emptyDescription"](),
    };
  if (result.status === "incomplete")
    return {
      title: m["tools.ipRangeToCidrConverter.incompleteTitle"](),
      description: m["tools.ipRangeToCidrConverter.incompleteDescription"](),
    };
  if (result.status === "invalid")
    return {
      title: m["common.cidrInvalidIp"](),
      description: m["tools.ipRangeToCidrConverter.invalidDescription"](),
    };
  if (result.status === "mixed")
    return {
      title: m["tools.ipRangeToCidrConverter.mixedFamilyTitle"](),
      description: m["tools.ipRangeToCidrConverter.mixedFamilyDescription"](),
    };
  if (result.status === "reversed")
    return {
      title: m["tools.ipRangeToCidrConverter.reversedRangeTitle"](),
      description: m["tools.ipRangeToCidrConverter.reversedRangeDescription"](),
    };
  return null;
}

function IpRangeToCidrPageContent() {
  const startId = useId();
  const endId = useId();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    const storedStart =
      safeLocalStorage.getItem(START_STORAGE_KEY) ??
      safeLocalStorage.getItem(LEGACY_START_STORAGE_KEY);
    const storedEnd =
      safeLocalStorage.getItem(END_STORAGE_KEY) ??
      safeLocalStorage.getItem(LEGACY_END_STORAGE_KEY);
    if (storedStart !== null) setStart(storedStart);
    if (storedEnd !== null) setEnd(storedEnd);
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(START_STORAGE_KEY, start);
  }, [start]);

  useEffect(() => {
    safeLocalStorage.setItem(END_STORAGE_KEY, end);
  }, [end]);

  const result = useMemo(() => convert(start, end), [start, end]);
  const currentStatus = statusCopy(result);
  const showAlert = ["invalid", "mixed", "reversed"].includes(result.status);

  return (
    <div className="grid min-w-0 gap-8" data-tool="ip-range-to-cidr-converter">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <PanelHeader
            title={m["tools.ipRangeToCidrConverter.inputTitle"]()}
            description={m["tools.ipRangeToCidrConverter.inputDescription"]()}
          />
          <ToolPanelCardContent className="gap-4 py-4">
            <TextField fullWidth className="gap-2">
              <Label htmlFor={startId}>
                {m["tools.ipRangeToCidrConverter.startLabel"]()}
              </Label>
              <Input
                id={startId}
                name="start-ip"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={start}
                aria-invalid={showAlert}
                placeholder={m[
                  "tools.ipRangeToCidrConverter.startPlaceholder"
                ]()}
                className="h-11 text-left font-mono text-base [unicode-bidi:isolate]"
                onChange={(event) => setStart(event.currentTarget.value)}
              />
            </TextField>
            <TextField fullWidth className="gap-2">
              <Label htmlFor={endId}>
                {m["tools.ipRangeToCidrConverter.endLabel"]()}
              </Label>
              <Input
                id={endId}
                name="end-ip"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={end}
                aria-invalid={showAlert}
                placeholder={m["tools.ipRangeToCidrConverter.endPlaceholder"]()}
                className="h-11 text-left font-mono text-base [unicode-bidi:isolate]"
                onChange={(event) => setEnd(event.currentTarget.value)}
              />
            </TextField>

            {showAlert && currentStatus ? (
              <div aria-live="polite">
                <Alert status="danger" role="alert">
                  <Alert.Indicator>
                    <TriangleAlert aria-hidden className="size-4" />
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>{currentStatus.title}</Alert.Title>
                    <Alert.Description>
                      {currentStatus.description}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="flex w-full min-w-0 items-start justify-between gap-3">
              <div className="grid min-w-0 gap-1">
                <Card.Title>
                  {m["tools.ipRangeToCidrConverter.resultTitle"]()}
                </Card.Title>
                <Card.Description>
                  {m["tools.ipRangeToCidrConverter.resultDescription"]()}
                </Card.Description>
              </div>
              <ToolCopyButton
                value={
                  result.status === "success" ? result.cidrs.join("\n") : ""
                }
                copyLabel={m["shared.cidrTools.cidrsMergerCopyLabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                disabled={result.status !== "success"}
                className="shrink-0"
              />
            </div>
          </Card.Header>
          <ToolPanelCardContent className="p-0">
            {result.status === "success" ? (
              <SuccessResult result={result} />
            ) : (
              <EmptyResult
                title={
                  currentStatus?.title ??
                  m["tools.ipRangeToCidrConverter.emptyTitle"]()
                }
                description={
                  currentStatus?.description ??
                  m["tools.ipRangeToCidrConverter.emptyDescription"]()
                }
              />
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <RangeArticle />
    </div>
  );
}

function SuccessResult({
  result,
}: {
  result: Extract<Result, { status: "success" }>;
}) {
  return (
    <>
      <div className="grid gap-4 border-b border-separator px-4 py-4 md:grid-cols-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {m["tools.ipRangeToCidrConverter.rangeLabel"]()}
          </p>
          <p
            dir="ltr"
            className="mt-2 text-left font-mono text-sm break-all [unicode-bidi:isolate]"
          >
            {result.start} → {result.end}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">{m["common.cidrDetailFamily"]()}</p>
          <Chip size="sm" variant="tertiary" className="mt-2">
            {result.family === 4
              ? m["shared.cidrTools.cidrParserIpv4Label"]()
              : m["shared.cidrTools.cidrParserIpv6Label"]()}
          </Chip>
        </div>
        <div>
          <p className="text-sm text-muted">
            {m["tools.ipRangeToCidrConverter.blockCountLabel"]()}
          </p>
          <p className="mt-2 text-sm font-medium">{result.blockCount}</p>
        </div>
      </div>
      <ScrollShadow
        orientation="vertical"
        className="h-128 w-full overflow-x-hidden"
      >
        <ol className="flex min-w-0 flex-col">
          {result.cidrs.map((cidr, index) => (
            <li
              key={cidr}
              className="flex min-w-0 items-start gap-4 border-b border-separator px-4 py-3 last:border-b-0"
            >
              <span className="w-8 shrink-0 text-sm text-muted">
                {index + 1}
              </span>
              <span
                dir="ltr"
                className="min-w-0 text-left font-mono text-sm break-all [unicode-bidi:isolate]"
              >
                {cidr}
              </span>
            </li>
          ))}
        </ol>
      </ScrollShadow>
    </>
  );
}

function EmptyResult({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="px-4 py-10">
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
        <div className="rounded-full bg-default p-3">
          <Network aria-hidden className="size-5" />
        </div>
        <div className="grid gap-1">
          <p className="font-medium">{title}</p>
          <p className="max-w-lg text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function RangeArticle() {
  return (
    <ToolArticle>
      <h2>{m["tools.ipRangeToCidrConverter.article.whatTitle"]()}</h2>
      <p>{m["tools.ipRangeToCidrConverter.article.what"]()}</p>
      <h2>{m["tools.ipRangeToCidrConverter.article.howTitle"]()}</h2>
      <p>{m["tools.ipRangeToCidrConverter.article.how"]()}</p>
      <h2>{m["tools.ipRangeToCidrConverter.article.whyTitle"]()}</h2>
      <p>
        {m["tools.ipRangeToCidrConverter.article.whyBodyBefore"]()}
        <code>{m["tools.ipRangeToCidrConverter.article.whyBodyRange"]()}</code>
        {m["tools.ipRangeToCidrConverter.article.whyBodyAfter"]()}
      </p>
      <h2>{m["tools.ipCidrNormalizer.article.usefulTitle"]()}</h2>
      <p>{m["tools.ipRangeToCidrConverter.article.when"]()}</p>
    </ToolArticle>
  );
}

export function IpRangeToCidrPage() {
  return (
    <ToolPage instructions={m["tools.ipRangeToCidrConverter.usage"]()}>
      <IpRangeToCidrPageContent />
    </ToolPage>
  );
}
