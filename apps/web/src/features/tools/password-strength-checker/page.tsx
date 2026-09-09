import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Card, Chip, Label, ProgressBar } from "@heroui/react";
import { Lightbulb, Lock, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import type { checkPassword } from "@workspace/tools/password/strength";
import { MAX_STRENGTH_LENGTH } from "@workspace/tools/password/strength";
import { PasswordToolError } from "@workspace/tools/password/generator";
import { runPasswordWorker } from "../password-tools/worker-client";
import { useAsyncTask } from "@/hooks/use-async-task";
import { getLocale } from "@/paraglide/runtime.js";

type StrengthReport = Awaited<ReturnType<typeof checkPassword>>;
type StrengthScore = StrengthReport["score"];
async function evaluate(
  input: { password: string; locale: "zh-CN" | "en-US" },
  signal: AbortSignal,
) {
  const result = await runPasswordWorker({ kind: "check", ...input }, signal);
  if (result.kind !== "strength") throw new PasswordToolError("invalid_input");
  return result;
}

function PasswordStrengthCheckerPageContent() {
  const id = useId();
  const [password, setPassword] = useState("");
  const locale = getLocale();
  const task = useAsyncTask(evaluate);
  const { clear, run } = task;
  const analysis = task.result?.locale === locale ? task.result : null;

  useEffect(() => {
    clear();
    if (!password) return;
    const timer = window.setTimeout(() => {
      void run({ password, locale });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      clear();
    };
  }, [password, locale, clear, run]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-password`}>
                {m["shared.aesTools.decryptpasswordlabel"]()}
              </Label>
              <ToolPasswordInput
                id={`${id}-password`}
                name="password"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                placeholder={m[
                  "tools.passwordStrengthChecker.passwordPlaceholder"
                ]()}
                className="text-base"
                groupClassName="h-11"
                prefix={<Lock aria-hidden className="size-4" />}
                showLabel={m["common.passshow"]()}
                hideLabel={m["common.passhide"]()}
                onChange={(event) => {
                  clear();
                  setPassword(event.currentTarget.value);
                }}
              />
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        {task.busy ? <p role="status">{m["common.processing"]()}</p> : null}
        {task.error ? (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Description>
                {task.error instanceof PasswordToolError &&
                task.error.code === "too_large"
                  ? m["tools.passwordStrengthChecker.tooLong"]({
                      limit: String(MAX_STRENGTH_LENGTH),
                    })
                  : m["tools.passwordStrengthChecker.failed"]()}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        <ResultsCard analysis={analysis} />
      </div>

      <ToolArticle>
        <h2>{m["tools.passwordStrengthChecker.articleTitle"]()}</h2>
        <p>{m["tools.passwordStrengthChecker.articleBody"]()}</p>
        <p>{m["tools.passwordStrengthChecker.modelNote"]()}</p>
        <ul>
          <li>{m["tools.passwordStrengthChecker.articlePoints0"]()}</li>
          <li>{m["tools.passwordStrengthChecker.articlePoints1"]()}</li>
          <li>{m["tools.passwordStrengthChecker.articlePoints2"]()}</li>
        </ul>
        <p>
          {m["tools.passwordStrengthChecker.articleExamplePrefix"]()}
          <code>{m["tools.passwordStrengthChecker.articleWeak"]()}</code>
          {m["shared.cidrTools.cidrParserArticleIntroBetween"]()}
          <code>{m["tools.passwordStrengthChecker.articleWeakTwo"]()}</code>
          {m["tools.passwordStrengthChecker.articleExampleBody"]()}
          <code>{m["tools.passwordStrengthChecker.articleStrong"]()}</code>
          {m["tools.passwordStrengthChecker.articleExampleSuffix"]()}
        </p>
        <blockquote>
          {m["tools.passwordStrengthChecker.articleTip"]()}
        </blockquote>
      </ToolArticle>
    </div>
  );
}

function ResultsCard({
  analysis,
}: Readonly<{ analysis: StrengthReport | null }>) {
  return (
    <ToolPanelCard aria-live="polite">
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.passwordStrengthChecker.resultTitle"]()}
        </Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="gap-4 py-4">
        {analysis ? (
          <>
            <section className="rounded-xl border border-separator bg-default/20 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Chip color={strengthColor(analysis.score)} variant="secondary">
                  {strengthLabel(analysis.score)}
                </Chip>
                <p className="text-sm text-muted">
                  {m["tools.passwordStrengthChecker.entropyBits"]({
                    bits: analysis.estimatedGuessBits?.toFixed(1) ?? "—",
                  })}
                  <span aria-hidden> · </span>
                  {m["tools.passwordStrengthChecker.log10Guesses"]({
                    value: analysis.log10Guesses?.toFixed(1) ?? "—",
                  })}
                </p>
              </div>
              <ProgressBar
                className="mt-4"
                value={(analysis.score + 1) * 20}
                maxValue={100}
                aria-label={strengthLabel(analysis.score)}
              >
                <ProgressBar.Track className="h-2.5">
                  <ProgressBar.Fill className={meterClass(analysis.score)} />
                </ProgressBar.Track>
              </ProgressBar>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Metric
                label={m["common.passlength"]()}
                value={String(analysis.length)}
              />
              <Metric
                label={m["tools.nanoidGenerator.alphabetUniqueLabel"]()}
                value={String(analysis.uniqueCount)}
              />
              <Metric
                label={m["tools.passwordStrengthChecker.characterSets"]()}
                value={
                  <div className="flex flex-wrap gap-2">
                    {characterTags(analysis).map((tag) => (
                      <Chip key={tag} size="sm" variant="tertiary">
                        {tag}
                      </Chip>
                    ))}
                  </div>
                }
              />
              <Metric
                label={m["tools.passwordStrengthChecker.crackOffline"]()}
                value={formatDuration(analysis.crackSeconds.offline1e10)}
              />
              <Metric
                label={m["tools.passwordStrengthChecker.crackOnline"]()}
                value={formatDuration(analysis.crackSeconds.online100)}
              />
            </section>

            {analysis.warning ? (
              <Alert status="danger">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>{analysis.warning}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {analysis.suggestions.length ? (
              <Alert status="warning">
                <Alert.Indicator>
                  <Lightbulb aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    <ul className="list-disc space-y-1 ps-4">
                      {analysis.suggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </>
        ) : (
          <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <span className="grid size-10 place-items-center rounded-xl bg-default text-muted">
              <Lock aria-hidden className="size-5" />
            </span>
            <p className="text-sm text-muted">
              {m["tools.passwordStrengthChecker.empty"]()}
            </p>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function Metric({
  label,
  value,
}: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="rounded-xl border border-separator bg-surface p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </p>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

function strengthLabel(score: StrengthScore) {
  if (score === 0) return m["common.passscore0"]();
  if (score === 1) return m["tools.passwordStrengthChecker.strength1"]();
  if (score === 2) return m["common.passscore2"]();
  if (score === 3) return m["common.passscore3"]();
  return m["common.passscore4"]();
}

function strengthColor(score: StrengthScore) {
  if (score <= 1) return "danger" as const;
  if (score === 2) return "warning" as const;
  return "success" as const;
}

function meterClass(score: StrengthScore) {
  if (score === 0) return "bg-danger";
  if (score === 1) return "bg-warning";
  if (score === 2) return "bg-warning";
  return "bg-success";
}

function characterTags(analysis: StrengthReport) {
  return [
    analysis.composition.lower ? "a-z" : null,
    analysis.composition.upper ? "A-Z" : null,
    analysis.composition.digit ? "0-9" : null,
    analysis.composition.other ? "#@$" : null,
  ].filter((tag): tag is string => Boolean(tag));
}

function durationDisplay(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return { value: Number.MAX_VALUE, unit: "years", isUnderSecond: false };
  }
  if (seconds <= 0) return { value: 0, unit: "seconds", isUnderSecond: true };
  if (seconds < 1) return { value: 1, unit: "seconds", isUnderSecond: true };
  const units: Array<{
    unit: "seconds" | "minutes" | "hours" | "days" | "months" | "years";
    seconds: number;
  }> = [
    { unit: "years", seconds: 31_557_600 },
    { unit: "months", seconds: 2_629_800 },
    { unit: "days", seconds: 86_400 },
    { unit: "hours", seconds: 3_600 },
    { unit: "minutes", seconds: 60 },
    { unit: "seconds", seconds: 1 },
  ];
  const selected = units.find((entry) => seconds >= entry.seconds) ?? {
    unit: "seconds" as const,
    seconds: 1,
  };
  const raw = seconds / selected.seconds;
  return {
    value:
      raw >= 100
        ? Math.round(raw)
        : raw >= 10
          ? Math.round(raw * 10) / 10
          : Math.round(raw * 100) / 100,
    unit: selected.unit,
    isUnderSecond: false,
  };
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const duration = durationDisplay(seconds);
  if (duration.isUnderSecond)
    return m["tools.passwordStrengthChecker.durationUnderSecond"]();
  let unit: string;
  if (duration.unit === "seconds") unit = m["common.passseconds"]();
  else if (duration.unit === "minutes") unit = m["common.passminutes"]();
  else if (duration.unit === "hours") unit = m["common.passhours"]();
  else if (duration.unit === "days") unit = m["common.passdays"]();
  else if (duration.unit === "months") unit = m["common.passmonths"]();
  else unit = m["common.passyears"]();
  return m["tools.passwordStrengthChecker.durationFormat"]({
    value: duration.value,
    unit,
  });
}

export default function PasswordStrengthCheckerPage() {
  return (
    <ToolPage>
      <PasswordStrengthCheckerPageContent />
    </ToolPage>
  );
}
