import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Skeleton,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import {
  Download,
  FileText,
  Lock,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { useAsyncTask } from "@/hooks/use-async-task";
import { m } from "@/paraglide/messages.js";
import {
  CertificateToolError,
  type CsrOptions,
  CURVES,
  HASHES,
  RSA_SIZES,
  SAN_FIELDS,
  SUBJECT_FIELDS,
} from "@workspace/tools/crypto/certificate-contract";
import { runCsr } from "./worker-client";

const errorMessages = {
  cert_error_busy: m["tools.csrGenerator.certErrorBusy"],
  cert_error_copy_failed: m["tools.csrGenerator.certErrorCopyFailed"],
  cert_error_encrypted_key: m["tools.csrGenerator.certErrorEncryptedKey"],
  cert_error_file_failed: m["tools.csrGenerator.certErrorFileFailed"],
  cert_error_generation_failed:
    m["tools.csrGenerator.certErrorGenerationFailed"],
  cert_error_import_failed: m["tools.csrGenerator.certErrorImportFailed"],
  cert_error_invalid_der: m["tools.csrGenerator.certErrorInvalidDer"],
  cert_error_invalid_ip: m["tools.csrGenerator.certErrorInvalidIp"],
  cert_error_invalid_options: m["tools.csrGenerator.certErrorInvalidOptions"],
  cert_error_invalid_pem: m["tools.csrGenerator.certErrorInvalidPem"],
  cert_error_invalid_san: m["tools.csrGenerator.certErrorInvalidSan"],
  cert_error_invalid_subject: m["tools.csrGenerator.certErrorInvalidSubject"],
  cert_error_invalid_unicode: m["tools.csrGenerator.certErrorInvalidUnicode"],
  cert_error_legacy_key: m["tools.csrGenerator.certErrorLegacyKey"],
  cert_error_missing_key: m["tools.csrGenerator.certErrorMissingKey"],
  cert_error_missing_subject: m["tools.csrGenerator.certErrorMissingSubject"],
  cert_error_operation_failed: m["tools.csrGenerator.certErrorOperationFailed"],
  cert_error_timeout: m["tools.csrGenerator.certErrorTimeout"],
  cert_error_too_large: m["tools.csrGenerator.certErrorTooLarge"],
  cert_error_unrecognized_text:
    m["tools.csrGenerator.certErrorUnrecognizedText"],
  cert_error_unsupported_block:
    m["tools.csrGenerator.certErrorUnsupportedBlock"],
  cert_error_unsupported_key: m["tools.csrGenerator.certErrorUnsupportedKey"],
  cert_error_worker_failed: m["tools.csrGenerator.certErrorWorkerFailed"],
} as const;

function csrErrorMessage(cause: unknown) {
  const code =
    cause instanceof CertificateToolError ? cause.code : "operation_failed";
  const key = `cert_error_${code}`;
  return Object.hasOwn(errorMessages, key)
    ? errorMessages[key as keyof typeof errorMessages]({})
    : m["tools.csrGenerator.certErrorOperationFailed"]();
}

export const defaultCsr: CsrOptions = {
  keySource: "generate",
  algorithm: "rsa",
  rsaSize: 2048,
  rsaHash: "SHA-256",
  ecCurve: "P-256",
  keyPem: "",
  subject: {
    commonName: "example.com",
    organization: "",
    organizationalUnit: "",
    country: "",
    state: "",
    locality: "",
    emailAddress: "",
  },
  san: { dns: [], ip: [], email: [], uri: [] },
};

const STORAGE_KEY = "tools:csr-generator:options";
type SubjectField = (typeof SUBJECT_FIELDS)[number];
type SanField = (typeof SAN_FIELDS)[number];

const subjectLabels: Record<SubjectField, () => string> = {
  commonName: m["tools.csrGenerator.subjectCommonNameLabel"],
  organization: m["tools.csrGenerator.subjectOrganizationLabel"],
  organizationalUnit: m["tools.csrGenerator.subjectOrganizationalUnitLabel"],
  country: m["tools.csrGenerator.subjectCountryLabel"],
  state: m["tools.csrGenerator.subjectStateLabel"],
  locality: m["tools.csrGenerator.subjectLocalityLabel"],
  emailAddress: m["tools.csrGenerator.subjectEmailLabel"],
};
const sanLabels: Record<SanField, () => string> = {
  dns: m["tools.csrGenerator.certDns"],
  ip: m["tools.csrGenerator.certIp"],
  email: m["tools.csrGenerator.sanEmailLabel"],
  uri: m["tools.csrGenerator.certUri"],
};
const sanPlaceholders: Record<SanField, () => string> = {
  dns: m["tools.csrGenerator.sanDnsPlaceholder"],
  ip: m["tools.csrGenerator.sanIpPlaceholder"],
  email: m["tools.csrGenerator.sanEmailPlaceholder"],
  uri: m["tools.csrGenerator.sanUriPlaceholder"],
};

function splitEntries(value: string) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ToggleField(props: {
  label: string;
  value: string;
  options: readonly string[];
  labels?: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-sm font-medium">{props.label}</span>
      <ToggleButtonGroup
        selectionMode="single"
        selectedKeys={new Set([props.value])}
        aria-label={props.label}
        className="grid w-full auto-cols-fr grid-flow-col [&_button]:min-h-11 [&_button]:min-w-0"
        onSelectionChange={(selection) => {
          const next = String([...selection][0] ?? "");
          if (props.options.includes(next)) props.onChange(next);
        }}
      >
        {props.options.map((option, index) => (
          <ToggleButton key={option} id={option}>
            {props.labels?.[index] ?? option}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

function DownloadButton(props: { value: string; name: string; label: string }) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([props.value], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = props.name;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button type="button" size="sm" variant="outline" onPress={download}>
      <Download aria-hidden className="size-4" />
      {props.label}
    </Button>
  );
}

function KeyMaterial(props: {
  title: string;
  description: string;
  value: string;
  name: string;
  copyLabel: string;
  copiedLabel: string;
  downloadLabel: string;
}) {
  return (
    <section className="grid gap-3 rounded-xl border border-border bg-default/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3 className="font-medium">{props.title}</h3>
          <p className="text-sm text-muted">{props.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToolCopyButton
            value={props.value}
            copyLabel={props.copyLabel}
            copiedLabel={props.copiedLabel}
          />
          <DownloadButton
            value={props.value}
            name={props.name}
            label={props.downloadLabel}
          />
        </div>
      </div>
      <TextArea
        value={props.value}
        readOnly
        aria-label={props.title}
        rows={10}
        className="field-sizing-fixed resize-y font-mono text-xs"
      />
    </section>
  );
}

function CsrGeneratorContent() {
  const task = useAsyncTask(runCsr);
  const taskError = task.status === "error" ? csrErrorMessage(task.error) : "";
  const [form, setForm] = useState(defaultCsr);
  const [san, setSan] = useState<Record<SanField, string>>({
    dns: "",
    ip: "",
    email: "",
    uri: "",
  });
  const id = useId();
  const result = task.result && "csrPem" in task.result ? task.result : null;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        form?: CsrOptions;
        san?: Record<SanField, string>;
      };
      if (parsed.form) setForm(parsed.form);
      if (parsed.san) setSan(parsed.san);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, san }));
    } catch {}
  }, [form, san]);

  function change(patch: Partial<CsrOptions>) {
    task.clear();
    setForm((value) => ({ ...value, ...patch }));
  }
  function reset() {
    task.clear();
    setForm(defaultCsr);
    setSan({ dns: "", ip: "", email: "", uri: "" });
  }
  function generate() {
    void task.run({
      mode: "generate",
      options: {
        ...form,
        san: Object.fromEntries(
          SAN_FIELDS.map((field) => [field, splitEntries(san[field])]),
        ) as CsrOptions["san"],
      },
    });
  }

  return (
    <div className="grid gap-8">
      <div className="grid items-start gap-6 lg:grid-cols-2" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.csrGenerator.optionsTitle"]()}</Card.Title>
            <Card.Description>
              {m["tools.csrGenerator.optionsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ToggleField
                label={m["shared.aesTools.decryptkeysourcelabel"]()}
                value={form.keySource}
                options={["generate", "import"]}
                labels={[
                  m["tools.csrGenerator.keySourceGenerate"](),
                  m["tools.csrGenerator.keySourceImport"](),
                ]}
                onChange={(value) =>
                  change({ keySource: value as CsrOptions["keySource"] })
                }
              />
              {form.keySource === "generate" ? (
                <ToggleField
                  label={m["common.argonAlgorithm"]()}
                  value={form.algorithm}
                  options={["rsa", "ecdsa"]}
                  labels={[
                    m["tools.csrGenerator.algorithmRsa"](),
                    m["tools.csrGenerator.algorithmEcdsa"](),
                  ]}
                  onChange={(value) =>
                    change({ algorithm: value as CsrOptions["algorithm"] })
                  }
                />
              ) : (
                <ToggleField
                  label={m["tools.csrGenerator.rsaHashLabel"]()}
                  value={form.rsaHash}
                  options={HASHES}
                  onChange={(value) =>
                    change({ rsaHash: value as CsrOptions["rsaHash"] })
                  }
                />
              )}
              {form.keySource === "generate" && form.algorithm === "rsa" ? (
                <>
                  <ToggleField
                    label={m["common.pgpSize"]()}
                    value={String(form.rsaSize)}
                    options={RSA_SIZES.map(String)}
                    onChange={(value) =>
                      change({
                        rsaSize: Number(value) as CsrOptions["rsaSize"],
                      })
                    }
                  />
                  <ToggleField
                    label={m["tools.csrGenerator.rsaHashLabel"]()}
                    value={form.rsaHash}
                    options={HASHES}
                    onChange={(value) =>
                      change({ rsaHash: value as CsrOptions["rsaHash"] })
                    }
                  />
                </>
              ) : null}
              {form.keySource === "generate" && form.algorithm === "ecdsa" ? (
                <ToggleField
                  label={m["common.certCurve"]()}
                  value={form.ecCurve}
                  options={CURVES}
                  onChange={(value) =>
                    change({ ecCurve: value as CsrOptions["ecCurve"] })
                  }
                />
              ) : null}
            </div>

            {form.keySource === "import" ? (
              <div className="grid gap-2">
                <label htmlFor={`${id}-key`} className="text-sm font-medium">
                  {m["tools.csrGenerator.importLabel"]()}
                </label>
                <TextArea
                  id={`${id}-key`}
                  value={form.keyPem}
                  rows={6}
                  placeholder={m["tools.csrGenerator.importPlaceholder"]()}
                  className="font-mono text-xs"
                  onChange={(event) =>
                    change({ keyPem: event.currentTarget.value })
                  }
                />
                <p className="text-xs text-muted">
                  {m["tools.csrGenerator.importDescription"]()}
                </p>
              </div>
            ) : null}

            <section className="grid gap-3 border-t border-separator pt-5">
              <div className="grid gap-1">
                <h3 className="text-sm font-medium">
                  {m["tools.csrGenerator.subjectTitle"]()}
                </h3>
                <p className="text-xs text-muted">
                  {m["tools.csrGenerator.subjectDescription"]()}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SUBJECT_FIELDS.map((field) => (
                  <div
                    key={field}
                    className={`grid gap-2 ${field === "commonName" || field === "emailAddress" ? "sm:col-span-2" : ""}`}
                  >
                    <label
                      htmlFor={`${id}-${field}`}
                      className="text-sm font-medium"
                    >
                      {subjectLabels[field]()}
                    </label>
                    <Input
                      id={`${id}-${field}`}
                      type={field === "emailAddress" ? "email" : "text"}
                      value={form.subject[field]}
                      maxLength={field === "country" ? 2 : undefined}
                      placeholder={
                        field === "commonName"
                          ? m[
                              "tools.csrGenerator.subjectCommonNamePlaceholder"
                            ]()
                          : field === "country"
                            ? m[
                                "tools.csrGenerator.subjectCountryPlaceholder"
                              ]()
                            : undefined
                      }
                      onChange={(event) =>
                        change({
                          subject: {
                            ...form.subject,
                            [field]:
                              field === "country"
                                ? event.currentTarget.value.toUpperCase()
                                : event.currentTarget.value,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-3 border-t border-separator pt-5">
              <div className="grid gap-1">
                <h3 className="text-sm font-medium">
                  {m["tools.csrGenerator.sanTitle"]()}
                </h3>
                <p className="text-xs text-muted">
                  {m["tools.csrGenerator.sanDescription"]()}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SAN_FIELDS.map((field) => (
                  <div key={field} className="grid gap-2">
                    <label
                      htmlFor={`${id}-san-${field}`}
                      className="text-sm font-medium"
                    >
                      {sanLabels[field]()}
                    </label>
                    <TextArea
                      id={`${id}-san-${field}`}
                      value={san[field]}
                      rows={2}
                      placeholder={sanPlaceholders[field]()}
                      className="font-mono text-xs"
                      onChange={(event) => {
                        const next = event.currentTarget.value;
                        task.clear();
                        setSan((value) => ({
                          ...value,
                          [field]: next,
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-between gap-3">
            <Button type="button" size="sm" variant="outline" onPress={reset}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["common.actions.reset"]()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              isDisabled={task.busy}
              onPress={generate}
            >
              {task.busy
                ? m["shared.bcryptTools.generatorGeneratingLabel"]()
                : m["tools.csrGenerator.certGenerate"]()}
            </Button>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <div className="grid gap-1">
              <Card.Title>{m["tools.csrGenerator.outputTitle"]()}</Card.Title>
              <Card.Description>
                {m["tools.csrGenerator.outputDescription"]()}
              </Card.Description>
            </div>
            {result ? (
              <Chip size="sm" variant="soft">
                {result.keyAlgorithm}
              </Chip>
            ) : null}
          </Card.Header>
          <ToolPanelCardContent className="py-4" aria-busy={task.busy}>
            {task.busy ? (
              <div
                className="grid min-h-80 content-center gap-3"
                role="status"
                aria-label={m["shared.bcryptTools.generatorGeneratingLabel"]()}
              >
                <Skeleton className="mx-auto size-10 rounded-full" />
                <Skeleton className="mx-auto h-4 w-2/5" />
                <Skeleton className="mx-auto h-4 w-4/5" />
                <Skeleton className="mx-auto h-40 w-full rounded-xl" />
              </div>
            ) : taskError ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.csrGenerator.errorTitle"]()}
                  </Alert.Title>
                  <Alert.Description>{taskError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : result ? (
              <div className="grid gap-5">
                <KeyMaterial
                  title={m["tools.csrGenerator.certCsr"]()}
                  description={m["tools.csrGenerator.csrDescription"]()}
                  value={result.csrPem}
                  name="request.csr"
                  copyLabel={m["tools.csrGenerator.copyCsrLabel"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  downloadLabel={m["tools.csrGenerator.downloadCsrLabel"]()}
                />
                {result.privateKeyPem ? (
                  <>
                    <Alert status="warning">
                      <Alert.Indicator>
                        <Lock aria-hidden className="size-4" />
                      </Alert.Indicator>
                      <Alert.Content>
                        <Alert.Title>
                          {m["tools.csrGenerator.privateKeyWarningTitle"]()}
                        </Alert.Title>
                        <Alert.Description>
                          {m[
                            "tools.csrGenerator.privateKeyWarningDescription"
                          ]()}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                    <KeyMaterial
                      title={m["tools.csrGenerator.privateKeyTitle"]()}
                      description={m[
                        "tools.csrGenerator.privateKeyDescription"
                      ]()}
                      value={result.privateKeyPem}
                      name="private-key.pem"
                      copyLabel={m["tools.csrGenerator.copyPrivateKeyLabel"]()}
                      copiedLabel={m["common.actions.copied"]()}
                      downloadLabel={m[
                        "tools.csrGenerator.downloadPrivateKeyLabel"
                      ]()}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-default/20 p-6 text-center">
                <FileText aria-hidden className="size-6 text-muted" />
                <div className="grid gap-1">
                  <p className="text-sm font-medium">
                    {m["tools.csrGenerator.emptyTitle"]()}
                  </p>
                  <p className="text-sm text-muted">
                    {m["tools.csrGenerator.emptyDescription"]()}
                  </p>
                </div>
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.csrGenerator.whatTitle"]()}</h2>
        <p>{m["tools.csrGenerator.whatBody"]()}</p>
        <p>{m["tools.csrGenerator.whatBody2"]()}</p>
        <h2>{m["tools.csrGenerator.whenTitle"]()}</h2>
        <ul>
          {[
            m["tools.csrGenerator.whenItems0"](),
            m["tools.csrGenerator.whenItems1"](),
            m["tools.csrGenerator.whenItems2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.csrGenerator.fillTitle"]()}</h2>
        <ul>
          {[
            m["tools.csrGenerator.fillItems0"](),
            m["tools.csrGenerator.fillItems1"](),
            m["tools.csrGenerator.fillItems2"](),
            m["tools.csrGenerator.fillItems3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["shared.bcryptTools.generatorArticleNotesTitle"]()}</h2>
        <ul>
          {[
            m["tools.csrGenerator.keepItems0"](),
            m["tools.csrGenerator.keepItems1"](),
            m["tools.csrGenerator.keepItems2"](),
            m["tools.csrGenerator.keepItems3"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function CsrGenerator() {
  return (
    <ToolPage>
      <CsrGeneratorContent />
    </ToolPage>
  );
}
