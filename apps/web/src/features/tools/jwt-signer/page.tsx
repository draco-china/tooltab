import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Switch,
  TextArea,
} from "@heroui/react";
import {
  Download,
  FileJson2,
  Lock,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { JoseToolError, jsonObject } from "@workspace/tools/crypto/jose-common";
import type { JoseResult } from "../jose-tools/jobs";
import { JWT_ALGORITHMS, type JwtAlgorithm } from "@workspace/tools/crypto/jwt";
import { runJose } from "../jose-tools/worker-client";

type KeyFormat = "secret" | "pem" | "jwk";
type NumericDateValue =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; value: number };
type SignedResult = Extract<JoseResult, { algorithm: JwtAlgorithm }>;

const DEFAULT_PAYLOAD = `{
  "sub": "user_123",
  "name": "Ada Lovelace",
  "role": "admin",
  "iat": 1713139200
}`;
const DEFAULT_HEADER = `{
  "kid": "local-demo-key"
}`;
const SAMPLE_SECRET = "correct horse battery staple";
const EXPIRATION_OFFSETS = [
  [900, m["tools.jwtSigner.expQuick15m"]],
  [3600, m["tools.jwtSigner.expQuick1h"]],
  [86400, m["tools.jwtSigner.expQuick24h"]],
  [604800, m["tools.jwtSigner.expQuick7d"]],
] as const;

