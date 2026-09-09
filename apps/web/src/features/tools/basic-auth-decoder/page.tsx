import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { getLocale } from "@/paraglide/runtime.js";
import { Alert, Button, Card, Separator, TextArea } from "@heroui/react";
import { Eraser, Eye, EyeOff, RefreshCcw, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  BasicAuthDecoderError,
  decodeBasicAuth,
} from "@workspace/tools/encoding/basic-auth";

const DEFAULT_HEADER = "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==";

function BasicAuthDecoderPageContent() {
  const [authorizationHeader, setAuthorizationHeader] =
    useState(DEFAULT_HEADER);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const hasInput = authorizationHeader.trim().length > 0;
  let result: ReturnType<typeof decodeBasicAuth> | null = null;
  let errorMessage = "";
  if (hasInput) {
    try {
      result = decodeBasicAuth(authorizationHeader);
    } catch (cause) {
      const code =
        cause instanceof BasicAuthDecoderError ? cause.code : "invalid_header";
      errorMessage =
        code === "invalid_header" &&
        /^(?:authorization:\s*)?basic\s+/i.test(authorizationHeader.trim())
          ? m["shared.httpText.basicAuthDecoderInvalidBase64Title"]()
          : {
              invalid_header:
                m["shared.httpText.basicAuthDecoderInvalidHeaderTitle"](),
              invalid_base64:
                m["shared.httpText.basicAuthDecoderInvalidBase64Title"](),
              invalid_text: m["tools.basicAuthDecoder.invalidTextTitle"](),
              missing_separator:
                m["tools.basicAuthDecoder.missingSeparatorTitle"](),
              too_large: m["tools.basicAuthDecoder.tooLargeTitle"](),
            }[code];
    }
  }

  return (
    <div className="grid gap-10">
      <div className="grid gap-6" data-tool-layout="stacked" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m[
                  "shared.httpText.basicAuthDecoderAuthorizationHeaderLabel"
                ]()}
              </Card.Title>
              <Card.Description>
                {m["tools.basicAuthDecoder.authorizationHeaderDescription"]()}
              </Card.Description>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                isDisabled={!authorizationHeader}
                onPress={() => {
                  setAuthorizationHeader("");
                  setPasswordVisible(false);
                }}
              >
                <Eraser aria-hidden className="size-4" />
                {m["common.curlClear"]()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setAuthorizationHeader(DEFAULT_HEADER);
                  setPasswordVisible(false);
                }}
              >
                <RefreshCcw aria-hidden className="size-4" />
                {m["common.httptSample"]()}
              </Button>
            </div>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              name="authorization-header"
              autoComplete="off"
              spellCheck={false}
              rows={6}
              aria-label={m[
                "shared.httpText.basicAuthDecoderAuthorizationHeaderLabel"
              ]()}
              aria-invalid={Boolean(errorMessage) || undefined}
              value={authorizationHeader}
              onChange={(event) => {
                setAuthorizationHeader(event.currentTarget.value);
                setPasswordVisible(false);
              }}
              placeholder={m[
                "tools.basicAuthDecoder.authorizationHeaderPlaceholder"
              ]()}
              className="min-h-40 resize-y font-mono text-sm"
            />
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["shared.httpText.basicAuthDecoderDecodedCredentialsLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.basicAuthDecoder.decodedCredentialsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {!hasInput ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
                {m["tools.basicAuthDecoder.emptyResult"]()}
              </div>
            ) : errorMessage ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>{errorMessage}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : result ? (
              <>
                <CredentialField
                  label={m["common.httptUsername"]()}
                  value={result.username}
                  displayValue={result.username}
                  copyLabel={m["common.actions.copyResult"]()}
                  copiedLabel={m["common.actions.copied"]()}
                />
                <Separator />
                <CredentialField
                  label={m["common.httptPassword"]()}
                  value={result.password}
                  displayValue={passwordVisible ? result.password : "••••••••"}
                  copyLabel={m["common.actions.copyResult"]()}
                  copiedLabel={m["common.actions.copied"]()}
                  action={
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={
                        passwordVisible
                          ? m["common.httptHide"]()
                          : m["common.httptShow"]()
                      }
                      onPress={() => setPasswordVisible((visible) => !visible)}
                    >
                      {passwordVisible ? (
                        <EyeOff aria-hidden className="size-4" />
                      ) : (
                        <Eye aria-hidden className="size-4" />
                      )}
                    </Button>
                  }
                />
              </>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.dockerRunToComposeConverter.article.whatTitle"]()}</h2>
        <p>{m["tools.basicAuthDecoder.articleWhatBody"]()}</p>
        <h2>{m["shared.httpText.basicAuthDecoderArticleInputTitle"]()}</h2>
        <p>{m["tools.basicAuthDecoder.articleInputBody"]()}</p>
        <h2>{m["shared.httpText.basicAuthDecoderArticleNotesTitle"]()}</h2>
        <ul>
          {[
            m["tools.basicAuthDecoder.articleNotes0"](),
            m["tools.basicAuthDecoder.articleNotes1"](),
            m["tools.basicAuthDecoder.articleNotes2"](),
          ].map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </ToolArticle>
    </div>
  );
}

function CredentialField({
  label,
  value,
  displayValue,
  copyLabel,
  copiedLabel,
  action,
}: {
  label: string;
  value: string;
  displayValue: string;
  copyLabel: string;
  copiedLabel: string;
  action?: ReactNode;
}) {
  return (
    <section aria-label={label} className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{label}</h3>
        <div className="flex items-center gap-1">
          {action}
          <ToolCopyButton
            value={value}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            variant="ghost"
          />
        </div>
      </div>
      <pre className="min-h-20 overflow-x-auto rounded-lg border border-border bg-transparent px-3 py-2.5 font-mono text-sm leading-6 break-all whitespace-pre-wrap text-foreground">
        <code>{displayValue}</code>
      </pre>
    </section>
  );
}

export default function BasicAuthDecoderPage() {
  return (
    <ToolPage
      instructions={m["tools.basicAuthDecoder.usage"](
        {},
        { locale: getLocale() },
      )}
    >
      <BasicAuthDecoderPageContent />
    </ToolPage>
  );
}
