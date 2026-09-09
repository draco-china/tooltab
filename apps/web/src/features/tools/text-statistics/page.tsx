import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card, TextArea } from "@heroui/react";
import { useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  analyzeText,
  TextStatisticsError,
} from "@workspace/tools/text/statistics";
function TextStatisticsToolContent() {
  const locale = getLocale();
  const id = useId();
  const [input, setInput] = useState("");
  const result = useMemo(() => {
    try {
      return { data: analyzeText(input, locale), error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof TextStatisticsError ? error.code : "unsupported",
      };
    }
  }, [input, locale]);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const data = result.data;
  const overview = data
    ? [
        [m["tools.textStatistics.words"](), data.words],
        [m["tools.textStatistics.uniquewords"](), data.uniqueWords],
        [m["tools.textStatistics.characters"](), data.characters],
        [m["tools.textStatistics.sentences"](), data.sentences],
        [m["tools.textStatistics.paragraphs"](), data.paragraphs],
        [m["tools.textStatistics.lines"](), data.lines],
        [
          m["tools.textStatistics.reading"](),
          m["tools.textStatistics.seconds"]({ count: data.readingSeconds }),
        ],
        [
          m["tools.textStatistics.speaking"](),
          m["tools.textStatistics.seconds"]({ count: data.speakingSeconds }),
        ],
      ]
    : [];
  const detailGroups = data
    ? [
        {
          title: m["tools.textStatistics.style"](),
          items: [
            [
              m["tools.textStatistics.charactersnospaces"](),
              data.charactersNoSpaces,
            ],
            [m["tools.textStatistics.averageword"](), data.averageWordLength],
            [
              m["tools.textStatistics.diversity"](),
              `${number.format(data.lexicalDiversity)}%`,
            ],
          ],
        },
        {
          title: m["tools.textStatistics.structure"](),
          items: [
            [
              m["tools.textStatistics.averagesentence"](),
              data.averageSentenceWords,
            ],
            [
              m["tools.textStatistics.longestsentence"](),
              data.longestSentenceWords,
            ],
            [
              m["tools.textStatistics.longestparagraph"](),
              data.longestParagraphWords,
            ],
          ],
        },
      ]
    : [];
  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <Card.Title>{m["tools.textStatistics.input"]()}</Card.Title>
              <Card.Description id={`${id}-hint`}>
                {m["tools.textStatistics.inputhint"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-3 sm:col-start-2 sm:row-span-2 sm:row-start-1">
              <Button
                variant="outline"
                onPress={() =>
                  setInput(m["tools.textStatistics.sampleInput"]())
                }
              >
                {m["tools.textStatistics.sample"]()}
              </Button>
              <Button
                variant="ghost"
                isDisabled={!input}
                onPress={() => setInput("")}
              >
                {m["tools.textStatistics.clear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              id={`${id}-input`}
              aria-label={m["tools.textStatistics.input"]()}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-h-80 flex-1 resize-y"
              dir="auto"
              aria-invalid={!!result.error}
              aria-describedby={`${id}-hint${result.error ? ` ${id}-error` : ""}`}
            />
            {result.error ? (
              <p
                id={`${id}-error`}
                role="alert"
                className="text-sm text-danger"
              >
                {(result.error === "too-large"
                  ? m["tools.textStatistics.toolarge"]
                  : m["tools.textStatistics.unsupported"])({})}
              </p>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        {data ? (
          <>
            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>{m["tools.textStatistics.length"]()}</Card.Title>
              </Card.Header>
              <ToolPanelCardContent className="py-4">
                <section aria-label={m["tools.textStatistics.length"]()}>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {overview.map(([label, value]) => (
                      <div
                        key={label}
                        className="grid gap-2 rounded-xl border border-border bg-default/20 p-4"
                      >
                        <dt className="text-sm text-muted">{label}</dt>
                        <dd className="text-xl font-semibold tabular-nums">
                          {typeof value === "number"
                            ? number.format(value)
                            : value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </ToolPanelCardContent>
            </ToolPanelCard>

            <div className="grid gap-6 lg:grid-cols-2">
              {detailGroups.map((group) => (
                <ToolPanelCard key={group.title}>
                  <Card.Header className="border-b border-separator">
                    <Card.Title>{group.title}</Card.Title>
                  </Card.Header>
                  <ToolPanelCardContent className="py-4">
                    <dl className="grid gap-3" aria-label={group.title}>
                      {group.items.map(([label, value]) => (
                        <div
                          key={label}
                          className="flex justify-between gap-4 rounded-xl border border-border bg-default/20 p-4"
                        >
                          <dt className="text-sm text-muted">{label}</dt>
                          <dd className="shrink-0 font-medium tabular-nums">
                            {typeof value === "number"
                              ? number.format(value)
                              : value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </ToolPanelCardContent>
                </ToolPanelCard>
              ))}
            </div>

            <ToolPanelCard>
              <Card.Header className="border-b border-separator">
                <Card.Title>{m["tools.textStatistics.repeated"]()}</Card.Title>
                <Card.Description>
                  {m["tools.textStatistics.repeatedhint"]()}
                </Card.Description>
              </Card.Header>
              <ToolPanelCardContent className="py-4">
                <section aria-label={m["tools.textStatistics.repeated"]()}>
                  {data.repeatedTerms.length ? (
                    <dl className="grid gap-x-6 sm:grid-cols-2">
                      {data.repeatedTerms.map(({ term, count }) => (
                        <div
                          key={term}
                          className="flex min-w-0 justify-between gap-4 border-b border-separator py-3 text-sm"
                        >
                          <dt className="min-w-0 break-all" dir="auto">
                            {term}
                          </dt>
                          <dd className="shrink-0 tabular-nums">
                            {number.format(count)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted">
                      {m["tools.textStatistics.norepeated"]()}
                    </p>
                  )}
                </section>
              </ToolPanelCardContent>
            </ToolPanelCard>
          </>
        ) : null}
      </div>

      <ToolArticle>
        <h2 className="text-lg font-semibold text-foreground">
          {m["tools.textStatistics.rules"]()}
        </h2>
        <p>{m["tools.textStatistics.rulestext"]()}</p>
        <p>{m["tools.textStatistics.timerules"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function TextStatisticsTool() {
  return (
    <ToolPage>
      <TextStatisticsToolContent />
    </ToolPage>
  );
}