function JwtSignerToolContent() {
  const ids = {
    payload: useId(),
    header: useId(),
    iat: useId(),
    exp: useId(),
    algorithm: useId(),
    keyFormat: useId(),
    key: useId(),
  };
  const controllerRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const downloadUrlRef = useRef("");
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [header, setHeader] = useState(DEFAULT_HEADER);
  const [algorithm, setAlgorithm] = useState<JwtAlgorithm>("HS256");
  const [keyFormat, setKeyFormat] = useState<KeyFormat>("secret");
  const [key, setKey] = useState(SAMPLE_SECRET);
  const [useCurrentIat, setUseCurrentIat] = useState(true);
  const [relativeExpOffset, setRelativeExpOffset] = useState<number | null>(
    null,
  );
  const [nowSeconds, setNowSeconds] = useState<number | null>(null);
  const [result, setResult] = useState<SignedResult | null>(null);
  const [error, setError] = useState("");
  const [isSigning, setIsSigning] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");

  const invalidate = useCallback(() => {
    revisionRef.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
    revokeUrl(downloadUrlRef);
    setDownloadUrl("");
    setResult(null);
    setError("");
    setIsSigning(false);
  }, []);

  useEffect(() => {
    if (!useCurrentIat && relativeExpOffset === null) {
      setNowSeconds(null);
      return;
    }
    const update = () => setNowSeconds(currentUnixSeconds());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [relativeExpOffset, useCurrentIat]);

  useEffect(
    () => () => {
      revisionRef.current++;
      controllerRef.current?.abort();
      controllerRef.current = null;
      revokeUrl(downloadUrlRef);
    },
    [],
  );

  const payloadError = validateObject(
    payload,
    m["tools.jwtSigner.errorInvalidPayloadJson"](),
    m["tools.jwtSigner.errorPayloadMustBeObject"](),
  );
  const headerError = validateObject(
    header || "{}",
    m["tools.jwtSigner.errorInvalidHeaderJson"](),
    m["tools.jwtSigner.errorHeaderMustBeObject"](),
  );
  const iatValue = useMemo(() => numericDateClaim(payload, "iat"), [payload]);
  const expValue = useMemo(() => numericDateClaim(payload, "exp"), [payload]);
  const iatSigningValue: NumericDateValue = useCurrentIat
    ? nowSeconds === null
      ? iatValue
      : { status: "valid", value: nowSeconds }
    : iatValue;
  const expSigningValue = expirationSigningValue(
    expValue,
    iatValue,
    relativeExpOffset,
    useCurrentIat,
    nowSeconds,
  );
  const expInputValue =
    expValue.status === "valid" ? formatDateTimeLocal(expValue.value) : "";

  function changePayload(value: string) {
    invalidate();
    if (
      relativeExpOffset !== null &&
      !sameNumericDate(expValue, numericDateClaim(value, "exp"))
    ) {
      setRelativeExpOffset(null);
    }
    setPayload(value);
  }

  function updatePayload(
    update: (value: Record<string, unknown>) => Record<string, unknown>,
  ) {
    try {
      setPayload(`${JSON.stringify(update(jsonObject(payload)), null, 2)}\n`);
    } catch {
      // Helpers are disabled while the payload is invalid.
    }
  }

  function changeExpiration(value: string) {
    invalidate();
    setRelativeExpOffset(null);
    if (!value) {
      updatePayload((current) => {
        const next = { ...current };
        delete next.exp;
        return next;
      });
      return;
    }
    const seconds = Math.floor(new Date(value).getTime() / 1000);
    if (Number.isFinite(seconds))
      updatePayload((current) => ({ ...current, exp: seconds }));
  }

  function applyExpirationOffset(offset: number) {
    invalidate();
    setRelativeExpOffset(offset);
    updatePayload((current) => ({
      ...current,
      exp:
        (useCurrentIat ||
        typeof current.iat !== "number" ||
        !Number.isFinite(current.iat)
          ? currentUnixSeconds()
          : Math.trunc(current.iat)) + offset,
    }));
  }

  function changeAlgorithm(value: string) {
    if (!JWT_ALGORITHMS.includes(value as JwtAlgorithm)) return;
    invalidate();
    const next = value as JwtAlgorithm;
    setAlgorithm(next);
    const formats = keyFormats(next);
    if (!formats.includes(keyFormat)) {
      setKeyFormat(formats[0]);
      setKey("");
    }
  }

  function loadSample() {
    invalidate();
    setPayload(
      setNumericDate(DEFAULT_PAYLOAD, "iat", currentUnixSeconds()) ??
        DEFAULT_PAYLOAD,
    );
    setHeader(DEFAULT_HEADER);
    setAlgorithm("HS256");
    setKeyFormat("secret");
    setKey(SAMPLE_SECRET);
    setUseCurrentIat(true);
    setRelativeExpOffset(null);
  }

  function reset() {
    invalidate();
    setPayload("");
    setHeader("{}");
    setAlgorithm("HS256");
    setKeyFormat("secret");
    setKey("");
    setUseCurrentIat(true);
    setRelativeExpOffset(null);
  }

  async function sign() {
    invalidate();
    const revision = revisionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsSigning(true);
    try {
      const output = await runJose(
        {
          mode: "sign",
          options: {
            payload,
            header,
            key,
            keyFormat,
            algorithm,
            iatNow: useCurrentIat,
            expirationOffset: relativeExpOffset,
            now: currentUnixSeconds(),
          },
        },
        controller.signal,
      );
      if (
        revision !== revisionRef.current ||
        controller.signal.aborted ||
        !("algorithm" in output)
      )
        return;
      const signed = output as SignedResult;
      setResult(signed);
      setPayload(signed.payloadJson);
      const url = URL.createObjectURL(
        new Blob([`${signed.token}\n`], { type: "text/plain;charset=utf-8" }),
      );
      downloadUrlRef.current = url;
      setDownloadUrl(url);
    } catch (caught) {
      if (revision === revisionRef.current && !controller.signal.aborted) {
        const code =
          caught instanceof JoseToolError ? caught.code : "sign_failed";
        setError(localizedError(code, algorithm, keyFormat));
      }
    } finally {
      if (revision === revisionRef.current) {
        controllerRef.current = null;
        setIsSigning(false);
      }
    }
  }

  const payloadValues = {
    payload,
    header,
    useCurrentIat,
    relativeExpOffset,
    expInputValue,
    payloadError,
    headerError,
    iatValue,
    iatSigningValue,
    expValue,
    expSigningValue,
  };

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <PayloadCard
          ids={ids}
          values={payloadValues}
          onPayloadChange={changePayload}
          onHeaderChange={(value) => {
            invalidate();
            setHeader(value);
          }}
          onIatChange={(value) => {
            invalidate();
            setUseCurrentIat(value);
          }}
          onExpirationChange={changeExpiration}
          onExpirationOffset={applyExpirationOffset}
        />
        <SigningCard
          ids={ids}
          algorithm={algorithm}
          keyFormat={keyFormat}
          signingKey={key}
          canSign={Boolean(
            !payloadError && !headerError && key.trim() && !isSigning,
          )}
          isSigning={isSigning}
          onAlgorithmChange={changeAlgorithm}
          onKeyFormatChange={(value) => {
            invalidate();
            setKeyFormat(value);
          }}
          onKeyChange={(value) => {
            invalidate();
            setKey(value);
          }}
          onLoadSample={loadSample}
          onReset={reset}
          onSign={() => void sign()}
        />
        <Alert status="warning">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {m["tools.jwtSigner.securityNoteTitle"]()}
            </Alert.Title>
            <Alert.Description>
              {m["tools.jwtSigner.securityNoteDescription"]()}
            </Alert.Description>
          </Alert.Content>
        </Alert>
        <ResultCard result={result} error={error} downloadUrl={downloadUrl} />
      </div>
      <SignerArticle />
    </div>
  );
}

