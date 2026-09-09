/* biome-ignore-all lint/a11y/useMediaCaption: User-recorded local audio has no separate caption track. */
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Chip, Spinner } from "@heroui/react";
import {
  Download,
  Mic,
  Pause,
  Play,
  Square,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/base/empty";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { downloadUrl } from "@/lib/download";
import { recordingDuration, recordingSize } from "./logic";
import { useAudioRecorder } from "./use-audio-recorder";

function PanelHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      {description ? <Card.Description>{description}</Card.Description> : null}
    </Card.Header>
  );
}

function AudioRecorderPageContent() {
  const recorder = useAudioRecorder();
  const status =
    recorder.status === "recording"
      ? m["tools.audioRecorder.recording"]()
      : recorder.status === "paused"
        ? m["common.swpaused"]()
        : m["tools.audioRecorder.idle"]();
  const errorTitle =
    recorder.error === "permission"
      ? m["tools.audioRecorder.permissionTitle"]()
      : recorder.error === "failed"
        ? m["tools.audioRecorder.failedTitle"]()
        : recorder.error === "limit"
          ? m["tools.audioRecorder.limitTitle"]()
          : "";
  const errorText =
    recorder.error === "permission"
      ? m["tools.audioRecorder.permission"]()
      : recorder.error === "failed"
        ? m["tools.audioRecorder.failed"]()
        : recorder.error === "limit"
          ? m["tools.audioRecorder.limit"]()
          : "";

  function download() {
    if (!recorder.recording) return;
    downloadUrl(recorder.recording.url, recorder.recording.name);
  }

  return (
    <div className="grid gap-8">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <ToolPanelCard>
          <PanelHeader
            title={m["tools.audioRecorder.recorder"]()}
            description={m["tools.audioRecorder.recorderDescription"]()}
          />
          <ToolPanelCardContent className="grid gap-5 py-4">
            {!recorder.supported ? (
              <Notice
                title={m["tools.audioRecorder.unsupportedTitle"]()}
                body={m["tools.audioRecorder.unsupported"]()}
              />
            ) : null}
            {recorder.error ? (
              <Notice title={errorTitle} body={errorText} danger />
            ) : null}

            <div className="flex min-h-52 flex-col items-center justify-center gap-5 p-5 text-center">
              <div
                aria-hidden
                className={`flex size-20 items-center justify-center rounded-full border bg-background ring-8 transition-colors ${
                  recorder.status === "recording"
                    ? "border-danger/30 text-danger ring-danger/10"
                    : recorder.status === "paused"
                      ? "border-accent/30 text-accent ring-accent/10"
                      : "border-border text-muted ring-default"
                }`}
              >
                <Mic className="size-7" />
              </div>

              <div className="grid gap-2">
                <p
                  className="font-mono text-5xl leading-none font-semibold tabular-nums"
                  aria-live="polite"
                >
                  {recordingDuration(recorder.elapsed)}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="text-sm text-muted">
                    {m["tools.audioRecorder.status"]()}
                  </span>
                  <Chip
                    color={
                      recorder.status === "recording" ? "danger" : "default"
                    }
                    variant="soft"
                  >
                    {status}
                  </Chip>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {recorder.status === "idle" ? (
                  <Button
                    variant="danger"
                    isDisabled={!recorder.supported || recorder.preparing}
                    onPress={recorder.start}
                  >
                    {recorder.preparing ? (
                      <Spinner size="sm" />
                    ) : (
                      <Mic aria-hidden className="size-4" />
                    )}
                    {recorder.preparing
                      ? m["tools.audioRecorder.preparing"]()
                      : m["tools.audioRecorder.record"]()}
                  </Button>
                ) : null}
                {recorder.status === "recording" ? (
                  <Button variant="secondary" onPress={recorder.pause}>
                    <Pause aria-hidden className="size-4" />
                    {m["common.swpause"]()}
                  </Button>
                ) : null}
                {recorder.status === "paused" ? (
                  <Button variant="secondary" onPress={recorder.resume}>
                    <Play aria-hidden className="size-4" />
                    {m["common.swresume"]()}
                  </Button>
                ) : null}
                {recorder.status !== "idle" ? (
                  <Button variant="danger" onPress={recorder.stop}>
                    <Square aria-hidden className="size-4" />
                    {m["shared.barcode.stop"]()}
                  </Button>
                ) : null}
                {recorder.error === "permission" &&
                recorder.status === "idle" ? (
                  <Button variant="outline" onPress={recorder.start}>
                    {m["tools.audioRecorder.retry"]()}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 text-sm text-muted">
              <p>{m["tools.audioRecorder.formatNote"]()}</p>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <PanelHeader title={m["tools.audioRecorder.output"]()} />
          <ToolPanelCardContent className="py-4">
            {recorder.recording ? (
              <div className="grid gap-5">
                <audio
                  className="w-full"
                  controls
                  src={recorder.recording.url}
                  aria-label={m["tools.audioRecorder.playback"]()}
                />
                <dl className="grid gap-3 sm:grid-cols-3">
                  <Stat
                    label={m["tools.audioRecorder.duration"]()}
                    value={recordingDuration(recorder.recording.durationMs)}
                  />
                  <Stat
                    label={m["tools.audioRecorder.size"]()}
                    value={recordingSize(recorder.recording.blob.size)}
                  />
                  <Stat
                    label={m["common.archiveformat"]()}
                    value={
                      recorder.recording.mimeType ||
                      m["tools.userAgentParser.devUnknown"]()
                    }
                    code
                  />
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button onPress={download}>
                    <Download aria-hidden className="size-4" />
                    {m["common.actions.download"]()}
                  </Button>
                  <Button variant="outline" onPress={recorder.clear}>
                    <Trash2 aria-hidden className="size-4" />
                    {m["common.clear"]()}
                  </Button>
                </div>
              </div>
            ) : (
              <Empty className="min-h-80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Mic aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle>
                    {m["tools.audioRecorder.emptyTitle"]()}
                  </EmptyTitle>
                  <EmptyDescription>
                    {m["tools.audioRecorder.empty"]()}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.audioRecorder.articleOfflineTitle"]()}</h2>
        <p>{m["tools.audioRecorder.articleOfflineBody"]()}</p>
        <h2>{m["tools.audioRecorder.articleUsesTitle"]()}</h2>
        <p>{m["tools.audioRecorder.articleUsesBody"]()}</p>
        <h2>{m["tools.audioRecorder.articlePrivacyTitle"]()}</h2>
        <p>{m["tools.audioRecorder.articlePrivacyBody"]()}</p>
        <h2>{m["tools.audioRecorder.articleTipsTitle"]()}</h2>
        <p>{m["tools.audioRecorder.articleTipsBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function AudioRecorderPage() {
  return (
    <ToolPage>
      <AudioRecorderPageContent />
    </ToolPage>
  );
}

function Notice({
  title,
  body,
  danger = false,
}: {
  title: string;
  body: string;
  danger?: boolean;
}) {
  return (
    <Alert status={danger ? "danger" : "default"} role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{body}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function Stat({
  label,
  value,
  code = false,
}: {
  label: string;
  value: string;
  code?: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-background p-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        className={`min-w-0 text-sm font-medium wrap-break-word ${
          code ? "font-mono text-xs break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
