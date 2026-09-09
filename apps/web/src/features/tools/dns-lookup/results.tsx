import { Accordion, Alert, Card, Chip, Skeleton, Table } from "@heroui/react";
import { FileJson2, Search, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import type { lookupDnsRecords } from "../network-lookups/logic";
import { RESOLVERS } from "@workspace/tools/network/lookups";

type LookupResult = Awaited<ReturnType<typeof lookupDnsRecords>>;
type RecordResult = LookupResult["results"][number];

const RESPONSE_NAMES: Record<number, string> = {
  0: "NoError",
  1: "FormErr",
  2: "ServFail",
  3: "NXDomain",
  4: "NotImp",
  5: "Refused",
};
const DNS_FLAGS = [
  ["TC", m["tools.dnsLookup.flagDescriptionsTc"]],
  ["RD", m["tools.dnsLookup.flagDescriptionsRd"]],
  ["RA", m["tools.dnsLookup.flagDescriptionsRa"]],
  ["AD", m["tools.dnsLookup.flagDescriptionsAd"]],
  ["CD", m["tools.dnsLookup.flagDescriptionsCd"]],
] as const;

function LoadingResults() {
  return (
    <div
      className="grid gap-4 p-4 sm:p-6"
      role="status"
      aria-label={m["tools.dnsLookup.lookingUpButton"]()}
    >
      <span className="sr-only">{m["tools.dnsLookup.lookingUpButton"]()}</span>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      {[0, 1].map((item) => (
        <div
          key={item}
          className="grid gap-4 border-b border-separator py-4 last:border-b-0"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="grid flex-1 gap-3">
              <Skeleton className="h-5 w-16" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function AnswerTable({
  result,
  locale,
}: {
  result: RecordResult;
  locale: string;
}) {
  if (!result.answers.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium">
          {m["tools.dnsLookup.emptyAnswersTitle"]()}
        </p>
        <p className="mt-1 text-sm text-muted">
          {m["tools.dnsLookup.emptyAnswersDescription"]()}
        </p>
      </div>
    );
  }

  const number = new Intl.NumberFormat(locale);
  return (
    <>
      <dl className="grid gap-3 md:hidden">
        {result.answers.map((answer) => (
          <div
            key={`${answer.name}:${answer.typeCode}:${answer.ttl}:${answer.data}`}
            className="grid min-w-0 gap-2 border-b border-separator pb-3 last:border-b-0"
          >
            <div>
              <dt className="text-xs text-muted">
                {m["shared.pdfEditing.readfieldName"]()}
              </dt>
              <dd className="font-mono text-sm break-all">{answer.name}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-muted">
                  {m["common.uaFieldType"]()}
                </dt>
                <dd className="font-mono text-sm">{answer.type}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  {m["tools.dnsLookup.answerTtl"]()}
                </dt>
                <dd className="font-mono text-sm">
                  {number.format(answer.ttl)}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-xs text-muted">
                {m["tools.dnsLookup.answerData"]()}
              </dt>
              <dd className="font-mono text-sm break-all">{answer.data}</dd>
            </div>
          </div>
        ))}
      </dl>
      <Table variant="secondary" className="hidden md:block">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={`${result.recordType} ${m["common.passresultstitle"]()}`}
          >
            <Table.Header>
              <Table.Column id="name" isRowHeader>
                {m["shared.pdfEditing.readfieldName"]()}
              </Table.Column>
              <Table.Column id="type">{m["common.uaFieldType"]()}</Table.Column>
              <Table.Column id="ttl">
                {m["tools.dnsLookup.answerTtl"]()}
              </Table.Column>
              <Table.Column id="data">
                {m["tools.dnsLookup.answerData"]()}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {result.answers.map((answer) => (
                <Table.Row
                  key={`${answer.name}:${answer.typeCode}:${answer.ttl}:${answer.data}`}
                  id={`${answer.name}:${answer.typeCode}:${answer.ttl}:${answer.data}`}
                >
                  <Table.Cell className="max-w-56 font-mono text-xs break-all">
                    {answer.name}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs">
                    {answer.type}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs">
                    {number.format(answer.ttl)}
                  </Table.Cell>
                  <Table.Cell className="max-w-xl font-mono text-xs break-all">
                    {answer.data}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </>
  );
}

function RecordResultCard({
  result,
  locale,
}: {
  result: RecordResult;
  locale: string;
}) {
  const rawJson = useMemo(
    () =>
      JSON.stringify(
        {
          Status: result.status,
          TC: result.flags.tc,
          RD: result.flags.rd,
          RA: result.flags.ra,
          AD: result.flags.ad,
          CD: result.flags.cd,
          Answer: result.answers.map((answer) => ({
            name: answer.name,
            type: answer.typeCode,
            TTL: answer.ttl,
            data: answer.data,
          })),
          ...(result.comment ? { Comment: result.comment } : {}),
        },
        null,
        2,
      ),
    [result],
  );
  const statusName = RESPONSE_NAMES[result.status] ?? `RCODE ${result.status}`;

  return (
    <section className="min-w-0 border-b border-separator py-5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-2">
          <h3 className="font-mono text-base font-semibold">
            {result.recordType}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Chip color={result.status === 0 ? "success" : "danger"} size="sm">
              {m["tools.audioRecorder.status"]()}: {statusName}
            </Chip>
            {DNS_FLAGS.map(([flag, description]) => {
              const active =
                result.flags[flag.toLowerCase() as keyof typeof result.flags];
              const state = active
                ? m["tools.dnsLookup.on"]()
                : m["tools.dnsLookup.off"]();
              return (
                <Chip
                  key={flag}
                  size="sm"
                  variant={active ? "secondary" : "tertiary"}
                  aria-label={`${flag} ${state}: ${description()}`}
                  title={`${flag}: ${description()}`}
                  tabIndex={0}
                >
                  {flag} {state}
                </Chip>
              );
            })}
          </div>
        </div>
        <ToolCopyButton
          value={rawJson}
          copyLabel={m["tools.dnsLookup.copyRawJson"]()}
          copiedLabel={m["common.actions.copied"]()}
        />
      </div>
      <div className="grid min-w-0 gap-4 pt-4">
        {result.comment ? (
          <Alert status="default">
            <Alert.Indicator>
              <FileJson2 aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {m["tools.dnsLookup.responseComment"]()}
              </Alert.Title>
              <Alert.Description>{result.comment}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        <AnswerTable result={result} locale={locale} />
        <Accordion className="min-w-0">
          <Accordion.Item id="raw-json">
            <Accordion.Heading>
              <Accordion.Trigger className="px-0 py-2 text-sm font-medium">
                {m["tools.dnsLookup.rawJson"]()}
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="border-t border-separator px-0 py-3">
                <pre className="max-h-72 overflow-auto text-xs leading-5 wrap-break-word whitespace-pre-wrap">
                  {rawJson}
                </pre>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </div>
    </section>
  );
}

export function ResultsCard({
  locale,
  busy,
  error,
  result,
}: {
  locale: string;
  busy: boolean;
  error: string;
  result: LookupResult | null;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["common.passresultstitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.dnsLookup.resultsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="min-w-0 p-0" aria-busy={busy}>
        {busy ? (
          <LoadingResults />
        ) : error ? (
          <div className="p-4 sm:p-6">
            <Alert status="danger" role="alert">
              <Alert.Indicator>
                <TriangleAlert aria-hidden className="size-4" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>{m["tools.dnsLookup.errorTitle"]()}</Alert.Title>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        ) : result ? (
          <div className="grid min-w-0 gap-4 px-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <Chip size="sm" variant="secondary">
                {result.name}
              </Chip>
              <span>{RESOLVERS[result.resolver].label}</span>
            </div>
            {result.results.map((item) => (
              <RecordResultCard
                key={item.recordType}
                result={item}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="rounded-full bg-default p-3">
              <Search aria-hidden className="size-5 text-muted" />
            </span>
            <div className="grid gap-1">
              <p className="text-sm font-medium">
                {m["tools.dnsLookup.idleTitle"]()}
              </p>
              <p className="max-w-lg text-sm text-muted">
                {m["tools.dnsLookup.idleDescription"]()}
              </p>
            </div>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

export type { LookupResult };
