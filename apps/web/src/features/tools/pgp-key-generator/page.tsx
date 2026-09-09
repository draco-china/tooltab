import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Skeleton,
  Spinner,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Download, Lock, RefreshCcw, TriangleAlert } from "lucide-react";
import {
  type ComponentProps,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import type {
  PgpOptions,
  PgpResult,
} from "@workspace/tools/crypto/pgp-contract";
import {
  MAX_EXPIRATION_DAYS,
  PGP_RSA_SIZES,
  pgpKeySchema,
  PgpToolError,
} from "@workspace/tools/crypto/pgp-contract";
import { runPgp } from "./worker-client";

const DEFAULTS = pgpKeySchema.parse({});

function PgpKeyGeneratorContent() {
  const locale = getLocale();
  const task = usePgpTask(locale);
  const [form, setForm] = useState(DEFAULTS);
  const [expirationDays, setExpirationDays] = useState(
    String(DEFAULTS.expirationDays),
  );
  const [passphraseVisible, setPassphraseVisible] = useState(false);
  const ids = {
    name: useId(),
    email: useId(),
    comment: useId(),
    passphrase: useId(),
    expiration: useId(),
  };
  const expirationNumber = Number(expirationDays);
  const expirationInvalid =
    expirationDays.trim() === "" ||
    !Number.isInteger(expirationNumber) ||
    expirationNumber < 0 ||
    expirationNumber > MAX_EXPIRATION_DAYS;
  const hasIdentity = form.name.trim() !== "" || form.email.trim() !== "";
  const canGenerate = hasIdentity && !expirationInvalid && !task.busy;

  function edit(patch: Partial<PgpOptions>) {
    task.clear();
    setForm((current) => ({ ...current, ...patch }));
  }

  function reset() {
    task.clear();
    setForm(DEFAULTS);
    setExpirationDays(String(DEFAULTS.expirationDays));
    setPassphraseVisible(false);
  }

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasIdentity) {
      task.fail(
        m["tools.pgpKeyGenerator.identityRequiredHint"]({}, { locale }),
      );
      return;
    }
    if (expirationInvalid) {
      task.fail(
        m["tools.pgpKeyGenerator.expirationInvalidError"]({}, { locale }),
      );
      return;
    }
    void task.run({ ...form, expirationDays: expirationNumber });
  }

  return (
    <div className="grid gap-8">
      <form
        className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]"
        onSubmit={generate}
      >
        <div className="grid gap-6">
          <IdentityCard
            locale={locale}
            form={form}
            ids={ids}
            passphraseVisible={passphraseVisible}
            onEdit={edit}
            onTogglePassphrase={() =>
              setPassphraseVisible((current) => !current)
            }
          />
          <SecurityCard
            algorithm={form.algorithm}
            canGenerate={canGenerate}
            locale={locale}
            expirationDays={expirationDays}
            expirationId={ids.expiration}
            expirationInvalid={expirationInvalid}
            hasResult={task.result !== null}
            isGenerating={task.busy}
            rsaSize={form.rsaSize}
            onAlgorithmChange={(algorithm) => edit({ algorithm })}
            onExpirationDaysChange={(value) => {
              task.clear();
              setExpirationDays(value);
            }}
            onReset={reset}
            onRsaSizeChange={(rsaSize) => edit({ rsaSize })}
          />
        </div>
        <div className="min-w-0 self-start xl:sticky xl:top-6">
          <ResultCard locale={locale} task={task} />
        </div>
      </form>
      <PgpArticle locale={locale} />
    </div>
  );
}

