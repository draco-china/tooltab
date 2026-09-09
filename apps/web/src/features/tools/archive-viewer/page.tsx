import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Modal,
  Spinner,
  useOverlayState,
} from "@heroui/react";
import {
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  File,
  FileText,
  Folder,
  ImageIcon,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
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
import { formatFileSize } from "@/lib/file-size";
import { getLocale } from "@/paraglide/runtime.js";
import type { ArchiveResult } from "@workspace/tools/archive";
import {
  ARCHIVE_INPUT_LIMIT,
  type ArchiveCode,
  type ArchiveEntry,
  ArchiveError,
  downloadName,
  folderRows,
  previewKind,
} from "@workspace/tools/archive";
import { runArchiveWorker } from "./worker-client";

type LoadedPreview = {
  status: "ready";
  entry: ArchiveEntry;
  url: string;
  downloadUrl: string;
  kind: "text" | "image" | "pdf" | null;
  text?: string;
  highlighted?: string;
};

type Preview =
  | { status: "loading"; entry: ArchiveEntry }
  | LoadedPreview
  | { status: "unavailable"; entry: ArchiveEntry; code: ArchiveCode };

type ContextMenu = {
  entry: ArchiveEntry;
  left: number;
  top: number;
};

function Highlighted({ value, text }: { value?: string; text: string }) {
  if (!value) return <span>{text}</span>;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Local highlight.js escapes source text and emits highlight spans only.
  return <span dangerouslySetInnerHTML={{ __html: value }} />;
}

function archiveErrorMessage(value: ArchiveCode) {
  switch (value) {
    case "invalid_input":
      return m["tools.archiveViewer.errorInvalidInput"]();
    case "unsupported":
      return m["tools.archiveViewer.errorUnsupported"]();
    case "input_limit":
      return m["tools.archiveViewer.errorInputLimit"]();
    case "expanded_limit":
      return m["tools.archiveViewer.errorExpandedLimit"]();
    case "entry_limit":
      return m["tools.archiveViewer.errorEntryLimit"]();
    case "entry_not_found":
      return m["tools.archiveViewer.errorEntryNotFound"]();
    case "file_only":
      return m["tools.archiveViewer.errorFileOnly"]();
    case "encrypted":
      return m["tools.archiveViewer.errorEncrypted"]();
    case "preview_limit":
      return m["tools.archiveViewer.errorPreviewLimit"]();
    case "timeout":
      return m["tools.archiveViewer.errorTimeout"]();
    case "busy":
      return m["tools.archiveViewer.errorBusy"]();
    case "artifact_required":
      return m["tools.archiveViewer.errorArtifactRequired"]();
    case "read_failed":
      return m["tools.archiveViewer.errorReadFailed"]();
  }
}

function archiveKindLabel(value: ArchiveEntry["kind"]) {
  switch (value) {
    case "file":
      return m["tools.archiveViewer.kindFile"]();
    case "directory":
      return m["tools.archiveViewer.kindDirectory"]();
    case "symlink":
      return m["tools.archiveViewer.kindSymlink"]();
    case "other":
      return m["common.archivekindOther"]();
  }
}

function ArchiveViewerContent() {
  const locale = getLocale();
  const id = useId();
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const [filename, setFilename] = useState("");
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [directory, setDirectory] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ArchiveCode | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const previewState = useOverlayState({
    isOpen: Boolean(preview),
    onOpenChange: (open) => {
      if (!open && preview) closePreview();
    },
  });
  const bytes = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const urls = useRef(new Set<string>());

  function invalidate() {
    revision.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError(null);
  }

  function releaseUrls() {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }

  function closePreview() {
    invalidate();
    releaseUrls();
    setPreview(null);
    setSelectedPath("");
  }

  function clear() {
    closePreview();
    bytes.current = null;
    setResult(null);
    setFilename("");
    setFileSize(null);
    setDirectory("");
    setQuery("");
    setContextMenu(null);
  }

  useEffect(
    () => () => {
      revision.current++;
      controller.current?.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  async function open(file: File) {
    clear();
    setFilename(file.name);
    setFileSize(file.size);
    const turn = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      if (file.size > ARCHIVE_INPUT_LIMIT)
        throw new ArchiveError("input_limit");
      const source = new Uint8Array(await file.arrayBuffer());
      abort.signal.throwIfAborted();
      const loaded = await runArchiveWorker(
        { bytes: source, filename: file.name, action: "list" },
        abort.signal,
      );
      if (turn !== revision.current) return;
      bytes.current = source;
      setResult(loaded);
    } catch (cause) {
      if (turn === revision.current && !abort.signal.aborted)
        setError(cause instanceof ArchiveError ? cause.code : "read_failed");
    } finally {
      if (turn === revision.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  async function extract(entry: ArchiveEntry, show: boolean) {
    closePreview();
    const source = bytes.current;
    if (!source) return;
    const turn = revision.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setSelectedPath(show ? entry.path : "");
    if (show) setPreview({ status: "loading", entry });
    try {
      const loaded = await runArchiveWorker(
        {
          bytes: source,
          filename,
          action: show ? "preview" : "extract",
          entryId: entry.id,
        },
        abort.signal,
      );
      abort.signal.throwIfAborted();
      if (turn !== revision.current || !loaded.bytes) return;
      const content = loaded.bytes;
      let kind = show ? previewKind(entry.path) : null;
      let imageSource: File | undefined;
      if (kind === "pdf" && content.length > 128 * 1048576) kind = null;
      if (kind === "image") {
        try {
          const [{ decodeBrowser }, { archiveImageSource }] = await Promise.all(
            [
              import("@/features/tools/image-formats/browser"),
              import("./image-preview"),
            ],
          );
          imageSource = archiveImageSource(content);
          await decodeBrowser(imageSource, abort.signal);
        } catch {
          kind = null;
        }
      }
      abort.signal.throwIfAborted();
      if (turn !== revision.current) return;
      const url = URL.createObjectURL(
        kind === "image" && imageSource
          ? imageSource
          : new Blob([content], {
              type:
                kind === "pdf" ? "application/pdf" : "application/octet-stream",
            }),
      );
      urls.current.add(url);
      if (show) {
        const downloadUrl = (() => {
          if (kind !== "image") return url;
          const originalUrl = URL.createObjectURL(new Blob([content]));
          urls.current.add(originalUrl);
          return originalUrl;
        })();
        setPreview({
          status: "ready",
          entry,
          url,
          downloadUrl,
          kind,
          ...(kind === "text"
            ? {
                text: loaded.previewText ?? new TextDecoder().decode(content),
                highlighted: loaded.highlighted,
              }
            : {}),
        });
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = downloadName(entry.path);
        anchor.click();
      }
    } catch (cause) {
      if (turn === revision.current && !abort.signal.aborted) {
        const code = cause instanceof ArchiveError ? cause.code : "read_failed";
        if (show) setPreview({ status: "unavailable", entry, code });
        else setError(code);
      }
    } finally {
      if (turn === revision.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  const rows = useMemo(
    () => folderRows(result?.entries ?? [], directory, query),
    [result, directory, query],
  );
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale),
    [locale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  function navigate(path: string) {
    closePreview();
    setDirectory(path);
    setQuery("");
    setContextMenu(null);
  }

  const number = (value: number) => numberFormatter.format(value);
  const breadcrumbs = [
    { name: m["tools.archiveViewer.root"](), path: "" },
    ...directory
      .split("/")
      .filter(Boolean)
      .map((part, index, parts) => ({
        name: part,
        path: `${parts.slice(0, index + 1).join("/")}/`,
      })),
  ];
  const parsing = busy && !result && Boolean(filename);

  return (
    <div className="flex flex-col gap-6">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <div className="flex flex-wrap items-center gap-3">
            <Card.Title>{m["tools.archiveViewer.uploadTitle"]()}</Card.Title>
            <Chip size="sm" variant="soft">
              ZIP · TAR · GZ · TGZ
            </Chip>
          </div>
          <Card.Description>
            {m["tools.archiveViewer.uploadDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <ToolFilePicker
            label={m["tools.archiveViewer.choose"]()}
            description={m["tools.archiveViewer.supportedFormats"]()}
            accept={[
              ".zip",
              ".tar",
              ".gz",
              ".tgz",
              ".tar.gz",
              "application/zip",
              "application/gzip",
              "application/x-tar",
            ]}
            fileName={
              filename
                ? `${filename} · ${fileSize === null ? "—" : formatFileSize(fileSize, locale)}`
                : undefined
            }
            clearLabel={m["tools.archiveViewer.clear"]()}
            isDisabled={busy}
            onSelect={(file) => void open(file)}
            onClear={filename ? clear : undefined}
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      {parsing ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm"
        >
          <Spinner size="sm" />
          <span>{m["tools.archiveViewer.parsingArchive"]()}</span>
        </div>
      ) : null}

      {error ? (
        <Alert status="danger" role="alert">
          <Alert.Indicator>
            <TriangleAlert aria-hidden className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>{m["tools.archiveViewer.errorTitle"]()}</Alert.Title>
            <Alert.Description>{archiveErrorMessage(error)}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {result ? (
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            [m["common.archiveformat"](), result.format.toUpperCase()],
            [
              m["tools.archiveViewer.compressed"](),
              formatFileSize(result.archiveBytes, locale),
            ],
            [
              m["tools.archiveViewer.archiveExpanded"](),
              formatFileSize(result.uncompressedBytes, locale),
            ],
            [m["tools.archiveViewer.entries"](), number(result.entries.length)],
            [
              m["common.archivefiles"](),
              number(
                result.entries.filter((entry) => entry.kind === "file").length,
              ),
            ],
            [
              m["tools.archiveViewer.folders"](),
              number(
                result.entries.filter((entry) => entry.kind === "directory")
                  .length,
              ),
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-surface p-3 shadow-surface"
            >
              <dt className="text-xs font-medium text-muted uppercase">
                {label}
              </dt>
              <dd className="mt-1 truncate text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <ToolPanelCard className="min-h-128">
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["tools.archiveViewer.explorerTitle"]()}</Card.Title>
          <Card.Description>
            {m["tools.archiveViewer.explorerDescription"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <nav
              aria-label={m["tools.archiveViewer.folders"]()}
              className="flex min-w-0 flex-wrap items-center gap-2 text-sm"
            >
              {breadcrumbs.map((breadcrumb, index) => (
                <div
                  key={breadcrumb.path || "root"}
                  className="flex items-center gap-1"
                >
                  {index > 0 ? (
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 shrink-0 text-muted"
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isDisabled={parsing}
                    onPress={() => navigate(breadcrumb.path)}
                  >
                    {breadcrumb.name}
                  </Button>
                </div>
              ))}
            </nav>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                isDisabled={!directory || parsing}
                onPress={() =>
                  navigate(
                    directory
                      .split("/")
                      .filter(Boolean)
                      .slice(0, -1)
                      .join("/")
                      .replace(/(.+)/, "$1/"),
                  )
                }
              >
                <ChevronUp aria-hidden className="size-4" />
                {m["tools.archiveViewer.archiveUp"]()}
              </Button>
              <label className="sr-only" htmlFor={`${id}-search`}>
                {m["tools.archiveViewer.search"]()}
              </label>
              <div className="relative min-w-0 sm:w-64">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute inset-s-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  id={`${id}-search`}
                  name="archive-viewer-search"
                  autoComplete="off"
                  aria-label={m["tools.archiveViewer.search"]()}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={m["tools.archiveViewer.searchPlaceholder"]()}
                  className="ps-8"
                />
              </div>
            </div>
          </div>

          {rows.length ? (
            <div className="min-h-0 overflow-x-auto rounded-xl border border-border">
              <table
                aria-label={m["tools.archiveViewer.explorerTitle"]()}
                className="w-full min-w-208 table-fixed border-separate border-spacing-0 text-sm"
              >
                <colgroup>
                  <col />
                  <col className="w-32" />
                  <col className="w-32" />
                  <col className="w-48" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-separator">
                    {[
                      m["tools.archiveViewer.path"](),
                      m["tools.archiveViewer.kind"](),
                      m["common.archivesize"](),
                      m["tools.archiveViewer.modified"](),
                      m["tools.archiveViewer.action"](),
                    ].map((label, index) => (
                      <th
                        key={label}
                        scope="col"
                        className={`border-b border-separator bg-surface-secondary px-2 py-2.5 font-medium whitespace-nowrap ${
                          index === 4
                            ? "sticky inset-e-0 border-s border-separator bg-surface text-end"
                            : "text-start"
                        }`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const entry = row.entry;
                    const kind = row.directory
                      ? "directory"
                      : (entry?.kind ?? "other");
                    const selected = Boolean(
                      entry && selectedPath === entry.path,
                    );
                    return (
                      <tr
                        key={row.key}
                        data-selected={selected || undefined}
                        className="group/archive-row border-b border-separator transition-colors hover:bg-default/50 data-selected:bg-default"
                        onContextMenu={(event) => {
                          if (entry?.kind !== "file" || entry.encrypted) return;
                          event.preventDefault();
                          setContextMenu({
                            entry,
                            left: Math.max(
                              8,
                              Math.min(event.clientX, window.innerWidth - 176),
                            ),
                            top: Math.max(
                              8,
                              Math.min(event.clientY, window.innerHeight - 96),
                            ),
                          });
                        }}
                      >
                        <td className="min-w-0 border-b border-separator px-2 py-2">
                          {row.directory || entry?.kind === "file" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              isDisabled={
                                !row.directory && (busy || entry?.encrypted)
                              }
                              className={`flex max-w-full items-center gap-2 rounded-lg text-start outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-focus ${
                                entry?.kind === "file" ? "font-medium" : ""
                              } disabled:pointer-events-none disabled:opacity-50`}
                              aria-label={
                                row.directory
                                  ? m["tools.archiveViewer.openfolder"]()
                                  : `${m["common.archivepreview"]()}: ${row.name}`
                              }
                              onClick={() => {
                                if (row.directory) navigate(row.directory);
                                else if (entry) void extract(entry, true);
                              }}
                            >
                              {row.directory ? (
                                <Folder
                                  aria-hidden
                                  className="size-4 shrink-0"
                                />
                              ) : (
                                <File aria-hidden className="size-4 shrink-0" />
                              )}
                              <span className="truncate">{row.name}</span>
                            </Button>
                          ) : (
                            <div className="flex min-w-0 items-center gap-2">
                              <File aria-hidden className="size-4 shrink-0" />
                              <span className="truncate">{row.name}</span>
                            </div>
                          )}
                          {entry?.unsafePath ? (
                            <p className="mt-1 text-xs text-danger">
                              {m["tools.archiveViewer.unsafe"]()}
                            </p>
                          ) : null}
                          {entry?.encrypted ? (
                            <p className="mt-1 text-xs text-muted">
                              {m["common.archiveencrypted"]()}
                            </p>
                          ) : null}
                          {entry?.linkTarget ? (
                            <p className="mt-1 text-xs break-all text-muted">
                              → {entry.linkTarget}
                            </p>
                          ) : null}
                        </td>
                        <td className="border-b border-separator px-2 py-2 whitespace-nowrap">
                          {archiveKindLabel(kind)}
                        </td>
                        <td className="border-b border-separator px-2 py-2 whitespace-nowrap">
                          {entry ? formatFileSize(entry.size, locale) : "—"}
                        </td>
                        <td className="border-b border-separator px-2 py-2 whitespace-nowrap">
                          {entry?.modifiedAt
                            ? dateFormatter.format(new Date(entry.modifiedAt))
                            : "—"}
                        </td>
                        <td className="sticky inset-e-0 flex items-center justify-end border-s border-separator bg-surface px-2 py-1.5 group-hover/archive-row:bg-default/50 group-data-selected:bg-default">
                          {entry?.kind === "file" ? (
                            <div className="flex items-center gap-0.5 rounded-lg border border-transparent bg-default/70 p-0.5 transition-colors group-hover/archive-row:border-border group-data-selected:border-border">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                isDisabled={busy || entry.encrypted}
                                aria-label={m["common.archivepreview"]()}
                                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-default hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                                onClick={() => void extract(entry, true)}
                              >
                                <Eye aria-hidden className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                isDisabled={busy || entry.encrypted}
                                aria-label={`${m["tools.archiveViewer.download"]()}: ${row.name}`}
                                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-default hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                                onClick={() => void extract(entry, false)}
                              >
                                <Download aria-hidden className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty className="min-h-64">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Folder aria-hidden className="size-4" />
                </EmptyMedia>
                <EmptyTitle>
                  {result
                    ? m["tools.archiveViewer.emptyFolderTitle"]()
                    : m["tools.archiveViewer.noArchiveTitle"]()}
                </EmptyTitle>
                <EmptyDescription>
                  {result
                    ? m["tools.archiveViewer.emptyFolderDescription"]()
                    : m["tools.archiveViewer.noArchiveDescription"]()}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      {contextMenu ? (
        <fieldset
          aria-label={contextMenu.entry.path}
          className="fixed z-50 grid min-w-40 gap-1 rounded-xl border border-border bg-surface p-1 shadow-surface"
          style={{ left: contextMenu.left, top: contextMenu.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex min-h-8 items-center gap-2 rounded-lg px-3 py-1.5 text-start text-sm hover:bg-default focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            onClick={() => {
              const { entry } = contextMenu;
              setContextMenu(null);
              void extract(entry, true);
            }}
          >
            <Eye aria-hidden className="size-4" />
            {m["common.archivepreview"]()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex min-h-8 items-center gap-2 rounded-lg px-3 py-1.5 text-start text-sm hover:bg-default focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            onClick={() => {
              const { entry } = contextMenu;
              setContextMenu(null);
              void extract(entry, false);
            }}
          >
            <Download aria-hidden className="size-4" />
            {m["tools.archiveViewer.download"]()}
          </Button>
        </fieldset>
      ) : null}

      {preview ? (
        <Modal.Backdrop
          isOpen={previewState.isOpen}
          onOpenChange={previewState.setOpen}
        >
          <Modal.Container className="max-h-[90vh] overflow-hidden sm:max-w-5xl">
            <Modal.Dialog className="gap-0 p-0">
              <Modal.Header className="border-b border-separator px-4 py-4 pe-12">
                <Modal.Heading className="break-all">
                  {preview?.entry.path ?? m["common.archivepreview"]()}
                </Modal.Heading>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{m["tools.archiveViewer.previewDescription"]()}</span>
                  {preview ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{formatFileSize(preview.entry.size, locale)}</span>
                    </>
                  ) : null}
                </p>
              </Modal.Header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {preview?.status === "loading" ? (
                  <div
                    role="status"
                    className="flex min-h-80 items-center justify-center gap-2 rounded-xl border border-border"
                  >
                    <Spinner size="sm" />
                    <span className="text-sm text-muted">
                      {m["tools.archiveViewer.loadingPreview"]()}
                    </span>
                  </div>
                ) : null}
                {preview?.status === "ready" && preview.kind === "text" ? (
                  <section aria-label={m["common.archivepreview"]()}>
                    <CodeBlock
                      code={preview.text ?? ""}
                      language={preview.entry.path.split(".").at(-1)}
                      maxHeightClassName="max-h-[70vh]"
                      codeClassName="[&_.hljs-keyword]:text-accent [&_.hljs-string]:text-success [&_.hljs-comment]:text-muted"
                    >
                      <Highlighted
                        value={preview.highlighted}
                        text={preview.text ?? ""}
                      />
                    </CodeBlock>
                  </section>
                ) : null}
                {preview?.status === "ready" && preview.kind === "image" ? (
                  <section
                    aria-label={m["common.archivepreview"]()}
                    className="flex min-h-80 items-center justify-center rounded-xl border border-border bg-default/20 p-3"
                  >
                    <img
                      src={preview.url}
                      alt={preview.entry.path}
                      className="max-h-[70vh] max-w-full object-contain"
                    />
                  </section>
                ) : null}
                {preview?.status === "ready" && preview.kind === "pdf" ? (
                  navigator.pdfViewerEnabled === false ? (
                    <Alert>
                      <Alert.Indicator>
                        <FileText aria-hidden className="size-4" />
                      </Alert.Indicator>
                      <Alert.Content>
                        <Alert.Description>
                          {m["tools.archiveViewer.nopreview"]()}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : (
                    <section
                      aria-label={m["common.archivepreview"]()}
                      className="min-h-80 overflow-hidden rounded-xl border border-border bg-default/20"
                    >
                      <iframe
                        src={preview.url}
                        title={`${m["common.archivepreview"]()}: ${preview.entry.path}`}
                        className="h-[70vh] min-h-80 w-full border-0"
                      />
                    </section>
                  )
                ) : null}
                {preview?.status === "ready" && preview.kind === null ? (
                  <Alert>
                    <Alert.Indicator>
                      <FileText aria-hidden className="size-4" />
                    </Alert.Indicator>
                    <Alert.Content>
                      <Alert.Description>
                        {m["tools.archiveViewer.nopreview"]()}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
                {preview?.status === "unavailable" ? (
                  <Alert status="danger" role="alert">
                    <Alert.Indicator>
                      <ImageIcon aria-hidden className="size-4" />
                    </Alert.Indicator>
                    <Alert.Content>
                      <Alert.Description>
                        {archiveErrorMessage(preview.code)}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-separator bg-default/50 p-4">
                {preview?.status === "ready" && preview.kind === "text" ? (
                  <ToolCopyButton
                    value={preview.text ?? ""}
                    copyLabel={m["tools.archiveViewer.archiveCopy"]()}
                    copiedLabel={m["common.actions.copied"]()}
                  />
                ) : null}
                {preview?.status === "ready" ? (
                  <a
                    href={preview.downloadUrl}
                    download={downloadName(preview.entry.path)}
                    className="inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-default focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  >
                    <Download aria-hidden className="size-4" />
                    {m["tools.archiveViewer.download"]()}
                  </a>
                ) : null}
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      ) : null}

      <ToolArticle>
        <p>{m["tools.archiveViewer.articleLead"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <p>{m["tools.archiveViewer.articleWhenBody"]()}</p>
        <h2>{m["tools.archiveViewer.article.privacyTitle"]()}</h2>
        <p>{m["tools.archiveViewer.articlePrivacyBody"]()}</p>
        <h2>{m["tools.archiveViewer.articleFormatsTitle"]()}</h2>
        <p>{m["tools.archiveViewer.articleFormatsBody"]()}</p>
        <h2>{m["tools.archiveViewer.articlePreviewTitle"]()}</h2>
        <p>{m["tools.archiveViewer.articlePreviewBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function ArchiveViewer() {
  return (
    <ToolPage>
      <ArchiveViewerContent />
    </ToolPage>
  );
}
