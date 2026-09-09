import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, TextArea } from "@heroui/react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { safeLocalStorage } from "@/lib/safe-storage";
import { m } from "@/paraglide/messages.js";
import {
  Base64Error,
  type Base64ErrorCode,
  decodeBase64,
  encodeBase64,
} from "@workspace/tools/encoding/base64";

const STORAGE_KEY = "tools:base64-encoder-decoder:plain-text";
const DEFAULT_TEXT = "Hello, browser-native world!";

function ErrorNotice({ code }: { code: Base64ErrorCode }) {
  return (
    <div aria-live="polite">
      <Alert status="danger" role="alert">
        <Alert.Indicator>
          <TriangleAlert aria-hidden className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>
            {code === "too-large"
              ? m["tools.base64EncoderDecoder.tooLargeTitle"]()
              : code === "invalid-utf8"
                ? m["tools.base64EncoderDecoder.invalidUtf8Title"]()
                : m["shared.base64.invalidBase64Title"]()}
          </Alert.Title>
          <Alert.Description>
            {code === "too-large"
              ? m["tools.base64EncoderDecoder.tooLargeDescription"]()
              : code === "invalid-utf8"
                ? m["tools.base64EncoderDecoder.invalidUtf8Description"]()
                : m["shared.base64.invalidBase64Description"]()}
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

function Base64EncoderDecoderPageContent() {
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const encodedRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const plainTextId = useId();
  const encodedTextId = useId();
  const [plainText, setPlainText] = useState(DEFAULT_TEXT);
  const [encodedText, setEncodedText] = useState(() =>
    encodeBase64(DEFAULT_TEXT),
  );
  const [error, setError] = useState<{
    code: Base64ErrorCode;
    field: "plain" | "encoded";
  } | null>(null);

  const updatePlainText = useCallback((value: string) => {
    setPlainText(value);
    try {
      setEncodedText(encodeBase64(value));
      setError(null);
    } catch (cause) {
      setError({
        code: cause instanceof Base64Error ? cause.code : "invalid-utf8",
        field: "plain",
      });
    }
  }, []);

  const updateEncodedText = useCallback((value: string) => {
    setEncodedText(value);
    try {
      setPlainText(decodeBase64(value));
      setError(null);
    } catch (cause) {
      setError({
        code: cause instanceof Base64Error ? cause.code : "invalid-base64",
        field: "encoded",
      });
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const plain = plainRef.current?.value ?? DEFAULT_TEXT;
    const encoded = encodedRef.current?.value ?? encodeBase64(DEFAULT_TEXT);
    // Adopt edits made before hydration instead of replacing them with storage.
    if (
      encoded !== encodeBase64(DEFAULT_TEXT) &&
      (plain === DEFAULT_TEXT || document.activeElement === encodedRef.current)
    ) {
      updateEncodedText(encoded);
    } else if (plain !== DEFAULT_TEXT) {
      updatePlainText(plain);
    } else {
      const storedValue = safeLocalStorage.getItem(STORAGE_KEY);
      if (storedValue !== null) {
        try {
          const encodedValue = encodeBase64(storedValue);
          setPlainText(storedValue);
          setEncodedText(encodedValue);
        } catch {
          safeLocalStorage.removeItem(STORAGE_KEY);
        }
      }
    }
    setReady(true);
  }, [updatePlainText, updateEncodedText]);

  useEffect(() => {
    if (!ready) return;
    if (plainRef.current && plainRef.current.value !== plainText)
      plainRef.current.value = plainText;
    if (encodedRef.current && encodedRef.current.value !== encodedText)
      encodedRef.current.value = encodedText;
    safeLocalStorage.setItem(STORAGE_KEY, plainText);
  }, [ready, plainText, encodedText]);

  function reset() {
    updatePlainText(DEFAULT_TEXT);
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>{m["common.adler32plaintextlabel"]()}</Card.Title>
              <Card.Description>
                {m["common.adler32plaintextdescription"]()}
              </Card.Description>
            </div>
            <Button type="button" variant="ghost" size="sm" onPress={reset}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["common.textcodecSample"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              ref={plainRef}
              id={plainTextId}
              name="plain-text"
              autoComplete="off"
              rows={10}
              aria-label={m["common.adler32plaintextlabel"]()}
              defaultValue={DEFAULT_TEXT}
              onChange={(event) => updatePlainText(event.currentTarget.value)}
              aria-invalid={error?.field === "plain"}
              className="min-h-64 resize-y font-mono text-sm"
              placeholder={m[
                "tools.base64EncoderDecoder.plainTextPlaceholder"
              ]()}
            />
            {error?.field === "plain" ? (
              <ErrorNotice code={error.code} />
            ) : null}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end gap-3">
            <ToolCopyButton
              value={plainText}
              disabled={Boolean(error)}
              copyLabel={m["shared.base64.copyPlainTextLabel"]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.base64EncoderDecoder.encodedTextLabel"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.base64EncoderDecoder.encodedTextDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextArea
              ref={encodedRef}
              id={encodedTextId}
              name="base64-output"
              autoComplete="off"
              spellCheck={false}
              rows={10}
              aria-label={m["tools.base64EncoderDecoder.encodedTextLabel"]()}
              defaultValue={encodeBase64(DEFAULT_TEXT)}
              onChange={(event) => updateEncodedText(event.currentTarget.value)}
              aria-invalid={error?.field === "encoded"}
              className="min-h-64 resize-y font-mono text-sm"
              placeholder={m[
                "tools.base64EncoderDecoder.encodedTextPlaceholder"
              ]()}
            />
            {error?.field === "encoded" ? (
              <ErrorNotice code={error.code} />
            ) : null}
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end">
            <ToolCopyButton
              value={encodedText}
              copyLabel={m["tools.base64EncoderDecoder.copyencoded"]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
              disabled={Boolean(error)}
            />
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.base64EncoderDecoder.articleWhatTitle"]()}</h2>
        <p>{m["tools.base64EncoderDecoder.articleWhatBody"]()}</p>
        <h2>{m["shared.baseEncoding.base32ArticleWhenTitle"]()}</h2>
        <ul>
          <li>{m["tools.base64EncoderDecoder.articleWhenOne"]()}</li>
          <li>{m["tools.base64EncoderDecoder.articleWhenTwo"]()}</li>
          <li>{m["tools.base64EncoderDecoder.articleWhenThree"]()}</li>
        </ul>
        <h2>{m["shared.baseEncoding.base32ArticleNotesTitle"]()}</h2>
        <ul>
          <li>{m["tools.base64EncoderDecoder.articleNoteOne"]()}</li>
          <li>{m["shared.baseEncoding.base32ArticleNoteTwo"]()}</li>
          <li>{m["tools.base64EncoderDecoder.articleNoteThree"]()}</li>
        </ul>
      </ToolArticle>
    </div>
  );
}

export default function Base64EncoderDecoderPage() {
  return (
    <ToolPage>
      <Base64EncoderDecoderPageContent />
    </ToolPage>
  );
}
