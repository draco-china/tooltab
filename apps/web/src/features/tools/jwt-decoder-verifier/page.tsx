import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { CodeBlock } from "@/components/base/code-block";
import {
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  Select,
  Skeleton,
  TextArea,
  TextField,
} from "@heroui/react";
import {
  BadgeCheck,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  fromUrl64,
  JoseToolError,
  MAX_JOSE_INPUT,
  object,
  utf8,
} from "@workspace/tools/crypto/jose-common";
import {
  decodeToken,
  inspectClaims,
  JWT_ALGORITHMS,
} from "@workspace/tools/crypto/jwt";
import { runJose } from "../jose-tools/worker-client";

const SAMPLE_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiJ1c2VyXzEyMyIsIm5hbWUiOiJBZGEgTG92ZWxhY2UiLCJyb2xlIjoiYWRtaW4iLCJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIiwiZXhwIjoxODkzNDU2MDAwfQ." +
  "NCOUWxMCGt2j3YuIY1QpWI7kdGAfeVlwe6mcXjhsmpw";
const SAMPLE_SECRET = "secret";

type JwtAlgorithm = (typeof JWT_ALGORITHMS)[number];
type Algorithm = "auto" | JwtAlgorithm;
type DecodedToken = ReturnType<typeof decodeToken>;
type DecodeError =
  | "empty-token"
  | "invalid-segment-count"
  | "empty-header-or-payload"
  | "invalid-header-base64"
  | "invalid-payload-base64"
  | "invalid-signature-base64"
  | "invalid-header-json"
  | "invalid-payload-json"
  | "header-not-object";
type DecodeState =
  | { ok: true; value: DecodedToken }
  | { ok: false; code: DecodeError };
type VerifyError =
  | "key-required"
  | "missing-algorithm"
  | "unsupported-algorithm"
  | "algorithm-mismatch"
  | "invalid-key-json"
  | "invalid-jwk"
  | "empty-jwks"
  | "jwk-kid-not-found"
  | "unsupported-key-format"
  | "unsupported-pem-label"
  | "key-import-failed"
  | "webcrypto-unavailable";
type VerifyState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "verified" }
  | { status: "failed" }
  | { status: "error"; code: VerifyError };
type ClaimSeverity = "danger" | "neutral" | "success" | "warning";
type ClaimCode =
  | "payload-not-object"
  | "invalid-exp"
  | "invalid-nbf"
  | "invalid-iat"
  | "expired"
  | "not-yet-valid"
  | "issued-in-future"
  | "expires-at"
  | "valid-after"
  | "issued-at";
type ClaimItem = { code: ClaimCode; severity: ClaimSeverity; date?: string };