function IdentityCard({
  locale,
  form,
  ids,
  passphraseVisible,
  onEdit,
  onTogglePassphrase,
}: {
  locale: "zh-CN" | "en-US";
  form: PgpOptions;
  ids: Readonly<Record<"name" | "email" | "comment" | "passphrase", string>>;
  passphraseVisible: boolean;
  onEdit: (patch: Partial<PgpOptions>) => void;
  onTogglePassphrase: () => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.pgpKeyGenerator.identityTitle"]({}, { locale })}
        </Card.Title>
        <Card.Description>
          {m["tools.pgpKeyGenerator.identityDescription"]({}, { locale })}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-4 py-4">
        <LabeledInput
          id={ids.name}
          label={m["tools.pgpKeyGenerator.name"]({}, { locale })}
          name="name"
          value={form.name}
          autoComplete="name"
          placeholder={m["tools.pgpKeyGenerator.namePlaceholder"](
            {},
            { locale },
          )}
          onChange={(value) => onEdit({ name: value })}
        />
        <LabeledInput
          id={ids.email}
          label={m["shared.qrTools.email"]({}, { locale })}
          name="email"
          type="email"
          value={form.email}
          autoComplete="email"
          placeholder={m["tools.pgpKeyGenerator.emailPlaceholder"](
            {},
            { locale },
          )}
          description={m["tools.pgpKeyGenerator.identityRequiredHint"](
            {},
            { locale },
          )}
          onChange={(value) => onEdit({ email: value })}
        />
        <LabeledInput
          id={ids.comment}
          label={m["tools.pgpKeyGenerator.commentLabel"]({}, { locale })}
          name="comment"
          value={form.comment}
          autoComplete="off"
          placeholder={m["tools.pgpKeyGenerator.commentPlaceholder"](
            {},
            { locale },
          )}
          onChange={(value) => onEdit({ comment: value })}
        />
        <div className="grid gap-2">
          <Label htmlFor={ids.passphrase}>
            {m["tools.pgpKeyGenerator.passphraseLabel"]({}, { locale })}
          </Label>
          <ToolPasswordInput
            id={ids.passphrase}
            name="passphrase"
            value={form.passphrase}
            autoComplete="new-password"
            placeholder={m["tools.pgpKeyGenerator.passphrasePlaceholder"](
              {},
              { locale },
            )}
            spellCheck={false}
            groupClassName="min-h-11 rounded-xl border border-border bg-field-background"
            showLabel={m["tools.pgpKeyGenerator.showSecretLabel"](
              {},
              { locale },
            )}
            hideLabel={m["tools.pgpKeyGenerator.hideSecretLabel"](
              {},
              { locale },
            )}
            isVisible={passphraseVisible}
            onVisibilityChange={onTogglePassphrase}
            onChange={(event) => onEdit({ passphrase: event.target.value })}
          />
          <p className="text-sm leading-6 text-muted">
            {m["tools.pgpKeyGenerator.passphraseDescription"]({}, { locale })}
          </p>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function LabeledInput({
  description,
  id,
  label,
  onChange,
  ...props
}: {
  description?: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
} & Omit<ComponentProps<typeof Input>, "id" | "onChange">) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...props}
        id={id}
        aria-label={label}
        className="bg-field-background min-h-11 rounded-xl border border-border"
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? (
        <p className="text-sm leading-6 text-muted">{description}</p>
      ) : null}
    </div>
  );
}

