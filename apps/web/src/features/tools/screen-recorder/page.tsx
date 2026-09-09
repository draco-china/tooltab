import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Chip,
  InputGroup,
  Label,
  Link,
  Spinner,
  Switch,
} from "@heroui/react";
import {
  Download,
  Mic,
  MicOff,
  MonitorUp,
  Pause,
  Play,
  Square,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  screenDownloadName,
  screenDuration,
  screenExtension,
  screenSize,
} from "./logic";
import { useScreenRecorder } from "./use-recorder";

const EMPTY_CAPTIONS_TRACK = "data:text/vtt,WEBVTT%0A%0A";

function ScreenRecorderContent() {
  const recorder = useScreenRecorder();
  const filenameId = useId();
  const [filename, setFilename] = useState<string>(
    m["tools.screenRecorder.outputFileNamePlaceholder"](),
  );

  useEffect(() => {
    if (recorder.output) {
      setFilename(recorder.output.name.replace(/\.(?:webm|mkv|mp4|mov)$/i, ""));
    }
  }, [recorder.output]);

  const active = recorder.status !== "idle" || recorder.preparing;
  const statusLabel =
    recorder.supportStatus === "checking"
      ? m["tools.screenRecorder.recorderStatusChecking"]()
      : recorder.status === "recording"
        ? m["tools.screenRecorder.recorderStatusRecording"]()
        : recorder.status === "paused"
          ? m["common.swpaused"]()
          : m["tools.pdfMerger.readyStatusLabel"]();
  const alert = recorder.supported
    ? recorder.failure
      ? failureAlert(recorder.failure)
      : null
    : recorder.supportStatus === "unsupported"
      ? {
          title: m["tools.screenRecorder.alertsUnsupportedTitle"](),
          description: m["tools.screenRecorder.alertsUnsupportedDescription"](),
          danger: false,
        }
      : null;
  const startLabel = recorder.preparing
    ? m["tools.screenRecorder.recorderPreparingLabel"]()
    : recorder.failure === "screenPermission" ||
        recorder.failure === "microphonePermission"
      ? m["tools.audioRecorder.retry"]()
      : m["tools.camera.startRecordingLabel"]();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(17.5rem,0.8fr)]">
        <ToolPanelCard aria-labelledby="screen-recorder-controls-title">
          <PanelHeader
            id="screen-recorder-controls-title"
            title={m["tools.screenRecorder.recorderTitle"]()}
            description={m["tools.screenRecorder.recorderDescription"]()}
          />
          <ToolPanelCardContent className="gap-4 py-4">
            {alert ? <Notice {...alert} /> : null}

            <div className="grid gap-3 rounded-lg bg-default/50 p-3 sm:grid-cols-2">
              <Metric
                label={m["tools.audioRecorder.status"]()}
                value={statusLabel}
              />
              <Metric
                label={m["tools.audioRecorder.duration"]()}
                value={screenDuration(recorder.elapsed)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {recorder.status === "idle" ? (
                <Button
                  variant="danger"
                  isDisabled={!recorder.supported || recorder.preparing}
                  onPress={recorder.start}
                >
                  {recorder.preparing ? (
                    <Spinner size="sm" />
                  ) : (
                    <MonitorUp aria-hidden className="size-4" />
                  )}
                  {startLabel}
                </Button>
              ) : recorder.status === "paused" ? (
                <Button onPress={recorder.resume}>
                  <Play aria-hidden className="size-4" />
                  {m["common.swresume"]()}
                </Button>
              ) : (
                <Button variant="outline" onPress={recorder.pause}>
                  <Pause aria-hidden className="size-4" />
                  {m["common.swpause"]()}
                </Button>
              )}
              {recorder.status !== "idle" ? (
                <Button variant="danger" onPress={recorder.stop}>
                  <Square aria-hidden className="size-4" />
                  {m["shared.barcode.stop"]()}
                </Button>
              ) : null}
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard aria-labelledby="screen-recorder-settings-title">
          <PanelHeader
            id="screen-recorder-settings-title"
            title={m["tools.screenRecorder.settingsTitle"]()}
            description={m["tools.screenRecorder.settingsDescription"]()}
          />
          <ToolPanelCardContent className="divide-y divide-separator py-1">
            <CaptureOption
              icon={<Mic aria-hidden className="size-4" />}
              label={m["tools.screenRecorder.settingsSystemAudioLabel"]()}
              description={m[
                "tools.screenRecorder.settingsSystemAudioDescription"
              ]()}
              selected={recorder.includeSystemAudio}
              disabled={active}
              onChange={recorder.setIncludeSystemAudio}
            />
            <CaptureOption
              icon={
                recorder.microphoneSupported ? (
                  <Mic aria-hidden className="size-4" />
                ) : (
                  <MicOff aria-hidden className="size-4" />
                )
              }
              label={m["tools.screenRecorder.settingsMicrophoneLabel"]()}
              description={
                recorder.microphoneSupported
                  ? m["tools.screenRecorder.settingsMicrophoneDescription"]()
                  : m["tools.screenRecorder.settingsMicrophoneUnsupported"]()
              }
              selected={recorder.includeMicrophone}
              disabled={active || !recorder.microphoneSupported}
              onChange={recorder.setIncludeMicrophone}
            />
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolPanelCard
        role="region"
        aria-labelledby="screen-recorder-output-title"
      >
        <Card.Header className="flex flex-col items-start gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
          <div className="grid min-w-0 gap-1">
            <Card.Title id="screen-recorder-output-title">
              {m["tools.screenRecorder.outputTitle"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.screenRecorder.outputDescription"]()}
            </Card.Description>
          </div>
          {recorder.output ? (
            <div className="flex w-full shrink-0 flex-wrap justify-start gap-2 sm:w-auto sm:justify-end">
              <Button variant="outline" onPress={recorder.clear}>
                <Trash2 aria-hidden className="size-4" />
                {m["common.clear"]()}
              </Button>
              <Link
                href={recorder.output.url}
                download={screenDownloadName(
                  filename,
                  recorder.output.mimeType,
                )}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-foreground transition-opacity duration-200 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Download aria-hidden className="size-4" />
                {m["tools.screenRecorder.outputDownloadLabel"]()}
              </Link>
            </div>
          ) : null}
        </Card.Header>
        <ToolPanelCardContent className="p-0">
          {recorder.output ? (
            <div className="grid gap-0">
              <video
                className="aspect-video w-full bg-black object-contain"
                controls
                playsInline
                src={recorder.output.url}
                aria-label={m["tools.screenRecorder.outputTitle"]()}
              >
                <track
                  kind="captions"
                  src={EMPTY_CAPTIONS_TRACK}
                  label={m["tools.screenRecorder.outputTitle"]()}
                />
              </video>

              <dl className="grid gap-3 border-y border-separator px-4 py-3 sm:grid-cols-2">
                <OutputMetric
                  label={m["common.archiveformat"]()}
                  value={
                    recorder.output.mimeType ||
                    m["tools.userAgentParser.devUnknown"]()
                  }
                />
                <OutputMetric
                  label={m["tools.audioRecorder.size"]()}
                  value={screenSize(recorder.output.blob.size)}
                />
              </dl>

              <div className="grid gap-2 px-4 py-4">
                <Label htmlFor={filenameId}>
                  {m["common.datauriFilename"]()}
                </Label>
                <InputGroup variant="secondary" fullWidth>
                  <InputGroup.Input
                    id={filenameId}
                    value={filename}
                    placeholder={m[
                      "tools.screenRecorder.outputFileNamePlaceholder"
                    ]()}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setFilename(event.currentTarget.value)}
                  />
                  <InputGroup.Suffix className="font-mono text-xs text-muted">
                    .{screenExtension(recorder.output.mimeType)}
                  </InputGroup.Suffix>
                </InputGroup>
              </div>
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-surface text-muted">
                <MonitorUp aria-hidden className="size-5" />
              </div>
              <div className="grid max-w-lg gap-1">
                <p className="font-medium">
                  {m["tools.screenRecorder.outputEmptyTitle"]()}
                </p>
                <p className="text-sm leading-6 text-muted">
                  {m["tools.screenRecorder.outputEmptyDescription"]()}
                </p>
              </div>
            </div>
          )}
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.screenRecorder.articleTitle"]()}</h2>
        <p>{m["tools.screenRecorder.articleIntro"]()}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]()}</h2>
        <p>{m["tools.screenRecorder.articleUsesBody"]()}</p>
        <h2>{m["tools.screenRecorder.articlePrivacyTitle"]()}</h2>
        <p>{m["tools.screenRecorder.articlePrivacyBody"]()}</p>
        <h2>{m["tools.screenRecorder.articleTipsTitle"]()}</h2>
        <p>{m["tools.screenRecorder.articleTipsBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function PanelHeader({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title id={id}>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function CaptureOption({
  icon,
  label,
  description,
  selected,
  disabled,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Switch
      isSelected={selected}
      isDisabled={disabled}
      onChange={onChange}
      aria-label={label}
      className="flex min-h-20 w-full flex-row! items-center! justify-between py-3"
    >
      <Switch.Content className="flex w-full items-center justify-between gap-4">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium">
            {icon}
            {label}
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted">
            {description}
          </span>
        </span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function Notice({
  title,
  description,
  danger,
}: {
  title: string;
  description: string;
  danger: boolean;
}) {
  return (
    <Alert status={danger ? "danger" : "default"} role="alert">
      <Alert.Indicator>
        <TriangleAlert aria-hidden className="size-4" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <Chip variant="soft" aria-live="polite">
        {value}
      </Chip>
    </div>
  );
}

function OutputMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="truncate font-mono text-sm">{value}</dd>
    </div>
  );
}