type PayloadValues = {
  payload: string;
  header: string;
  useCurrentIat: boolean;
  relativeExpOffset: number | null;
  expInputValue: string;
  payloadError: string;
  headerError: string;
  iatValue: NumericDateValue;
  iatSigningValue: NumericDateValue;
  expValue: NumericDateValue;
  expSigningValue: NumericDateValue;
};

function PayloadCard({
  ids,
  values,
  onPayloadChange,
  onHeaderChange,
  onIatChange,
  onExpirationChange,
  onExpirationOffset,
}: {
  ids: Record<string, string>;
  values: PayloadValues;
  onPayloadChange: (value: string) => void;
  onHeaderChange: (value: string) => void;
  onIatChange: (value: boolean) => void;
  onExpirationChange: (value: string) => void;
  onExpirationOffset: (offset: number) => void;
}) {
  const payloadInvalid = Boolean(values.payloadError);
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.jwtSigner.payloadCardTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.jwtSigner.payloadCardDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        <LabeledArea
          id={ids.payload ?? ""}
          label={m["shared.joseTools.payload"]()}
          value={values.payload}
          placeholder={m["tools.jwtSigner.payloadPlaceholder"]()}
          invalid={payloadInvalid}
          error={values.payloadError}
          minHeight="min-h-52"
          onChange={onPayloadChange}
        />
        <div className="flex items-center gap-3 text-sm font-medium text-muted">
          <span className="h-px flex-1 bg-separator" />
          {m["tools.jwtSigner.claimsHelperTitle"]()}
          <span className="h-px flex-1 bg-separator" />
        </div>
        <p className="text-sm text-muted">
          {m["tools.jwtSigner.claimsHelperDescription"]()}
        </p>
        <div className="grid gap-4">
          <Switch
            id={ids.iat}
            aria-label={m["tools.jwtSigner.iatNowLabel"]()}
            isSelected={values.useCurrentIat}
            isDisabled={payloadInvalid}
            onChange={onIatChange}
          >
            <Switch.Content className="flex min-h-11 items-center gap-3">
              <Switch.Control className="shrink-0">
                <Switch.Thumb />
              </Switch.Control>
              <span className="grid gap-1">
                <span className="text-sm font-medium text-foreground">
                  {m["tools.jwtSigner.iatNowLabel"]()}
                </span>
                <span className="text-sm text-muted">
                  {m["tools.jwtSigner.iatNowDescription"]()}
                </span>
                <ClaimValues
                  payloadValue={values.iatValue}
                  signingValue={values.iatSigningValue}
                />
              </span>
            </Switch.Content>
          </Switch>
          <div className="grid gap-2">
            <Label htmlFor={ids.exp}>{m["tools.jwtSigner.expLabel"]()}</Label>
            <Input
              id={ids.exp}
              type="datetime-local"
              step={1}
              value={values.expInputValue}
              disabled={payloadInvalid}
              aria-invalid={values.expValue.status === "invalid"}
              className="bg-field-background min-h-11 rounded-xl border border-border"
              onChange={(event) =>
                onExpirationChange(event.currentTarget.value)
              }
            />
            <div className="flex flex-wrap gap-2">
              {EXPIRATION_OFFSETS.map(([offset, message]) => (
                <Button
                  key={offset}
                  type="button"
                  size="sm"
                  variant={
                    values.relativeExpOffset === offset ? "primary" : "outline"
                  }
                  aria-pressed={values.relativeExpOffset === offset}
                  isDisabled={payloadInvalid}
                  onPress={() => onExpirationOffset(offset)}
                >
                  {message()}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isDisabled={
                  payloadInvalid || values.expValue.status === "missing"
                }
                onPress={() => onExpirationChange("")}
              >
                {m["common.clear"]()}
              </Button>
            </div>
            <p className="text-sm text-muted">
              {m["tools.jwtSigner.expDescription"]()}
            </p>
            <ClaimValues
              payloadValue={values.expValue}
              signingValue={values.expSigningValue}
            />
            {values.expValue.status === "invalid" ? (
              <p role="alert" className="text-sm text-danger">
                {m["tools.jwtSigner.claimInvalidValueLabel"]()}
              </p>
            ) : null}
          </div>
          {payloadInvalid ? (
            <p className="text-sm text-danger">
              {m["tools.jwtSigner.claimsInvalidPayloadMessage"]()}
            </p>
          ) : null}
        </div>
        <LabeledArea
          id={ids.header ?? ""}
          label={m["tools.jwtSigner.headerLabel"]()}
          description={m["tools.jwtSigner.headerDescription"]()}
          value={values.header}
          placeholder={m["tools.jwtSigner.headerPlaceholder"]()}
          invalid={Boolean(values.headerError)}
          error={values.headerError}
          minHeight="min-h-28"
          onChange={onHeaderChange}
        />
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function LabeledArea({
  id,
  label,
  description,
  value,
  placeholder,
  invalid,
  error,
  minHeight,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  placeholder: string;
  invalid: boolean;
  error: string;
  minHeight: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <TextArea
        id={id}
        value={value}
        aria-invalid={invalid}
        spellCheck={false}
        autoCapitalize="none"
        placeholder={placeholder}
        className={`${minHeight} bg-field-background resize-y rounded-xl border border-border font-mono text-sm`}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {description ? <p className="text-sm text-muted">{description}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SigningCard({
  ids,
  algorithm,
  keyFormat,
  signingKey,
  canSign,
  isSigning,
  onAlgorithmChange,
  onKeyFormatChange,
  onKeyChange,
  onLoadSample,
  onReset,
  onSign,
}: {
  ids: Record<string, string>;
  algorithm: JwtAlgorithm;
  keyFormat: KeyFormat;
  signingKey: string;
  canSign: boolean;
  isSigning: boolean;
  onAlgorithmChange: (value: string) => void;
  onKeyFormatChange: (value: KeyFormat) => void;
  onKeyChange: (value: string) => void;
  onLoadSample: () => void;
  onReset: () => void;
  onSign: () => void;
}) {
  const isHmac = algorithm.startsWith("HS");
  const keyLabel =
    keyFormat === "jwk"
      ? m["tools.jwtSigner.keyLabelJwk"]()
      : isHmac
        ? m["tools.jwtSigner.keyLabelSecret"]()
        : m["common.certPrivate"]();
  const keyDescription =
    keyFormat === "jwk"
      ? m["tools.jwtSigner.keyDescriptionJwk"]()
      : isHmac
        ? m["tools.jwtSigner.keyDescriptionSecret"]()
        : m["tools.jwtSigner.keyDescriptionPrivate"]();
  const keyPlaceholder =
    keyFormat === "jwk"
      ? m["tools.jwtSigner.keyPlaceholderJwk"]()
      : isHmac
        ? m["tools.jwtSigner.keyPlaceholderSecret"]()
        : m["tools.csrGenerator.importPlaceholder"]();
  return (
    <ToolPanelCard>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid min-w-0 gap-1">
          <Card.Title>{m["tools.jwtSigner.optionsCardTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.jwtSigner.optionsCardDescription"]()}
          </Card.Description>
        </div>
        <Button type="button" variant="ghost" size="sm" onPress={onLoadSample}>
          <Sparkles aria-hidden className="size-4" />
          {m["shared.baseEncoding.base58EncoderLoadSampleLabel"]()}
        </Button>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        <SignerSelect
          id={ids.algorithm ?? ""}
          label={m["common.argonAlgorithm"]()}
          value={algorithm}
          options={JWT_ALGORITHMS.map((item) => [item, item] as const)}
          onChange={onAlgorithmChange}
        />
        <p className="text-sm text-muted">
          {isHmac
            ? m["tools.jwtSigner.hmacNote"]()
            : m["tools.jwtSigner.privateKeyNote"]()}
        </p>
        <SignerSelect
          id={ids.keyFormat ?? ""}
          label={m["shared.joseTools.keyFormat"]()}
          value={keyFormat}
          options={keyFormats(algorithm).map(
            (item) =>
              [
                item,
                item === "secret"
                  ? m["tools.jwtSigner.keyFormatSecret"]()
                  : item === "pem"
                    ? m["tools.jwtSigner.keyFormatPem"]()
                    : m["tools.jwtSigner.keyFormatJwk"](),
              ] as const,
          )}
          onChange={(value) => {
            if (value === "secret" || value === "pem" || value === "jwk")
              onKeyFormatChange(value);
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor={ids.key}>{keyLabel}</Label>
          {isHmac && keyFormat === "secret" ? (
            <ToolPasswordInput
              id={ids.key}
              value={signingKey}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={keyPlaceholder}
              showLabel={m["tools.jwtSigner.showSecretLabel"]()}
              hideLabel={m["tools.jwtSigner.hideSecretLabel"]()}
              onChange={(event) => onKeyChange(event.currentTarget.value)}
            />
          ) : (
            <TextArea
              id={ids.key}
              value={signingKey}
              spellCheck={false}
              autoCapitalize="none"
              placeholder={keyPlaceholder}
              className="bg-field-background min-h-44 resize-y rounded-xl border border-border font-mono text-sm"
              onChange={(event) => onKeyChange(event.currentTarget.value)}
            />
          )}
          <p className="text-sm text-muted">{keyDescription}</p>
        </div>
      </ToolPanelCardContent>
      <ToolPanelCardFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button type="button" variant="ghost" size="sm" onPress={onReset}>
            <RefreshCcw aria-hidden className="size-4" />
            {m["common.actions.reset"]()}
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto"
          isDisabled={!canSign}
          onPress={onSign}
        >
          {isSigning ? (
            <Spinner size="sm" />
          ) : (
            <Lock aria-hidden className="size-4" />
          )}
          {isSigning
            ? m["tools.jwtSigner.signingButton"]()
            : m["shared.joseTools.sign"]()}
        </Button>
      </ToolPanelCardFooter>
    </ToolPanelCard>
  );
}

function SignerSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      variant="secondary"
      aria-label={label}
      selectedKey={value}
      onSelectionChange={(key) => key != null && onChange(String(key))}
    >
      <Label>{label}</Label>
      <Select.Trigger
        id={id}
        className="bg-field-background min-h-11 border border-border"
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(([item, itemLabel]) => (
            <ListBox.Item key={item} id={item} textValue={itemLabel}>
              {itemLabel}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function ResultCard({
  result,
  error,
  downloadUrl,
}: {
  result: SignedResult | null;
  error: string;
  downloadUrl: string;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Card.Title>{m["tools.jwtSigner.resultCardTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.jwtSigner.resultCardDescription"]()}
          </Card.Description>
        </div>
        <ToolPanelActionGroup className="shrink-0 sm:justify-end">
          <ToolCopyButton
            value={result?.token ?? ""}
            copyLabel={m["tools.jwtSigner.copyTokenLabel"]()}
            copiedLabel={m["common.actions.copied"]()}
            disabled={!result}
            variant="ghost"
          />
          {downloadUrl ? (
            <a
              href={downloadUrl}
              download="jwt.txt"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <Download aria-hidden className="size-4" />
              {m["common.actions.download"]()}
            </a>
          ) : (
            <Button type="button" variant="outline" size="sm" isDisabled>
              <Download aria-hidden className="size-4" />
              {m["common.actions.download"]()}
            </Button>
          )}
        </ToolPanelActionGroup>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        {error ? (
          <Alert status="danger" role="alert">
            <Alert.Indicator>
              <TriangleAlert aria-hidden className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>{m["tools.jwtSigner.errorTitle"]()}</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {result ? (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {m["tools.jwtSigner.tokenLabel"]()}
                </span>
                <Chip size="sm" variant="secondary">
                  {result.algorithm}
                </Chip>
              </div>
              <TextArea
                readOnly
                aria-label={m["tools.jwtSigner.tokenLabel"]()}
                value={result.token}
                className="bg-field-background min-h-36 resize-y rounded-xl border border-border font-mono text-sm break-all"
              />
            </div>
            <div className="grid gap-3">
              <h3 className="text-sm font-medium">
                {m["tools.jwtSigner.detailsTitle"]()}
              </h3>
              <PreviewBlock
                label={m["tools.jwtDecoderVerifier.decodedHeaderTitle"]()}
                value={result.headerJson}
              />
              <PreviewBlock
                label={m["tools.jwtDecoderVerifier.decodedPayloadTitle"]()}
                value={result.payloadJson}
              />
              <PreviewBlock
                label={m["tools.jwtSigner.signaturePreviewLabel"]()}
                value={result.signature}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-default p-3">
              <FileJson2 aria-hidden className="size-5" />
            </div>
            <div className="grid gap-1">
              <p className="font-medium">
                {m["tools.jwtSigner.emptyResultTitle"]()}
              </p>
              <p className="max-w-md text-sm text-muted">
                {m["tools.jwtSigner.emptyResultDescription"]()}
              </p>
            </div>
          </div>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PreviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <pre className="max-h-48 overflow-auto rounded-xl border border-border bg-default/40 p-3 text-xs leading-relaxed break-all whitespace-pre-wrap">
        {value}
      </pre>
    </div>
  );
}

function ClaimValues({
  payloadValue,
  signingValue,
}: {
  payloadValue: NumericDateValue;
  signingValue: NumericDateValue;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      <span>
        {m["tools.jwtSigner.claimCurrentValueLabel"]()}:{" "}
        <code>{formatClaim(payloadValue)}</code>
      </span>
      <span>
        {m["tools.jwtSigner.claimSigningValueLabel"]()}:{" "}
        <code>{formatClaim(signingValue)}</code>
      </span>
    </div>
  );
}

function SignerArticle() {
  const [beforeToken, afterToken] = m[
    "tools.jwtSigner.articleWhatBody"
  ]().split("header.payload.signature");
  return (
    <ToolArticle>
      <h2>{m["tools.jwtSigner.articleWhatTitle"]()}</h2>
      <p>
        {beforeToken}
        <code>header.payload.signature</code>
        {afterToken}
      </p>
      <h2>{m["shared.argon2Tools.verifierArticleWhenTitle"]()}</h2>
      <ul>
        {[
          m["tools.jwtSigner.articleWhenItems0"](),
          m["tools.jwtSigner.articleWhenItems1"](),
          m["tools.jwtSigner.articleWhenItems2"](),
          m["tools.jwtSigner.articleWhenItems3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{m["tools.jwtSigner.articleCheckTitle"]()}</h2>
      <ul>
        {[
          m["tools.jwtSigner.articleCheckItems0"](),
          m["tools.jwtSigner.articleCheckItems1"](),
          m["tools.jwtSigner.articleCheckItems2"](),
          m["tools.jwtSigner.articleCheckItems3"](),
        ].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </ToolArticle>
  );
}

function validateObject(
  input: string,
  invalid: string,
  objectRequired: string,
) {
  try {
    jsonObject(input);
    return "";
  } catch (error) {
    return error instanceof JoseToolError && error.code === "object_required"
      ? objectRequired
      : invalid;
  }
}

function numericDateClaim(
  text: string,
  claim: "iat" | "exp",
): NumericDateValue {
  try {
    const value = jsonObject(text)[claim];
    if (value === undefined) return { status: "missing" };
    if (typeof value !== "number" || !Number.isFinite(value))
      return { status: "invalid" };
    return { status: "valid", value: Math.trunc(value) };
  } catch {
    return { status: "invalid" };
  }
}

function setNumericDate(text: string, claim: "iat" | "exp", value: number) {
  try {
    return `${JSON.stringify({ ...jsonObject(text), [claim]: Math.trunc(value) }, null, 2)}\n`;
  } catch {
    return null;
  }
}

function expirationSigningValue(
  exp: NumericDateValue,
  iat: NumericDateValue,
  offset: number | null,
  useCurrentIat: boolean,
  now: number | null,
): NumericDateValue {
  if (offset === null) return exp;
  if (iat.status === "valid" && !useCurrentIat)
    return { status: "valid", value: iat.value + offset };
  return now === null
    ? { status: "missing" }
    : { status: "valid", value: now + offset };
}

function sameNumericDate(left: NumericDateValue, right: NumericDateValue) {
  return (
    left.status === right.status &&
    (left.status !== "valid" ||
      (right.status === "valid" && left.value === right.value))
  );
}

function currentUnixSeconds() {
  return Math.floor(Date.now() / 1000);
}

function formatDateTimeLocal(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatClaim(value: NumericDateValue) {
  if (value.status === "valid") return String(value.value);
  return value.status === "missing"
    ? m["tools.jwtSigner.claimNotSetLabel"]()
    : m["tools.jwtSigner.claimInvalidValueLabel"]();
}

function keyFormats(algorithm: JwtAlgorithm): KeyFormat[] {
  return algorithm.startsWith("HS") ? ["secret", "jwk"] : ["pem", "jwk"];
}

function localizedError(
  code: string,
  algorithm: JwtAlgorithm,
  keyFormat: KeyFormat,
) {
  switch (code) {
    case "key_required":
      return m["tools.jwtSigner.errorKeyRequired"]();
    case "unsupported_algorithm":
      return m["tools.jwtSigner.errorUnsupportedAlgorithm"]();
    case "invalid_json":
    case "object_required":
      return keyFormat === "jwk"
        ? m["tools.jwtSigner.errorInvalidJwk"]()
        : m["tools.jwtSigner.errorSigningFailed"]();
    case "invalid_key":
      return keyFormat === "jwk"
        ? m["tools.jwtSigner.errorInvalidJwk"]()
        : keyFormat === "pem"
          ? m["tools.jwtSigner.errorInvalidPem"]()
          : m["tools.jwtSigner.errorSigningFailed"]();
    case "key_mismatch":
      return algorithm.startsWith("HS")
        ? m["tools.jwtSigner.errorSecretKeyFormat"]()
        : m["tools.jwtSigner.errorPrivateKeyFormat"]();
    default:
      return m["tools.jwtSigner.errorSigningFailed"]();
  }
}

function revokeUrl(reference: { current: string }) {
  if (!reference.current) return;
  URL.revokeObjectURL(reference.current);
  reference.current = "";
}

export default function JwtSignerTool() {
  return (
    <ToolPage>
      <JwtSignerToolContent />
    </ToolPage>
  );
}