function JwtDecoderVerifierPageContent() {
  const [token, setToken] = useState(SAMPLE_TOKEN);
  const [keyInput, setKeyInput] = useState(SAMPLE_SECRET);
  const [algorithm, setAlgorithm] = useState<Algorithm>("auto");
  const [verification, setVerification] = useState<VerifyState>({
    status: "pending",
  });
  const deferredToken = useDeferredValue(token);
  const deferredKey = useDeferredValue(keyInput);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const decoded = useMemo(() => decodeForPage(deferredToken), [deferredToken]);
  const claims = useMemo(
    () => (decoded.ok ? getClaimItems(decoded.value) : []),
    [decoded],
  );

  function cancelVerification() {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
  }

  function updateToken(value: string) {
    cancelVerification();
    setVerification({ status: "pending" });
    setToken(value.slice(0, MAX_JOSE_INPUT * 4 + 1));
  }

  function updateKey(value: string) {
    cancelVerification();
    setVerification({ status: "pending" });
    setKeyInput(value.slice(0, MAX_JOSE_INPUT + 1));
  }

  useEffect(() => {
    const currentRevision = ++revision.current;
    controller.current?.abort();
    controller.current = null;

    if (!decoded.ok || !deferredKey.trim()) {
      setVerification({ status: "idle" });
      return;
    }

    const preflightError = getPreflightError(decoded.value, algorithm);
    if (preflightError) {
      setVerification({ status: "error", code: preflightError });
      return;
    }

    const current = new AbortController();
    controller.current = current;
    setVerification({ status: "pending" });
    void runJose(
      {
        mode: "verify",
        options: {
          token: deferredToken,
          key: deferredKey,
          algorithm,
        },
      },
      current.signal,
    )
      .then((result) => {
        if (
          current.signal.aborted ||
          controller.current !== current ||
          revision.current !== currentRevision
        )
          return;
        setVerification({
          status:
            "signatureValid" in result && result.signatureValid
              ? "verified"
              : "failed",
        });
      })
      .catch((error) => {
        if (
          current.signal.aborted ||
          controller.current !== current ||
          revision.current !== currentRevision
        )
          return;
        setVerification({
          status: "error",
          code: mapVerifyError(
            error instanceof JoseToolError ? error.code : "operation_failed",
          ),
        });
      })
      .finally(() => {
        if (controller.current === current) controller.current = null;
      });

    return () => current.abort();
  }, [algorithm, decoded, deferredKey, deferredToken]);

  useEffect(
    () => () => {
      revision.current += 1;
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  function useSample() {
    cancelVerification();
    setVerification({ status: "pending" });
    startTransition(() => {
      setToken(SAMPLE_TOKEN);
      setKeyInput(SAMPLE_SECRET);
      setAlgorithm("auto");
    });
  }

  function clear() {
    cancelVerification();
    setVerification({ status: "idle" });
    startTransition(() => {
      setToken("");
      setKeyInput("");
      setAlgorithm("auto");
    });
  }

  return (
    <div className="grid min-w-0 gap-8">
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ToolPanelCard className="min-w-0">
          <TokenCard
            token={token}
            invalid={!decoded.ok && decoded.code !== "empty-token"}
            onChange={updateToken}
            onClear={clear}
            onUseSample={useSample}
          />
          <VerificationCard
            algorithm={algorithm}
            keyInput={keyInput}
            tokenIsDecoded={decoded.ok}
            state={verification}
            onAlgorithmChange={(value) => {
              cancelVerification();
              setVerification({ status: "pending" });
              setAlgorithm(value);
            }}
            onKeyInputChange={updateKey}
          />
        </ToolPanelCard>
        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <DecodedPanel decoded={decoded} claims={claims} />
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.jwtDecoderVerifier.articleWhatTitle"]()}</h2>
        <p>{m["tools.jwtDecoderVerifier.articleWhatBodyOne"]()}</p>
        <p>{m["tools.jwtDecoderVerifier.articleWhatBodyTwo"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <p>{m["tools.jwtDecoderVerifier.articleWhenBodyOne"]()}</p>
        <p>{m["tools.jwtDecoderVerifier.articleWhenBodyTwo"]()}</p>
        <h2>{m["shared.argon2Tools.verifierArticleSecurityTitle"]()}</h2>
        <p>{m["tools.jwtDecoderVerifier.articleSecurityBodyOne"]()}</p>
        <p>{m["tools.jwtDecoderVerifier.articleSecurityBodyTwo"]()}</p>
      </ToolArticle>
    </div>
  );
}

function TokenCard({
  token,
  invalid,
  onChange,
  onClear,
  onUseSample,
}: {
  token: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onUseSample: () => void;
}) {
  return (
    <>
      <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid min-w-0 gap-1">
          <Card.Title>{m["tools.jwtDecoderVerifier.tokenTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.jwtDecoderVerifier.tokenDescription"]()}
          </Card.Description>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onPress={onUseSample}>
            <Sparkles aria-hidden className="size-4" />
            {m["shared.bcrypt.sample"]()}
          </Button>
          <Button size="sm" variant="ghost" onPress={onClear}>
            <RefreshCcw aria-hidden className="size-4" />
            {m["common.clear"]()}
          </Button>
        </div>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <TextField fullWidth isInvalid={invalid}>
          <Label>{m["tools.jwtDecoderVerifier.tokenLabel"]()}</Label>
          <TextArea
            aria-label={m["tools.jwtDecoderVerifier.tokenLabel"]()}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            dir="ltr"
            name="jwt-token"
            spellCheck={false}
            translate="no"
            value={token}
            onChange={(event) => onChange(event.target.value)}
            placeholder={m["tools.jwtDecoderVerifier.tokenPlaceholder"]()}
            className="min-h-44 w-full resize-y text-left font-mono text-sm"
          />
        </TextField>
      </ToolPanelCardContent>
    </>
  );
}

function VerificationCard({
  algorithm,
  keyInput,
  tokenIsDecoded,
  state,
  onAlgorithmChange,
  onKeyInputChange,
}: {
  algorithm: Algorithm;
  keyInput: string;
  tokenIsDecoded: boolean;
  state: VerifyState;
  onAlgorithmChange: (value: Algorithm) => void;
  onKeyInputChange: (value: string) => void;
}) {
  return (
    <>
      <Card.Header className="border-b border-separator">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Card.Title>
              {m["tools.jwtDecoderVerifier.verificationTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.jwtDecoderVerifier.verificationDescription"]()}
            </Card.Description>
          </div>
          <Chip size="sm" variant="secondary">
            {algorithm}
          </Chip>
        </div>
      </Card.Header>
      <ToolPanelCardContent className="gap-5 py-4">
        <div className="grid gap-2">
          <Select
            variant="secondary"
            selectedKey={algorithm}
            onSelectionChange={(key) => {
              const value = String(key);
              if (
                value === "auto" ||
                JWT_ALGORITHMS.includes(
                  value as (typeof JWT_ALGORITHMS)[number],
                )
              )
                onAlgorithmChange(value as Algorithm);
            }}
          >
            <Label>{m["common.argonAlgorithm"]()}</Label>
            <Select.Trigger className="min-h-11 w-full">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox aria-label={m["common.argonAlgorithm"]()}>
                <ListBox.Item
                  id="auto"
                  textValue={m[
                    "tools.jwtDecoderVerifier.verificationAutoAlgorithm"
                  ]()}
                >
                  {m["tools.jwtDecoderVerifier.verificationAutoAlgorithm"]()}
                </ListBox.Item>
                {JWT_ALGORITHMS.map((item) => (
                  <ListBox.Item key={item} id={item} textValue={item}>
                    {item}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <p className="text-xs text-muted">
            {m["tools.jwtDecoderVerifier.verificationAlgorithmDescription"]()}
          </p>
        </div>

        <TextField fullWidth>
          <Label>{m["tools.jwtDecoderVerifier.verificationKeyLabel"]()}</Label>
          <TextArea
            aria-label={m["tools.jwtDecoderVerifier.verificationKeyLabel"]()}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            dir="ltr"
            name="jwt-verification-key"
            spellCheck={false}
            translate="no"
            value={keyInput}
            onChange={(event) => onKeyInputChange(event.target.value)}
            placeholder={m[
              "tools.jwtDecoderVerifier.verificationKeyPlaceholder"
            ]()}
            className="min-h-36 w-full resize-y text-left font-mono text-sm"
          />
          <p className="mt-2 text-xs text-muted">
            {m["tools.jwtDecoderVerifier.verificationKeyDescription"]()}
          </p>
        </TextField>

        <VerificationStatus
          keyInput={keyInput}
          tokenIsDecoded={tokenIsDecoded}
          state={state}
        />
      </ToolPanelCardContent>
    </>
  );
}

function VerificationStatus({
  keyInput,
  tokenIsDecoded,
  state,
}: {
  keyInput: string;
  tokenIsDecoded: boolean;
  state: VerifyState;
}) {
  if (!tokenIsDecoded || !keyInput.trim() || state.status === "idle") {
    return (
      <StatusPanel title={m["shared.argon2Tools.verifierIdleTitle"]()}>
        {m["tools.jwtDecoderVerifier.verificationWaitingDescription"]()}
      </StatusPanel>
    );
  }
  if (state.status === "pending") {
    return (
      <div
        role="status"
        aria-label={m["tools.jwtDecoderVerifier.verificationPendingTitle"]()}
        className="grid min-h-28 content-center gap-3 rounded-xl border border-border p-4"
      >
        <Skeleton className="h-5 w-44 rounded-lg" />
        <Skeleton className="h-4 w-4/5 rounded-lg" />
      </div>
    );
  }
  if (state.status === "verified") {
    return (
      <StatusPanel
        title={m["tools.jwtDecoderVerifier.verificationVerifiedTitle"]()}
        icon={<BadgeCheck aria-hidden className="size-5 text-success" />}
        tone="success"
      >
        {m["tools.jwtDecoderVerifier.verificationVerifiedDescription"]()}
      </StatusPanel>
    );
  }
  if (state.status === "failed") {
    return (
      <StatusPanel
        title={m["tools.jwtDecoderVerifier.verificationFailedTitle"]()}
        icon={<TriangleAlert aria-hidden className="size-5 text-danger" />}
        tone="danger"
      >
        {m["tools.jwtDecoderVerifier.verificationFailedDescription"]()}
      </StatusPanel>
    );
  }
  return (
    <StatusPanel
      title={m["tools.jwtDecoderVerifier.verificationFailedTitle"]()}
      icon={<TriangleAlert aria-hidden className="size-5 text-danger" />}
      tone="danger"
    >
      {verifyErrorMessage(state.code)}
    </StatusPanel>
  );
}

function StatusPanel({
  title,
  children,
  icon = <ShieldCheck aria-hidden className="size-5 text-muted" />,
  tone = "neutral",
}: {
  title: string;
  children: string;
  icon?: React.ReactNode;
  tone?: "danger" | "neutral" | "success";
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-28 items-start gap-3 rounded-xl border p-4 ${
        tone === "danger"
          ? "border-danger/30 bg-danger/10"
          : tone === "success"
            ? "border-success/30 bg-success/10"
            : "border-border bg-default/40"
      }`}
    >
      {icon}
      <div className="grid min-w-0 gap-1">
        <strong className="font-medium">{title}</strong>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}

function DecodedPanel({
  decoded,
  claims,
}: {
  decoded: DecodeState;
  claims: ClaimItem[];
}) {
  if (!decoded.ok && decoded.code === "empty-token") {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-border px-6 text-center">
        <div className="grid max-w-sm gap-2">
          <strong className="font-medium">
            {m["tools.jwtDecoderVerifier.decodedEmptyTitle"]()}
          </strong>
          <p className="text-sm text-muted">
            {m["tools.jwtDecoderVerifier.decodedEmptyDescription"]()}
          </p>
        </div>
      </div>
    );
  }
  if (!decoded.ok) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-danger"
      >
        <TriangleAlert aria-hidden className="size-5 shrink-0" />
        <strong className="font-medium">
          {decodeErrorMessage(decoded.code)}
        </strong>
      </div>
    );
  }
  return (
    <div className="grid min-w-0 gap-6">
      <JsonOutputCard
        title={m["tools.jwtDecoderVerifier.decodedHeaderTitle"]()}
        description={m["tools.jwtDecoderVerifier.decodedDescription"]()}
        value={decoded.value.headerJson}
        minHeight="min-h-36"
      />
      <JsonOutputCard
        title={m["tools.jwtDecoderVerifier.decodedPayloadTitle"]()}
        description={m["tools.jwtDecoderVerifier.decodedDescription"]()}
        value={decoded.value.payloadJson}
        minHeight="min-h-64"
      />
      <ClaimsCard claims={claims} />
    </div>
  );
}

function JsonOutputCard({
  title,
  description,
  value,
  minHeight,
}: {
  title: string;
  description: string;
  value: string;
  minHeight: string;
}) {
  return (
    <CodeBlock
      code={value}
      title={title}
      description={description}
      language="json"
      copyLabel={m["shared.aesTools.encryptcopyjsonlabel"]()}
      copiedLabel={m["common.actions.copied"]()}
      maxHeightClassName={`${minHeight} max-h-80`}
    />
  );
}

function ClaimsCard({ claims }: { claims: ClaimItem[] }) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["tools.jwtDecoderVerifier.claimsTitle"]()}</Card.Title>
        <Card.Description>
          {m["tools.jwtDecoderVerifier.claimsDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-3 py-4">
        {claims.length === 0 ? (
          <div className="grid min-h-40 place-items-center px-4 text-center">
            <div className="grid gap-2">
              <strong className="font-medium">
                {m["tools.jwtDecoderVerifier.claimsEmptyTitle"]()}
              </strong>
              <p className="text-sm text-muted">
                {m["tools.jwtDecoderVerifier.claimsEmptyDescription"]()}
              </p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3">
            {claims.map((claim) => (
              <li
                key={`${claim.code}-${claim.date ?? ""}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
              >
                <span className="min-w-0 text-sm wrap-break-word">
                  {claimMessage(claim.code, claim.date)}
                </span>
                <Chip
                  size="sm"
                  color={claimColor(claim.severity)}
                  variant={claim.severity === "neutral" ? "secondary" : "soft"}
                  className="shrink-0"
                >
                  {claimSeverity(claim.severity)}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function decodeErrorMessage(code: DecodeError) {
  switch (code) {
    case "empty-token":
      return m["tools.jwtDecoderVerifier.decodeErrorsEmptyToken"]();
    case "invalid-segment-count":
      return m["tools.jwtDecoderVerifier.decodeErrorsInvalidSegmentCount"]();
    case "empty-header-or-payload":
      return m["tools.jwtDecoderVerifier.decodeErrorsEmptyHeaderOrPayload"]();
    case "invalid-header-base64":
      return m["tools.jwtDecoderVerifier.decodeErrorsInvalidHeaderBase64"]();
    case "invalid-payload-base64":
      return m["tools.jwtDecoderVerifier.decodeErrorsInvalidPayloadBase64"]();
    case "invalid-signature-base64":
      return m["tools.jwtDecoderVerifier.decodeErrorsInvalidSignatureBase64"]();
    case "invalid-header-json":
      return m["tools.jwtDecoderVerifier.decodeErrorsInvalidHeaderJson"]();
    case "invalid-payload-json":
      return m["tools.jwtDecoderVerifier.decodeErrorsInvalidPayloadJson"]();
    case "header-not-object":
      return m["tools.jwtDecoderVerifier.decodeErrorsHeaderNotObject"]();
  }
}

function verifyErrorMessage(code: VerifyError) {
  switch (code) {
    case "key-required":
      return m["tools.jwtDecoderVerifier.verifyErrorsKeyRequired"]();
    case "missing-algorithm":
      return m["tools.jwtDecoderVerifier.verifyErrorsMissingAlgorithm"]();
    case "unsupported-algorithm":
      return m["tools.jwtDecoderVerifier.verifyErrorsUnsupportedAlgorithm"]();
    case "algorithm-mismatch":
      return m["tools.jwtDecoderVerifier.verifyErrorsAlgorithmMismatch"]();
    case "invalid-key-json":
      return m["tools.jwtDecoderVerifier.verifyErrorsInvalidKeyJson"]();
    case "invalid-jwk":
      return m["tools.jwtDecoderVerifier.verifyErrorsInvalidJwk"]();
    case "empty-jwks":
      return m["tools.jwtDecoderVerifier.verifyErrorsEmptyJwks"]();
    case "jwk-kid-not-found":
      return m["tools.jwtDecoderVerifier.verifyErrorsJwkKidNotFound"]();
    case "unsupported-key-format":
      return m["tools.jwtDecoderVerifier.verifyErrorsUnsupportedKeyFormat"]();
    case "unsupported-pem-label":
      return m["tools.jwtDecoderVerifier.verifyErrorsUnsupportedPemLabel"]();
    case "key-import-failed":
      return m["tools.jwtDecoderVerifier.verifyErrorsKeyImportFailed"]();
    case "webcrypto-unavailable":
      return m["tools.jwtDecoderVerifier.verifyErrorsWebcryptoUnavailable"]();
  }
}

function claimMessage(code: ClaimCode, date?: string) {
  switch (code) {
    case "payload-not-object":
      return m["tools.jwtDecoderVerifier.claimsMessagesPayloadNotObject"]();
    case "invalid-exp":
      return m["tools.jwtDecoderVerifier.claimsMessagesInvalidExp"]();
    case "invalid-nbf":
      return m["tools.jwtDecoderVerifier.claimsMessagesInvalidNbf"]();
    case "invalid-iat":
      return m["tools.jwtDecoderVerifier.claimsMessagesInvalidIat"]();
    case "expired":
      return m["tools.jwtDecoderVerifier.claimsMessagesExpired"]({
        date: date ?? "",
      });
    case "not-yet-valid":
      return m["tools.jwtDecoderVerifier.claimsMessagesNotYetValid"]({
        date: date ?? "",
      });
    case "issued-in-future":
      return m["tools.jwtDecoderVerifier.claimsMessagesIssuedInFuture"]({
        date: date ?? "",
      });
    case "expires-at":
      return m["tools.jwtDecoderVerifier.claimsMessagesExpiresAt"]({
        date: date ?? "",
      });
    case "valid-after":
      return m["tools.jwtDecoderVerifier.claimsMessagesValidAfter"]({
        date: date ?? "",
      });
    case "issued-at":
      return m["tools.jwtDecoderVerifier.claimsMessagesIssuedAt"]({
        date: date ?? "",
      });
  }
}

function claimSeverity(severity: ClaimSeverity) {
  if (severity === "danger")
    return m["tools.jwtDecoderVerifier.claimsSeveritiesDanger"]();
  if (severity === "warning") return m["common.fmtseveritywarning"]();
  if (severity === "success") return m["shared.jsonSchemaTools.valid"]();
  return m["tools.jwtDecoderVerifier.claimsSeveritiesNeutral"]();
}

function decodeForPage(token: string): DecodeState {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, code: "empty-token" };
  if (trimmed.length > MAX_JOSE_INPUT * 4)
    return { ok: false, code: "invalid-segment-count" };
  const parts = trimmed.split(".");
  if (parts.length !== 3) return { ok: false, code: "invalid-segment-count" };
  if (!parts[0] || !parts[1])
    return { ok: false, code: "empty-header-or-payload" };
  let headerText: string;
  let payloadText: string;
  try {
    headerText = utf8(fromUrl64(parts[0]));
  } catch {
    return { ok: false, code: "invalid-header-base64" };
  }
  try {
    payloadText = utf8(fromUrl64(parts[1]));
  } catch {
    return { ok: false, code: "invalid-payload-base64" };
  }
  try {
    fromUrl64(parts[2] ?? "");
  } catch {
    return { ok: false, code: "invalid-signature-base64" };
  }
  let header: unknown;
  try {
    header = JSON.parse(headerText);
  } catch {
    return { ok: false, code: "invalid-header-json" };
  }
  if (!object(header)) return { ok: false, code: "header-not-object" };
  try {
    JSON.parse(payloadText);
  } catch {
    return { ok: false, code: "invalid-payload-json" };
  }
  try {
    return { ok: true, value: decodeToken(trimmed) };
  } catch {
    return { ok: false, code: "invalid-payload-json" };
  }
}

function getPreflightError(
  decoded: DecodedToken,
  selected: Algorithm,
): VerifyError | null {
  const headerAlgorithm =
    typeof decoded.header.alg === "string" ? decoded.header.alg : null;
  if (!headerAlgorithm) return "missing-algorithm";
  if (!JWT_ALGORITHMS.includes(headerAlgorithm as JwtAlgorithm))
    return "unsupported-algorithm";
  if (selected !== "auto" && selected !== headerAlgorithm)
    return "algorithm-mismatch";
  return null;
}

function mapVerifyError(code: string): VerifyError {
  switch (code) {
    case "key_required":
      return "key-required";
    case "unsupported_algorithm":
      return "unsupported-algorithm";
    case "algorithm_mismatch":
      return "algorithm-mismatch";
    case "invalid_json":
      return "invalid-key-json";
    case "object_required":
      return "invalid-jwk";
    case "key_ambiguous":
      return "jwk-kid-not-found";
    case "key_mismatch":
      return "unsupported-key-format";
    default:
      return "key-import-failed";
  }
}

function getClaimItems(decoded: DecodedToken): ClaimItem[] {
  if (!object(decoded.payload))
    return [{ code: "payload-not-object", severity: "warning" }];
  return inspectClaims(decoded.payload).map((claim) => {
    const code =
      claim.status === "invalid"
        ? (`invalid-${claim.claim}` as ClaimCode)
        : claim.claim === "exp"
          ? claim.status === "expired"
            ? "expired"
            : "expires-at"
          : claim.claim === "nbf"
            ? claim.status === "future"
              ? "not-yet-valid"
              : "valid-after"
            : claim.status === "future"
              ? "issued-in-future"
              : "issued-at";
    const severity: ClaimSeverity =
      code === "expired" || code === "not-yet-valid"
        ? "danger"
        : code.startsWith("invalid-") || code === "issued-in-future"
          ? "warning"
          : code === "issued-at"
            ? "neutral"
            : "success";
    return { code, severity, date: claim.date ?? undefined };
  });
}

function claimColor(severity: ClaimSeverity) {
  if (severity === "danger") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "success") return "success" as const;
  return "default" as const;
}

export default function JwtDecoderVerifierPage() {
  return (
    <ToolPage>
      <JwtDecoderVerifierPageContent />
    </ToolPage>
  );
}
