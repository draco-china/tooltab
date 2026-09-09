/* biome-ignore-all lint/a11y/useMediaCaption: Decoded local media does not include a caption track. */
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Skeleton,
  TextArea,
} from "@heroui/react";
import { Download, RefreshCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { DataUriError, safeFilename } from "@workspace/tools/encoding/data-uri";
import { convertDataUri, type DataUriResult } from "../data-uri/worker-client";

const SAMPLE_DATA_URI =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27240%27%20height%3D%27120%27%20viewBox%3D%270%200%20240%20120%27%3E%3Crect%20width%3D%27240%27%20height%3D%27120%27%20rx%3D%2724%27%20fill%3D%27%230f766e%27/%3E%3Ctext%20x%3D%2750%25%27%20y%3D%2750%25%27%20dominant-baseline%3D%27middle%27%20text-anchor%3D%27middle%27%20fill%3D%27white%27%20font-size%3D%2728%27%20font-family%3D%27Arial%2Csans-serif%27%3EData%20URI%3C/text%3E%3C/svg%3E";
const STORAGE_KEY = "tools:data-uri-to-file-converter:input";
const DEBOUNCE_MS = 200;

type DecodedResult = Extract<DataUriResult, { kind: "decode" }>;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function errorMessage(code: string) {
  if (code === "invalid_base64")
    return m["tools.dataUriToFileConverter.localInvalidBase64Error"]();
  if (code === "invalid_percent")
    return m["tools.dataUriToFileConverter.localInvalidPercentError"]();
  if (code === "invalid_unicode")
    return m["tools.dataUriToFileConverter.localInvalidUnicodeError"]();
  if (code === "invalid_mime")
    return m["tools.dataUriToFileConverter.localInvalidMimeError"]();
  if (code === "too_large")
    return m["tools.dataUriToFileConverter.localTooLargeError"]();
  if (code === "unsupported")
    return m["tools.csvToJsonConverter.localUnsupportedError"]();
  if (code === "read_failed")
    return m["tools.dataUriToFileConverter.localReadError"]();
  return m["tools.dataUriToFileConverter.localInvalidUriError"]();
}

function ResultSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid min-h-80 content-start gap-5"
    >
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

function Preview({
  result,
  previewUrl,
  id,
  titleId,
}: {
  result: DecodedResult;
  previewUrl: string;
  id: string;
  titleId: string;
}) {
  if (result.previewKind === "image") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-default/20 p-3">
        <img
          src={previewUrl}
          alt={m["common.archivepreview"]()}
          className="max-h-80 w-full object-contain"
        />
      </div>
    );
  }
  if (result.previewKind === "audio") {
    return <audio src={previewUrl} controls className="w-full" />;
  }
  if (result.previewKind === "video") {
    return (
      <video
        src={previewUrl}
        controls
        className="w-full rounded-xl border border-border bg-black"
      />
    );
  }
  if (result.previewKind === "text") {
    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id={titleId} className="font-medium">
            {m["common.archivepreview"]()}
          </h3>
          <ToolCopyButton
            value={result.text}
            copyLabel={m["common.actions.copyResult"]()}
            copiedLabel={m["common.actions.copied"]()}
            variant="ghost"
          />
        </div>
        <TextArea
          id={`${id}-preview`}
          aria-label={m["common.archivepreview"]()}
          readOnly
          value={result.text}
          className="min-h-64 font-mono text-sm"
        />
        {result.truncated ? (
          <p className="text-sm text-muted">
            {m["shared.baseEncoding.base16PreviewTruncatedLabel"]()}
          </p>
        ) : null}
        {result.charsetFallback ? (
          <p className="text-sm text-warning">
            {m["tools.dataUriToFileConverter.localCharsetFallback"]()}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
      {m["tools.dataUriToFileConverter.previewUnavailableDescription"]()}
    </div>
  );
}

function DataUriToFileContent() {
  const id = useId();
  const controller = useRef<AbortController | null>(null);
  const debounceTimeout = useRef(0);
  const revision = useRef(0);
  const previewUrlRef = useRef("");
  const suggestedFilename = useRef("data.svg");
  const [input, setInput] = useState(SAMPLE_DATA_URI);
  const [result, setResult] = useState<DecodedResult | null>(null);
  const [filename, setFilename] = useState("data.svg");
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filenameError, setFilenameError] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setInput(stored);
    } catch {
      // Storage may be unavailable; keep the bundled example.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, input);
    } catch {
      // Storage may be unavailable or full; conversion remains fully local.
    }
  }, [input]);

  useEffect(() => {
    const currentRevision = ++revision.current;
    window.clearTimeout(debounceTimeout.current);
    controller.current?.abort();
    controller.current = null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
    setResult(null);
    setError("");
    setFilenameError("");
    if (!input.trim()) {
      setBusy(false);
      return;
    }

    setBusy(true);
    debounceTimeout.current = window.setTimeout(async () => {
      debounceTimeout.current = 0;
      const nextController = new AbortController();
      controller.current = nextController;
      try {
        const value = await convertDataUri(
          { kind: "decode", input },
          nextController.signal,
        );
        if (
          nextController.signal.aborted ||
          revision.current !== currentRevision ||
          value.kind !== "decode"
        ) {
          return;
        }
        setResult(value);
        const previousSuggestion = suggestedFilename.current;
        setFilename((current) =>
          !current || current === previousSuggestion ? value.filename : current,
        );
        suggestedFilename.current = value.filename;
        if (["image", "audio", "video"].includes(value.previewKind)) {
          const nextUrl = URL.createObjectURL(value.blob);
          previewUrlRef.current = nextUrl;
          setPreviewUrl(nextUrl);
        }
      } catch (caught) {
        if (
          !nextController.signal.aborted &&
          revision.current === currentRevision
        ) {
          setError(
            caught instanceof DataUriError ? caught.code : "read_failed",
          );
        }
      } finally {
        if (revision.current === currentRevision) setBusy(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceTimeout.current);
      debounceTimeout.current = 0;
      controller.current?.abort();
    };
  }, [input]);

  useEffect(
    () => () => {
      window.clearTimeout(debounceTimeout.current);
      controller.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  function download() {
    if (!result) return;
    let name: string;
    try {
      name = safeFilename(filename, result.filename);
      setFilenameError("");
    } catch {
      setFilenameError(m["tools.dataUriToFileConverter.localFileNameError"]());
      return;
    }
    const downloadUrl = URL.createObjectURL(result.blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = name;
      anchor.click();
    } finally {
      URL.revokeObjectURL(downloadUrl);
    }
  }

  function cancel() {
    revision.current++;
    window.clearTimeout(debounceTimeout.current);
    debounceTimeout.current = 0;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }

  function resetExample() {
    suggestedFilename.current = "data.svg";
    setFilename("data.svg");
    setFilenameError("");
    setInput(SAMPLE_DATA_URI);
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <Card.Title>
                {m["tools.dataUriToFileConverter.inputTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.dataUriToFileConverter.inputPlaceholder"]()}
              </Card.Description>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onPress={resetExample}
            >
              <RefreshCcw aria-hidden className="size-4" />
              {m["common.textcodecSample"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <Label htmlFor={`${id}-input`} className="sr-only">
              {m["tools.dataUriToFileConverter.inputTitle"]()}
            </Label>
            <TextArea
              id={`${id}-input`}
              aria-label={m["tools.dataUriToFileConverter.inputTitle"]()}
              value={input}
              placeholder={m["tools.dataUriToFileConverter.inputPlaceholder"]()}
              autoComplete="off"
              spellCheck={false}
              className="min-h-80 resize-y font-mono text-sm break-all whitespace-pre-wrap"
              onChange={(event) => setInput(event.currentTarget.value)}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="justify-end gap-3">
            {busy ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onPress={cancel}
              >
                {m["common.actions.cancel"]()}
              </Button>
            ) : null}
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>
              {m["tools.dataUriToFileConverter.decodedOutputTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.dataUriToFileConverter.decodedOutputDescription"]()}
            </Card.Description>
            <Button
              type="button"
              size="sm"
              variant="primary"
              isDisabled={!result || busy}
              onPress={download}
              className="sm:col-start-2 sm:row-span-2 sm:row-start-1"
            >
              <Download aria-hidden className="size-4" />
              {m["shared.aesTools.decryptdownloadfilelabel"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="gap-5 py-4">
            {busy ? (
              <ResultSkeleton
                label={m["tools.dataUriToFileConverter.localLoadingLabel"]()}
              />
            ) : error ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.dataUriToFileConverter.invalidDataUriTitle"]()}
                  </Alert.Title>
                  <Alert.Description>{errorMessage(error)}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : result ? (
              <>
                <section
                  className="grid gap-3"
                  aria-labelledby={`${id}-details`}
                >
                  <h3 id={`${id}-details`} className="font-medium">
                    {m["tools.dataUriToFileConverter.detailsTitle"]()}
                  </h3>
                  <dl className="grid gap-3 rounded-xl border border-border bg-default/20 p-4 sm:grid-cols-3">
                    {[
                      [
                        m["tools.dataUriToFileConverter.mimeTypeLabel"](),
                        result.mimeType,
                      ],
                      [
                        m["tools.dataUriToFileConverter.encodingLabel"](),
                        result.encoding === "base64"
                          ? m[
                              "tools.dataUriToFileConverter.base64encodedlabel"
                            ]()
                          : m[
                              "tools.dataUriToFileConverter.encodingUrlEncoded"
                            ](),
                      ],
                      [m["common.archivesize"](), formatBytes(result.size)],
                    ].map(([label, value]) => (
                      <div key={label} className="grid min-w-0 gap-1">
                        <dt className="text-xs font-medium tracking-wide text-muted uppercase">
                          {label}
                        </dt>
                        <dd className="mt-1 font-mono text-sm break-all">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <div className="grid gap-2">
                  <Label htmlFor={`${id}-filename`}>
                    {m["common.datauriFilename"]()}
                  </Label>
                  <Input
                    id={`${id}-filename`}
                    aria-label={m["common.datauriFilename"]()}
                    value={filename}
                    placeholder={m[
                      "tools.dataUriToFileConverter.fileNamePlaceholder"
                    ]()}
                    aria-invalid={filenameError ? true : undefined}
                    aria-describedby={
                      filenameError ? `${id}-filename-error` : undefined
                    }
                    onChange={(event) => {
                      setFilename(event.currentTarget.value);
                      setFilenameError("");
                    }}
                  />
                  {filenameError ? (
                    <p
                      id={`${id}-filename-error`}
                      role="alert"
                      className="text-sm text-danger"
                    >
                      {filenameError}
                    </p>
                  ) : null}
                </div>

                <section
                  className="grid gap-3"
                  aria-labelledby={`${id}-preview-title`}
                >
                  {result.previewKind === "text" ? null : (
                    <h3 id={`${id}-preview-title`} className="font-medium">
                      {m["common.archivepreview"]()}
                    </h3>
                  )}
                  <Preview
                    result={result}
                    previewUrl={previewUrl}
                    id={id}
                    titleId={`${id}-preview-title`}
                  />
                </section>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">
                {m[
                  "tools.dataUriToFileConverter.decodedOutputEmptyDescription"
                ]()}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.dataUriToFileConverter.articleWhyTitle"]()}</h2>
        <p>{m["tools.dataUriToFileConverter.articleWhyBody"]()}</p>
        <h2>{m["tools.dataUriToFileConverter.articleWhatTitle"]()}</h2>
        <p>
          {m["tools.dataUriToFileConverter.articleWhatBodyBeforeCode"]()}
          <code>{m["tools.dataUriToFileConverter.articleWhatBodyCode"]()}</code>
          {m["tools.dataUriToFileConverter.articleWhatBodyAfterCode"]()}
        </p>
        <h2>{m["tools.dataUriToFileConverter.articleCheckTitle"]()}</h2>
        <p>{m["tools.dataUriToFileConverter.articleCheckBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function DataUriToFile() {
  return (
    <ToolPage>
      <DataUriToFileContent />
    </ToolPage>
  );
}