function failureAlert(
  failure:
    | "screenPermission"
    | "microphonePermission"
    | "microphoneUnsupported"
    | "failed"
    | "limit",
) {
  if (failure === "screenPermission")
    return {
      title: m["tools.screenRecorder.alertsScreenPermissionTitle"](),
      description:
        m["tools.screenRecorder.alertsScreenPermissionDescription"](),
      danger: true,
    };
  if (failure === "microphonePermission")
    return {
      title: m["tools.screenRecorder.alertsMicrophonePermissionTitle"](),
      description:
        m["tools.screenRecorder.alertsMicrophonePermissionDescription"](),
      danger: true,
    };
  if (failure === "microphoneUnsupported")
    return {
      title: m["tools.screenRecorder.alertsMicrophoneUnsupportedTitle"](),
      description: m["tools.screenRecorder.alertsGenericErrorDescription"](),
      danger: true,
    };
  if (failure === "limit")
    return {
      title: m["tools.screenRecorder.alertsLimitTitle"](),
      description: m["tools.screenRecorder.alertsLimitDescription"](),
      danger: true,
    };
  return {
    title: m["tools.screenRecorder.alertsGenericErrorTitle"](),
    description: m["tools.screenRecorder.alertsGenericErrorDescription"](),
    danger: true,
  };
}

export default function ScreenRecorder() {
  return (
    <ToolPage>
      <ScreenRecorderContent />
    </ToolPage>
  );
}