function SecurityCard({
  algorithm,
  canGenerate,
  locale,
  expirationDays,
  expirationId,
  expirationInvalid,
  hasResult,
  isGenerating,
  rsaSize,
  onAlgorithmChange,
  onExpirationDaysChange,
  onReset,
  onRsaSizeChange,
}: {
  algorithm: PgpOptions["algorithm"];
  canGenerate: boolean;
  locale: "zh-CN" | "en-US";
  expirationDays: string;
  expirationId: string;
  expirationInvalid: boolean;
  hasResult: boolean;
  isGenerating: boolean;
  rsaSize: PgpOptions["rsaSize"];
  onAlgorithmChange: (value: PgpOptions["algorithm"]) => void;
  onExpirationDaysChange: (value: string) => void;
  onReset: () => void;
  onRsaSizeChange: (value: PgpOptions["rsaSize"]) => void;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.pgpKeyGenerator.securityTitle"]({}, { locale })}
        </Card.Title>
        <Card.Description>
          {m["tools.pgpKeyGenerator.securityDescription"]({}, { locale })}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-4 py-4">
        <ToggleField
          label={m["common.argonAlgorithm"]({}, { locale })}
          value={algorithm}
          options={[
            ["ecc", m["tools.pgpKeyGenerator.eccLabel"]({}, { locale })],
            ["rsa", m["tools.csrGenerator.algorithmRsa"]({}, { locale })],
          ]}
          onChange={(value) =>
            onAlgorithmChange(value === "rsa" ? "rsa" : "ecc")
          }
        />
        <p className="-mt-3 text-sm leading-6 text-muted">
          {algorithm === "ecc"
            ? m["tools.pgpKeyGenerator.eccDescription"]({}, { locale })
            : m["tools.pgpKeyGenerator.rsaDescription"]({}, { locale })}
        </p>
        {algorithm === "rsa" ? (
          <ToggleField
            label={m["common.pgpSize"]({}, { locale })}
            value={String(rsaSize)}
            options={PGP_RSA_SIZES.map((size) => [String(size), String(size)])}
            onChange={(value) =>
              onRsaSizeChange(Number(value) as PgpOptions["rsaSize"])
            }
          />
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor={expirationId}>
            {m["tools.pgpKeyGenerator.expirationDaysLabel"]({}, { locale })}
          </Label>
          <Input
            id={expirationId}
            name="expiration-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_EXPIRATION_DAYS}
            step={1}
            value={expirationDays}
            aria-invalid={expirationInvalid}
            autoComplete="off"
            placeholder={m["tools.pgpKeyGenerator.expirationDaysPlaceholder"](
              {},
              { locale },
            )}
            className="bg-field-background min-h-11 rounded-xl border border-border"
            onChange={(event) =>
              onExpirationDaysChange(event.currentTarget.value)
            }
          />
          <p className="text-sm leading-6 text-muted">
            {m["tools.pgpKeyGenerator.expirationDaysDescription"](
              {},
              { locale },
            )}
          </p>
          {expirationInvalid ? (
            <p className="text-sm text-danger" role="alert">
              {m["tools.pgpKeyGenerator.expirationInvalidError"](
                {},
                { locale },
              )}
            </p>
          ) : null}
        </div>
        <Alert role="note">
          <Alert.Indicator>
            <Lock aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.pgpKeyGenerator.privacyNoteTitle"]({}, { locale })}
            </Alert.Title>
            <Alert.Description>
              {m["tools.pgpKeyGenerator.privacyNoteDescription"](
                {},
                { locale },
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex-row flex-wrap justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onPress={onReset}>
          <RefreshCcw aria-hidden className="size-4" />
          {m["common.actions.reset"]({}, { locale })}
        </Button>
        <Button
          type="submit"
          size="sm"
          isDisabled={!canGenerate}
          aria-busy={isGenerating}
        >
          {isGenerating ? <Spinner size="sm" /> : null}
          {isGenerating
            ? m["shared.shortId.busy"]({}, { locale })
            : hasResult
              ? m["common.mnemonicRegenerate"]({}, { locale })
              : m["tools.pgpKeyGenerator.generateLabel"]({}, { locale })}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function ToggleField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <ToggleButtonGroup
        selectionMode="single"
        selectedKeys={new Set([value])}
        aria-label={label}
        className="flex w-full flex-wrap [&_button]:min-h-11 [&_button]:flex-1"
        onSelectionChange={(selection) => {
          const next = String([...selection][0] ?? "");
          if (next) onChange(next);
        }}
      >
        {options.map(([option, optionLabel]) => (
          <ToggleButton key={option} id={option}>
            {optionLabel}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

function ResultCard({
  locale,
  task,
}: {
  locale: "zh-CN" | "en-US";
  task: ReturnType<typeof usePgpTask>;
}) {
  const result = task.result;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.pgpKeyGenerator.resultTitle"]({}, { locale })}
        </Card.Title>
        <Card.Description>
          {m["tools.pgpKeyGenerator.resultDescription"]({}, { locale })}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="grid gap-4 py-4">
        <div className="sr-only" role="status" aria-live="polite">
          {task.error
            ? `${m["tools.pgpKeyGenerator.errorTitle"]({}, { locale })}: ${task.error}`
            : task.busy
              ? m["shared.shortId.busy"]({}, { locale })
              : result
                ? m["tools.pgpKeyGenerator.resultDescription"]({}, { locale })
                : m["tools.pgpKeyGenerator.emptyTitle"]({}, { locale })}
        </div>
        {task.error ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {m["tools.pgpKeyGenerator.errorTitle"]({}, { locale })}
              </Alert.Title>
              <Alert.Description>{task.error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {result ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <SummaryItem
                label={m["tools.pgpKeyGenerator.userid"]({}, { locale })}
                value={result.userID}
              />
              <SummaryItem
                label={m["tools.pgpKeyGenerator.keyid"]({}, { locale })}
                value={result.keyID}
              />
              <SummaryItem
                label={m["tools.pgpKeyGenerator.fingerprint"]({}, { locale })}
                value={result.fingerprint}
              />
              <SummaryItem
                label={m["tools.pgpKeyGenerator.protection"]({}, { locale })}
                value={
                  result.passphraseProtected
                    ? m["tools.pgpKeyGenerator.protectedLabel"]({}, { locale })
                    : m["tools.pgpKeyGenerator.unprotectedLabel"](
                        {},
                        { locale },
                      )
                }
              />
              <SummaryItem
                label={m["tools.pgpKeyGenerator.createdat"]({}, { locale })}
                value={result.createdAt}
              />
              <SummaryItem
                label={m["tools.pgpKeyGenerator.expiresat"]({}, { locale })}
                value={
                  result.expiresAt ??
                  m["tools.pgpKeyGenerator.never"]({}, { locale })
                }
              />
            </dl>
            {result.legacyExpiryOverflow ? (
              <Alert status="warning">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {m["tools.pgpKeyGenerator.statesExpirationOverflow"](
                      {},
                      { locale },
                    )}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            <KeyBlock
              locale={locale}
              title={m["common.certPublicKey"]({}, { locale })}
              description={m["tools.pgpKeyGenerator.publicKeyDescription"](
                {},
                { locale },
              )}
              value={result.publicKey}
              fileName="openpgp-public-key.asc"
              onError={() =>
                task.fail(
                  m["tools.pgpKeyGenerator.statesDownloadFailed"](
                    {},
                    { locale },
                  ),
                )
              }
            />
            <KeyBlock
              locale={locale}
              title={m["common.certPrivate"]({}, { locale })}
              description={m["tools.pgpKeyGenerator.privateKeyDescription"](
                {},
                { locale },
              )}
              value={result.privateKey}
              fileName="openpgp-private-key.asc"
              onError={() =>
                task.fail(
                  m["tools.pgpKeyGenerator.statesDownloadFailed"](
                    {},
                    { locale },
                  ),
                )
              }
            />
            <KeyBlock
              locale={locale}
              title={m["tools.pgpKeyGenerator.revocation"]({}, { locale })}
              description={m[
                "tools.pgpKeyGenerator.revocationCertificateDescription"
              ]({}, { locale })}
              value={result.revocationCertificate}
              fileName="openpgp-revocation-certificate.asc"
              onError={() =>
                task.fail(
                  m["tools.pgpKeyGenerator.statesDownloadFailed"](
                    {},
                    { locale },
                  ),
                )
              }
            />
          </>
        ) : task.busy ? (
          <ResultSkeleton />
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-default/20 p-6 text-center">
            <span className="mb-4 grid size-11 place-items-center rounded-full bg-default">
              <Lock aria-hidden className="size-5 text-muted" />
            </span>
            <h3 className="font-medium">
              {m["tools.pgpKeyGenerator.emptyTitle"]({}, { locale })}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              {m["tools.pgpKeyGenerator.emptyDescription"]({}, { locale })}
            </p>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-default/30 p-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-sm break-all">{value}</dd>
    </div>
  );
}

function KeyBlock({
  locale,
  description,
  fileName,
  onError,
  title,
  value,
}: {
  locale: "zh-CN" | "en-US";
  description: string;
  fileName: string;
  onError: () => void;
  title: string;
  value: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="grid gap-3 border-b border-separator bg-default/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <ToolCopyButton
            value={value}
            copyLabel={m["common.actions.copy"]({}, { locale })}
            copiedLabel={m["common.actions.copied"]({}, { locale })}
          />
          <Button
            type="button"
            size="sm"
            onPress={() => downloadText(value, fileName, onError)}
          >
            <Download aria-hidden className="size-4" />
            {m["common.actions.download"]({}, { locale })}
          </Button>
        </div>
      </div>
      <div className="p-4">
        <TextArea
          readOnly
          aria-label={title}
          value={value}
          className="bg-field-background min-h-48 resize-y rounded-xl border border-border font-mono text-xs"
        />
      </div>
    </section>
  );
}

function ResultSkeleton() {
  return (
    <div className="grid gap-5" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton placeholders are never reordered
            key={index}
            className="grid gap-2 rounded-xl border border-border p-3"
          >
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-5 w-full rounded" />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed skeleton placeholders are never reordered
          key={index}
          className="grid gap-3 rounded-xl border border-border p-4"
        >
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function PgpArticle({ locale }: { locale: "zh-CN" | "en-US" }) {
  return (
    <ToolArticle>
      <p>{m["tools.pgpKeyGenerator.articleSummary"]({}, { locale })}</p>
      <h2>{m["tools.archiveViewer.article.whenTitle"]({}, { locale })}</h2>
      <p>{m["tools.pgpKeyGenerator.articleWhenToUseBody"]({}, { locale })}</p>
      <h2>
        {m["tools.pgpKeyGenerator.articleHowToGenerateTitle"]({}, { locale })}
      </h2>
      <p>
        {m["tools.pgpKeyGenerator.articleHowToGenerateBody"]({}, { locale })}
      </p>
      <h2>{m["tools.pgpKeyGenerator.articleKeyTypesTitle"]({}, { locale })}</h2>
      <p>{m["tools.pgpKeyGenerator.articleKeyTypesBody"]({}, { locale })}</p>
      <h2>{m["tools.pgpKeyGenerator.articleHandlingTitle"]({}, { locale })}</h2>
      <p>{m["tools.pgpKeyGenerator.articleHandlingBody"]({}, { locale })}</p>
    </ToolArticle>
  );
}

function usePgpTask(locale: "zh-CN" | "en-US") {
  const [result, setResult] = useState<PgpResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const clear = useCallback(() => {
    invalidate();
    setResult(null);
    setError("");
    setBusy(false);
  }, [invalidate]);

  useEffect(() => invalidate, [invalidate]);

  async function run(options: PgpOptions) {
    clear();
    const currentRevision = revision.current;
    const currentController = new AbortController();
    controller.current = currentController;
    setBusy(true);
    try {
      const nextResult = await runPgp(options, currentController.signal);
      if (currentRevision === revision.current) setResult(nextResult);
    } catch (caught) {
      if (
        currentRevision === revision.current &&
        !currentController.signal.aborted
      ) {
        setError(pgpErrorMessage(caught, locale));
      }
    } finally {
      if (currentRevision === revision.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return {
    result,
    error,
    busy,
    clear,
    run,
    fail: setError,
  };
}

function pgpErrorMessage(error: unknown, locale: "zh-CN" | "en-US") {
  const code = error instanceof PgpToolError ? error.code : "generation_failed";
  const errors: Record<string, string> = {
    invalid_identity: m["tools.pgpKeyGenerator.statesInvalidIdentity"](
      {},
      { locale },
    ),
    invalid_unicode: m["tools.pgpKeyGenerator.statesInvalidUnicode"](
      {},
      { locale },
    ),
    too_large: m["tools.pgpKeyGenerator.statesTooLarge"]({}, { locale }),
    invalid_options: m["tools.pgpKeyGenerator.statesInvalidOptions"](
      {},
      { locale },
    ),
    generation_failed: m["tools.pgpKeyGenerator.statesGenerationFailed"](
      {},
      { locale },
    ),
    worker_failed: m["tools.pgpKeyGenerator.statesWorkerFailed"](
      {},
      { locale },
    ),
    timeout: m["tools.pgpKeyGenerator.statesTimeout"]({}, { locale }),
    busy: m["tools.pgpKeyGenerator.statesBusy"]({}, { locale }),
  };
  return (
    errors[code] ??
    m["tools.pgpKeyGenerator.statesGenerationFailed"]({}, { locale })
  );
}

function downloadText(value: string, fileName: string, onError: () => void) {
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    url = URL.createObjectURL(
      new Blob([value], { type: "application/pgp-keys;charset=utf-8" }),
    );
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
  } catch {
    onError();
  } finally {
    anchor?.remove();
    if (url) URL.revokeObjectURL(url);
  }
}

export default function PgpKeyGenerator() {
  return (
    <ToolPage>
      <PgpKeyGeneratorContent />
    </ToolPage>
  );
}
