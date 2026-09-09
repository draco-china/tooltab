import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Input, Label, TextArea } from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import { startTransition, useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import {
  generateCuid2Ids,
  ShortIdError,
  normalizeCuid2Count as normalizeCount,
  normalizeCuid2Length as normalizeLength,
  CUID2_DEFAULT_LENGTH as DEFAULT_LENGTH,
  CUID2_MAX_COUNT as MAX_COUNT,
  CUID2_MAX_LENGTH as MAX_LENGTH,
} from "@workspace/tools/id/cuid2";
import { useObjectUrl } from "@/hooks/use-object-url";

const DEFAULT_COUNT = 5;
const STORAGE_KEYS = {
  count: "tools:cuid2-generator:count",
  length: "tools:cuid2-generator:length",
} as const;

function Cuid2GeneratorPageContent() {
  const countId = useId();
  const lengthId = useId();
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [generationVersion, setGenerationVersion] = useState(0);
  const [output, setOutput] = useState("");
  const [errorCode, setErrorCode] = useState<
    "unsupported" | "generation-failed" | null
  >(null);

  useEffect(() => {
    const storedCount = safeLocalStorage.getItem(STORAGE_KEYS.count);
    const storedLength = safeLocalStorage.getItem(STORAGE_KEYS.length);
    if (storedCount !== null && Number.isFinite(Number(storedCount))) {
      setCount(normalizeCount(Number(storedCount)));
    }
    if (storedLength !== null && Number.isFinite(Number(storedLength))) {
      setLength(normalizeLength(Number(storedLength)));
    }
  }, []);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.count, String(count));
  }, [count]);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.length, String(length));
  }, [length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: generationVersion deliberately requests fresh random identifiers.
  useEffect(() => {
    startTransition(() => {
      try {
        setOutput(generateCuid2Ids(count, length).join("\n"));
        setErrorCode(null);
      } catch (cause) {
        setOutput("");
        setErrorCode(
          cause instanceof ShortIdError && cause.code === "unsupported"
            ? "unsupported"
            : "generation-failed",
        );
      }
    });
  }, [count, length, generationVersion]);

  const resultBlob = useMemo(
    () =>
      output ? new Blob([output], { type: "text/plain;charset=utf-8" }) : null,
    [output],
  );
  const downloadUrl = useObjectUrl(resultBlob);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.aesTools.encryptoptionscardtitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.cuid2Generator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor={countId}>
                  {m["tools.cuid2Generator.countLabel"]()}
                </Label>
                <Input
                  id={countId}
                  aria-label={m["tools.cuid2Generator.countLabel"]()}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_COUNT}
                  step={1}
                  value={count}
                  onChange={(event) =>
                    setCount(normalizeCount(Number(event.currentTarget.value)))
                  }
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor={lengthId}>
                  {m["shared.checksumValidators.length"]()}
                </Label>
                <Input
                  id={lengthId}
                  aria-label={m["shared.checksumValidators.length"]()}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={MAX_LENGTH}
                  step={1}
                  value={length}
                  onChange={(event) =>
                    setLength(
                      normalizeLength(Number(event.currentTarget.value)),
                    )
                  }
                />
              </div>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
              <Card.Description>
                {m["tools.cuid2Generator.clientResultsDescription"]()}
              </Card.Description>
            </div>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <ToolCopyButton
                value={output}
                copyLabel={m["common.actions.copyResult"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
                disabled={!output}
              />
              {downloadUrl && output ? (
                <a
                  href={downloadUrl}
                  download={`cuid2-${count}x${length}.txt`}
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  <Download aria-hidden className="size-4" />
                  {m["common.actions.download"]()}
                </a>
              ) : (
                <Button type="button" variant="ghost" size="sm" isDisabled>
                  <Download aria-hidden className="size-4" />
                  {m["common.actions.download"]()}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => setGenerationVersion((current) => current + 1)}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.ksuidRegenerate"]()}
              </Button>
            </ToolPanelActionGroup>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {errorCode ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {errorCode === "unsupported"
                      ? m["tools.cuid2Generator.statesUnsupportedDescription"]()
                      : m[
                          "tools.cuid2Generator.statesGenerationErrorDescription"
                        ]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : output ? (
              <TextArea
                aria-label={m["common.passresultstitle"]()}
                value={output}
                readOnly
                rows={14}
                placeholder={m["tools.cuid2Generator.resultsPlaceholder"]()}
                className="max-h-[min(32rem,60vh)] min-h-80 resize-y overflow-y-auto font-mono text-sm"
              />
            ) : (
              <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-border px-5 text-center text-sm text-muted">
                {m["tools.cuid2Generator.resultsPlaceholder"]()}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <p>{m["tools.cuid2Generator.article.intro"]()}</p>
        <h2>{m["tools.cuid2Generator.article.differentTitle"]()}</h2>
        <p>{m["tools.cuid2Generator.article.different"]()}</p>
        <h2>{m["tools.cuid2Generator.article.optionsTitle"]()}</h2>
        <p>{m["tools.cuid2Generator.article.options"]()}</p>
        <h2>{m["tools.cuid2Generator.article.exportTitle"]()}</h2>
        <p>{m["tools.cuid2Generator.articleBatchExportBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default Cuid2GeneratorPage;

export function Cuid2GeneratorPage() {
  return (
    <ToolPage>
      <Cuid2GeneratorPageContent />
    </ToolPage>
  );
}
