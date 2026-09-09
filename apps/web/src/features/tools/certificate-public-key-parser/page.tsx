import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Label,
  Skeleton,
  TextArea,
} from "@heroui/react";
import { FileText, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useId, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import { ToolFilePicker } from "@/components/base/tool-file-picker";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  ACCEPTED_CERTIFICATE_FORMATS,
  DEFAULT_INPUT,
  STORAGE_KEYS,
} from "./constants";
import { parseCertificateInput } from "./logic";
import type {
  CertificateParserMessages,
  ParsedCertificateEntry,
} from "./types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      entries: readonly ParsedCertificateEntry[];
      warnings: readonly string[];
    };
type DetailValue = string | number | readonly string[] | undefined;

function CertificatePublicKeyParserPageContent() {
  const inputId = useId();
  const [input, setInput] = useState<string | File>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEYS.input) ?? DEFAULT_INPUT;
    } catch {
      return DEFAULT_INPUT;
    }
  });
  const [state, setState] = useState<State>({ status: "loading" });
  const deferredInput = useDeferredValue(input);

  useEffect(() => {
    if (typeof input !== "string") return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.input, input);
    } catch {}
  }, [input]);

  useEffect(() => {
    let cancelled = false;
    if (typeof deferredInput === "string" && !deferredInput.trim()) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    void parseCertificateInput(deferredInput, parserMessages())
      .then((result) => {
        if (cancelled) return;
        setState(
          result.entries.length
            ? { status: "ready", ...result }
            : { status: "idle" },
        );
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [deferredInput]);

  async function importFile(file: File) {
    try {
      const preview = await file.slice(0, 2048).text();
      const textLike =
        preview.includes("-----BEGIN") || !hasBinaryControlCharacter(preview);
      setInput(textLike ? await file.text() : file);
    } catch {
      setState({
        status: "error",
        message: m["tools.certificatePublicKeyParser.readFileError"](),
      });
    }
  }

  const textInput = typeof input === "string" ? input : "";
  return (
    <div className="grid gap-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6">
        <ToolPanelCard className="min-w-0">
          <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.certificatePublicKeyParser.inputTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.certificatePublicKeyParser.inputDescription"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setInput(DEFAULT_INPUT)}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["shared.bcrypt.sample"]()}
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setInput("")}>
                <Trash2 aria-hidden className="size-4" />
                {m["shared.joseTools.clear"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Label htmlFor={inputId}>
                {m["tools.certificatePublicKeyParser.inputLabel"]()}
              </Label>
              <TextArea
                id={inputId}
                name="certificate-input"
                aria-label={m["tools.certificatePublicKeyParser.inputLabel"]()}
                autoComplete="off"
                dir="ltr"
                spellCheck={false}
                translate="no"
                value={textInput}
                placeholder={m[
                  "tools.certificatePublicKeyParser.inputPlaceholder"
                ]()}
                onChange={(event) => setInput(event.currentTarget.value)}
                className="min-h-96 flex-1 resize-y text-left font-mono text-sm"
              />
              <p className="text-sm text-muted">
                {typeof input === "string"
                  ? m["tools.certificatePublicKeyParser.inputHint"]()
                  : m["tools.certificatePublicKeyParser.selectedFileHint"]({
                      name: input.name,
                    })}
              </p>
            </div>
            <ToolFilePicker
              label={m["common.adler32importfromfilelabel"]()}
              accept={ACCEPTED_CERTIFICATE_FORMATS.split(",")}
              fileName={typeof input === "string" ? undefined : input.name}
              onSelect={(file) => void importFile(file)}
              onClear={
                typeof input === "string" ? undefined : () => setInput("")
              }
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard className="min-w-0">
          <Card.Header className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-separator">
            <div className="grid min-w-0 flex-1 gap-1">
              <Card.Title>
                {m["tools.certificatePublicKeyParser.resultsTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.certificatePublicKeyParser.resultsDescription"]()}
              </Card.Description>
            </div>
            <ToolCopyButton
              value={
                state.status === "ready"
                  ? JSON.stringify(state.entries, null, 2)
                  : ""
              }
              disabled={state.status !== "ready"}
              copyLabel={m["shared.aesTools.encryptcopyjsonlabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
            />
          </Card.Header>
          <ToolPanelCardContent className="py-4" aria-live="polite">
            <Results state={state} />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>
      <ToolArticle>
        <h2>{m["tools.certificatePublicKeyParser.articleTitle"]()}</h2>
        <p>{m["tools.certificatePublicKeyParser.articleBodyOne"]()}</p>
        <p>{m["tools.certificatePublicKeyParser.articleBodyTwo"]()}</p>
        <p>{m["tools.certificatePublicKeyParser.articleBodyThree"]()}</p>
        <p>{m["tools.certificatePublicKeyParser.articleBodyFour"]()}</p>
        <ul>
          {[
            m["tools.certificatePublicKeyParser.articleItems0"](),
            m["tools.certificatePublicKeyParser.articleItems1"](),
            m["tools.certificatePublicKeyParser.articleItems2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

function Results({ state }: { state: State }) {
  if (state.status === "loading")
    return (
      <div aria-busy="true" className="grid min-h-72 content-center gap-3">
        <Skeleton className="mx-auto size-10 rounded-full" />
        <Skeleton className="mx-auto h-4 w-2/5" />
        <Skeleton className="mx-auto h-4 w-4/5" />
        <span className="sr-only">
          {m["tools.certificatePublicKeyParser.loadingTitle"]()}
        </span>
      </div>
    );
  if (state.status === "idle")
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <FileText aria-hidden className="mx-auto size-6 text-muted" />
          <EmptyTitle>
            {m["tools.certificatePublicKeyParser.resultsEmptyTitle"]()}
          </EmptyTitle>
          <EmptyDescription>
            {m["tools.certificatePublicKeyParser.resultsEmptyDescription"]()}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  if (state.status === "error")
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {m["tools.certificatePublicKeyParser.parseErrorTitle"]()}
          </Alert.Title>
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  return (
    <div className="grid gap-4">
      {state.warnings.length ? (
        <Alert status="warning">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.certificatePublicKeyParser.warningsTitle"]()}
            </Alert.Title>
            <Alert.Description>
              <ul className="list-disc ps-4">
                {state.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {state.entries.map((entry) => (
        <Entry
          key={`${entry.type}-${entry.label}-${entry.fingerprints.sha256}`}
          entry={entry}
        />
      ))}
    </div>
  );
}

function Entry({ entry }: { entry: ParsedCertificateEntry }) {
  const fields: readonly (readonly [string, DetailValue])[] =
    entry.type === "certificate"
      ? [
          [m["common.certSubject"](), entry.subject],
          [m["common.certIssuer"](), entry.issuer],
          [m["common.certSerialNumber"](), entry.serialNumber],
          [m["common.certNotBefore"](), entry.notBefore],
          [m["common.certNotAfter"](), entry.notAfter],
          [m["common.certSignatureAlgorithm"](), entry.signatureAlgorithm],
          [
            m["tools.certificatePublicKeyParser.publicKeyAlgorithmLabel"](),
            entry.publicKeyAlgorithm,
          ],
          [
            m["tools.certificatePublicKeyParser.keySizeLabel"](),
            entry.publicKeySize,
          ],
          [m["common.certCurve"](), entry.publicKeyCurve],
        ]
      : [
          [
            m["tools.certificatePublicKeyParser.publicKeyAlgorithmLabel"](),
            entry.algorithm,
          ],
          [m["tools.certificatePublicKeyParser.keySizeLabel"](), entry.keySize],
          [m["common.certCurve"](), entry.curve],
        ];
  return (
    <section
      aria-label={entry.label}
      className="grid min-w-0 gap-5 border-t border-separator pt-6 first:border-t-0 first:pt-0"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{entry.label}</h3>
        <Chip size="sm" variant="soft">
          {entry.type === "certificate"
            ? m["common.certCertificate"]()
            : m["tools.certificatePublicKeyParser.publicKeyTypeLabel"]()}
        </Chip>
      </div>
      <Details fields={fields} />
      <section className="grid min-w-0 gap-3 border-t border-separator pt-4">
        <h4 className="text-xs font-medium text-muted">
          {m["tools.certificatePublicKeyParser.fingerprintsTitle"]()}
        </h4>
        <CopyValue
          label={m["common.certSha256"]()}
          value={entry.fingerprints.sha256}
        />
        <CopyValue
          label={m["common.certSha1"]()}
          value={entry.fingerprints.sha1}
        />
      </section>
      {entry.type === "certificate" ? (
        <section className="grid min-w-0 gap-3 border-t border-separator pt-4">
          <h4 className="text-xs font-medium text-muted">
            {m["common.certExtensions"]()}
          </h4>
          <Details
            fields={[
              [
                m[
                  "tools.certificatePublicKeyParser.subjectAlternativeNamesLabel"
                ](),
                entry.extensions.subjectAlternativeNames,
              ],
              [
                m["tools.certificatePublicKeyParser.keyUsageLabel"](),
                entry.extensions.keyUsage,
              ],
              [
                m["tools.certificatePublicKeyParser.extendedKeyUsageLabel"](),
                entry.extensions.extendedKeyUsage,
              ],
              [
                m["tools.certificatePublicKeyParser.basicConstraintsLabel"](),
                entry.extensions.basicConstraints,
              ],
              [
                m[
                  "tools.certificatePublicKeyParser.subjectKeyIdentifierLabel"
                ](),
                entry.extensions.subjectKeyIdentifier,
              ],
              [
                m[
                  "tools.certificatePublicKeyParser.authorityKeyIdentifierLabel"
                ](),
                entry.extensions.authorityKeyIdentifier,
              ],
            ]}
          />
        </section>
      ) : null}
    </section>
  );
}

function Details({
  fields,
}: {
  fields: readonly (readonly [string, DetailValue])[];
}) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0 py-2">
          <dt className="text-xs font-medium text-muted">{label}</dt>
          <dd className="mt-1 wrap-break-word">{formatDetail(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-medium text-muted">{label}</h5>
        <ToolCopyButton
          value={value}
          copyLabel={m["common.actions.copy"]()}
          copiedLabel={m["common.actions.copied"]()}
          variant="ghost"
        />
      </div>
      <code
        dir="ltr"
        className="text-left text-xs leading-6 break-all sm:text-sm"
      >
        {value}
      </code>
    </section>
  );
}

function formatDetail(value: DetailValue) {
  if (Array.isArray(value))
    return value.length
      ? value.join(", ")
      : m["tools.bicSwiftValidator.notAvailable"]();
  if (typeof value === "number")
    return `${value} ${m["tools.certificatePublicKeyParser.bitsLabel"]()}`;
  return typeof value === "string" && value
    ? value
    : m["tools.bicSwiftValidator.notAvailable"]();
}
function hasBinaryControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 8) || (code >= 14 && code <= 31);
  });
}
function parserMessages(): CertificateParserMessages {
  return {
    invalidInput: m["tools.certificatePublicKeyParser.invalidInput"](),
    invalidPem: m["tools.certificatePublicKeyParser.invalidPem"](),
    parseFailed: m["tools.certificatePublicKeyParser.parseFailed"](),
    notAvailable: m["tools.bicSwiftValidator.notAvailable"](),
    webCryptoUnavailable:
      m["tools.certificatePublicKeyParser.webCryptoUnavailable"](),
    unsupportedPemBlock: (label) =>
      m["tools.certificatePublicKeyParser.unsupportedPemBlock"]({
        label: label,
      }),
    certificateLabel: (index) =>
      m["tools.certificatePublicKeyParser.certificateLabel"]({
        index: String(index),
      }),
    publicKeyLabel: (index) =>
      m["tools.certificatePublicKeyParser.publicKeyLabel"]({
        index: String(index),
      }),
  };
}

export default function CertificatePublicKeyParserPage() {
  return (
    <ToolPage>
      <CertificatePublicKeyParserPageContent />
    </ToolPage>
  );
}
