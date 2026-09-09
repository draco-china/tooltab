import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Slider,
  Switch,
  TextArea,
} from "@heroui/react";
import { Download, LayoutGrid, TriangleAlert } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolColorPicker } from "@/components/base/tool-color-picker";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { ToolPasswordInput } from "@/components/base/tool-password-input";
import { downloadUrl } from "@/lib/download";
import { apiOrigin } from "@/lib/site-origin";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { qrBlob } from "../qr-tools/browser";
import { qrErrorMessages } from "../qr-tools/error-messages";
import { qrPayload } from "@workspace/tools/encoding/qr-payload";
import {
  type QrContent,
  QrError,
  type QrFormat,
  type QrOptions,
  qrContentSchema,
  qrOptionsSchema,
  qrTypes,
} from "@workspace/tools/encoding/qr-contract";
import { runQrWorker } from "../qr-tools/worker-client";

type QrType = (typeof qrTypes)[number];
type Draft = Record<string, string | boolean>;
type Drafts = Record<QrType, Draft>;
type MissingReason =
  | "text"
  | "wifiSsid"
  | "contact"
  | "smsPhone"
  | "phone"
  | "emailTo"
  | "locationCoordinates"
  | "calendarDetails";
type ErrorCode = keyof typeof qrErrorMessages;

const STORAGE_KEY = "tools:qr-code-generator:options";
const RENDER_DELAY_MS = 250;
const DEFAULT_OPTIONS = qrOptionsSchema.parse({});
const DEFAULT_DRAFTS: Drafts = {
  text: { text: apiOrigin() },
  wifi: { ssid: "", password: "", security: "WPA", hidden: false },
  contact: {
    firstName: "",
    lastName: "",
    organization: "",
    title: "",
    phone: "",
    email: "",
    website: "",
    address: "",
  },
  sms: { phone: "", message: "" },
  phone: { phone: "" },
  email: { to: "", subject: "", body: "" },
  location: { latitude: "", longitude: "", altitude: "" },
  calendar: {
    title: "",
    location: "",
    start: "",
    end: "",
    description: "",
  },
};
const COLOR_PRESETS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
] as const;

function QrGeneratorContent() {
  const locale = getLocale();
  const [type, setType] = useState<QrType>("text");
  const [drafts, setDrafts] = useState<Drafts>(DEFAULT_DRAFTS);
  const [options, setOptions] = useState<QrOptions>(DEFAULT_OPTIONS);
  const [optionsReady, setOptionsReady] = useState(false);
  const [urls, setUrls] = useState<Partial<Record<QrFormat, string>>>({});
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<ErrorCode | "">("");
  const task = useRef<AbortController | null>(null);
  const resources = useRef<string[]>([]);

  const releaseResources = useCallback(() => {
    resources.current.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    resources.current = [];
  }, []);

  const validation = useMemo(
    () => validatePayload(type, drafts[type]),
    [drafts, type],
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<QrOptions>;
        setOptions(qrOptionsSchema.parse({ ...DEFAULT_OPTIONS, ...parsed }));
      }
    } catch {
      // Invalid or unavailable preference storage falls back to safe defaults.
    } finally {
      setOptionsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!optionsReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
      // Appearance persistence is optional; QR generation remains available.
    }
  }, [options, optionsReady]);

  useEffect(() => {
    task.current?.abort();
    task.current = null;
    releaseResources();
    setUrls({});
    setRenderError("");

    if (!validation.content || !validation.payload || validation.error) {
      setIsRendering(false);
      return;
    }

    const controller = new AbortController();
    const content = validation.content;
    task.current = controller;
    setIsRendering(true);
    const timer = window.setTimeout(async () => {
      let created: string[] = [];
      try {
        const matrix = await runQrWorker(
          { kind: "generate", content, options },
          controller.signal,
        );
        const formats = ["png", "jpeg", "webp", "svg"] as const;
        const blobs = await Promise.all(
          formats.map((format) =>
            qrBlob(matrix, options, format, controller.signal),
          ),
        );
        controller.signal.throwIfAborted();
        created = blobs.map((blob) => URL.createObjectURL(blob));
        if (task.current !== controller) {
          created.forEach((url) => {
            URL.revokeObjectURL(url);
          });
          return;
        }
        resources.current = created;
        setUrls(
          Object.fromEntries(
            formats.map((format, index) => [format, created[index]]),
          ),
        );
      } catch (error) {
        created.forEach((url) => {
          URL.revokeObjectURL(url);
        });
        if (task.current === controller && !controller.signal.aborted) {
          setRenderError(toErrorCode(error));
        }
      } finally {
        if (task.current === controller) {
          task.current = null;
          setIsRendering(false);
        }
      }
    }, RENDER_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (task.current === controller) task.current = null;
    };
  }, [options, releaseResources, validation]);

  useEffect(
    () => () => {
      task.current?.abort();
      task.current = null;
      releaseResources();
    },
    [releaseResources],
  );

  const updateDraft = (key: string, value: string | boolean) => {
    setDrafts((current) => ({
      ...current,
      [type]: { ...current[type], [key]: value },
    }));
  };
  const updateOptions = (patch: Partial<QrOptions>) => {
    setOptions((current) => qrOptionsSchema.parse({ ...current, ...patch }));
  };
  const error = validation.error || renderError;

  return (
    <div className="grid min-w-0 gap-8">
      <div
        className="grid w-full min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]"
        data-tool-panels
      >
        <div className="grid min-w-0 gap-6">
          <ToolPanelCard>
            <PanelHeader
              title={m["tools.qrCodeGenerator.barcodetext"]({}, { locale })}
              description={m["tools.qrCodeGenerator.contentDescription"](
                {},
                { locale },
              )}
            />
            <ToolPanelCardContent className="gap-6 py-4">
              <SelectField
                id="qr-content-type"
                label={m["tools.qrCodeGenerator.contentTypeLabel"](
                  {},
                  { locale },
                )}
                value={type}
                options={qrTypes.map((value) => ({
                  value,
                  label: contentTypeLabel(value, locale),
                }))}
                onChange={setType}
              />
              <ActiveFields
                type={type}
                draft={drafts[type]}
                locale={locale}
                missing={validation.missing}
                onChange={updateDraft}
              />
            </ToolPanelCardContent>
            <ToolPanelCardFooter className="flex-col items-stretch gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {m["tools.qrCodeGenerator.payloadPreviewLabel"](
                    {},
                    { locale },
                  )}
                </span>
                <ToolCopyButton
                  value={validation.payload}
                  copyLabel={m["tools.qrCodeGenerator.copyPayloadLabel"](
                    {},
                    { locale },
                  )}
                  copiedLabel={m["common.actions.copied"]({}, { locale })}
                />
              </div>
              <TextArea
                aria-label={m["tools.qrCodeGenerator.payloadPreviewLabel"](
                  {},
                  { locale },
                )}
                readOnly
                dir="auto"
                rows={5}
                value={validation.payload}
                placeholder={
                  validation.missing
                    ? missingMessage(validation.missing, locale)
                    : m["tools.qrCodeGenerator.payloadEmpty"]({}, { locale })
                }
                className="min-h-28 resize-y font-mono text-xs"
              />
            </ToolPanelCardFooter>
          </ToolPanelCard>

          <ToolPanelCard>
            <PanelHeader
              title={m["tools.qrCodeGenerator.optionsTitle"]({}, { locale })}
              description={m["tools.qrCodeGenerator.optionsDescription"](
                {},
                { locale },
              )}
            />
            <ToolPanelCardContent className="grid gap-6 py-4 sm:grid-cols-2 xl:grid-cols-3">
              <SelectField
                id="qr-error-correction"
                label={m["tools.qrCodeGenerator.errorCorrectionLabel"](
                  {},
                  { locale },
                )}
                value={options.errorCorrectionLevel}
                options={(["L", "M", "Q", "H"] as const).map((value) => ({
                  value,
                  label: correctionLabel(value, locale),
                }))}
                onChange={(errorCorrectionLevel) =>
                  updateOptions({ errorCorrectionLevel })
                }
              />
              <SliderField
                label={m["tools.cssGradientGenerator.sizeLabel"](
                  {},
                  { locale },
                )}
                value={options.size}
                min={128}
                max={1024}
                step={8}
                onChange={(size) => updateOptions({ size })}
              />
              <SliderField
                label={m["tools.qrCodeGenerator.marginLabel"]({}, { locale })}
                value={options.margin}
                min={0}
                max={12}
                step={1}
                onChange={(margin) => updateOptions({ margin })}
              />
              <ToolColorPicker
                label={m["tools.qrCodeGenerator.darkColorLabel"](
                  {},
                  { locale },
                )}
                value={options.darkColor}
                presets={COLOR_PRESETS}
                onChange={(darkColor) => updateOptions({ darkColor })}
              />
              <ToolColorPicker
                label={m["common.faviconbackgroundcolor"]({}, { locale })}
                value={options.lightColor}
                presets={COLOR_PRESETS}
                onChange={(lightColor) => updateOptions({ lightColor })}
              />
            </ToolPanelCardContent>
          </ToolPanelCard>
        </div>

        <ToolPanelCard className="h-auto xl:sticky xl:top-6 xl:self-start">
          <PanelHeader
            title={m["common.archivepreview"]({}, { locale })}
            description={m["tools.qrCodeGenerator.previewDescription"](
              {},
              { locale },
            )}
          />
          <ToolPanelCardContent className="gap-4 py-4">
            {error ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {m["tools.qrCodeGenerator.renderErrorTitle"](
                      {},
                      { locale },
                    )}
                  </Alert.Title>
                  <Alert.Description>{errorMessage(error)}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            <div className="flex min-h-80 items-center justify-center rounded-xl border border-border bg-default/40 p-4">
              {isRendering ? (
                <div
                  className="grid w-full max-w-64 gap-3"
                  aria-label={m["common.archivepreview"]({}, { locale })}
                  role="status"
                >
                  <Skeleton className="aspect-square w-full rounded-xl" />
                  <Skeleton className="mx-auto h-4 w-2/3 rounded" />
                </div>
              ) : urls.png ? (
                <img
                  src={urls.png}
                  alt={m["tools.qrCodeGenerator.qrAlt"]({}, { locale })}
                  width={options.size}
                  height={options.size}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="grid max-w-xs justify-items-center gap-2 text-center">
                  <LayoutGrid aria-hidden className="size-6 text-muted" />
                  <p className="font-medium">
                    {m["tools.qrCodeGenerator.emptyTitle"]({}, { locale })}
                  </p>
                  <p className="text-sm leading-6 text-muted">
                    {validation.missing
                      ? m["tools.qrCodeGenerator.emptyDescription"](
                          {},
                          { locale },
                        )
                      : m["tools.qrCodeGenerator.payloadEmpty"]({}, { locale })}
                  </p>
                </div>
              )}
            </div>
          </ToolPanelCardContent>
          <ToolPanelCardFooter>
            <ToolPanelActionGroup>
              {(
                [
                  [
                    "png",
                    m["tools.codeScreenshotGenerator.downloadPngLabel"](
                      {},
                      { locale },
                    ),
                    "png",
                  ],
                  [
                    "jpeg",
                    m["tools.pdfToImageConverter.jpegFormat"]({}, { locale }),
                    "jpg",
                  ],
                  [
                    "webp",
                    m["tools.codeScreenshotGenerator.downloadWebpLabel"](
                      {},
                      { locale },
                    ),
                    "webp",
                  ],
                  [
                    "svg",
                    m["tools.codeScreenshotGenerator.downloadSvgLabel"](
                      {},
                      { locale },
                    ),
                    "svg",
                  ],
                ] as const
              ).map(([format, label, extension]) => (
                <Button
                  key={format}
                  type="button"
                  variant="outline"
                  isDisabled={!urls[format]}
                  onPress={() =>
                    downloadUrl(urls[format], `qrcode.${extension}`)
                  }
                >
                  <Download aria-hidden className="size-4" />
                  {label}
                </Button>
              ))}
            </ToolPanelActionGroup>
          </ToolPanelCardFooter>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <p>{m["tools.qrCodeGenerator.articleIntro"]({}, { locale })}</p>
        <h2>{m["tools.archiveViewer.article.whenTitle"]({}, { locale })}</h2>
        <p>
          <RichText
            text={m["tools.qrCodeGenerator.articleWhenBody"]({}, { locale })}
          />
        </p>
        <h2>
          {m["tools.qrCodeGenerator.articleOptionsTitle"]({}, { locale })}
        </h2>
        <p>{m["tools.qrCodeGenerator.articleOptionsBody"]({}, { locale })}</p>
        <h2>
          {m["tools.qrCodeGenerator.articlePrivacyTitle"]({}, { locale })}
        </h2>
        <p>{m["tools.qrCodeGenerator.articlePrivacyBody"]({}, { locale })}</p>
      </ToolArticle>
    </div>
  );
}

function PanelHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card.Header className="border-b border-separator">
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  type = "text",
  inputMode,
  autoComplete = "off",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  type?: "datetime-local" | "email" | "number" | "tel" | "text" | "url";
  inputMode?: "decimal" | "email" | "tel" | "text" | "url";
  autoComplete?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <Input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={10000}
        aria-invalid={error ? true : undefined}
        value={value}
        className="min-h-11 border border-border"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

function TextareaField({
  id,
  label,
  value,
  error,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <TextArea
        id={id}
        name={id}
        value={value}
        maxLength={10000}
        rows={5}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="min-h-32 resize-y"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label}>
      <ToolPasswordInput
        id={id}
        name={id}
        value={value}
        maxLength={10000}
        autoComplete="off"
        showLabel={m["common.httptShow"]()}
        hideLabel={m["common.httptHide"]()}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Select
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(next) => {
        if (next != null) onChange(String(next) as T);
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id} className="min-h-11 w-full">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              textValue={option.label}
            >
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm text-muted">{value}</span>
      </div>
      <Slider
        aria-label={label}
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        className="min-h-11"
        onChange={(next) => onChange(Number(next))}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
    </div>
  );
}

function ActiveFields({
  type,
  draft,
  locale,
  missing,
  onChange,
}: {
  type: QrType;
  draft: Draft;
  locale: "zh-CN" | "en-US";
  missing: MissingReason | null;
  onChange: (key: string, value: string | boolean) => void;
}) {
  const value = (key: string) => String(draft[key] ?? "");
  const error = (reason: MissingReason) =>
    missing === reason ? missingMessage(reason, locale) : undefined;

  if (type === "text") {
    return (
      <TextareaField
        id="qr-text"
        label={m["tools.qrCodeGenerator.textLabel"]({}, { locale })}
        placeholder={m["tools.qrCodeGenerator.textPlaceholder"]({}, { locale })}
        value={value("text")}
        error={error("text")}
        onChange={(next) => onChange("text", next)}
      />
    );
  }
  if (type === "wifi") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="qr-wifi-ssid"
          label={m["shared.qrTools.ssid"]({}, { locale })}
          value={value("ssid")}
          error={error("wifiSsid")}
          onChange={(next) => onChange("ssid", next)}
        />
        <SelectField
          id="qr-wifi-security"
          label={m["tools.qrCodeGenerator.wifiSecurityLabel"]({}, { locale })}
          value={value("security") as "WPA" | "WEP" | "nopass"}
          options={[
            {
              value: "WPA",
              label: m["tools.qrCodeGenerator.securityWpa"]({}, { locale }),
            },
            {
              value: "WEP",
              label: m["tools.qrCodeGenerator.securityWep"]({}, { locale }),
            },
            {
              value: "nopass",
              label: m["tools.qrCodeGenerator.securityNoPassword"](
                {},
                { locale },
              ),
            },
          ]}
          onChange={(next) => onChange("security", next)}
        />
        <PasswordField
          id="qr-wifi-password"
          label={m["common.httptPassword"]({}, { locale })}
          value={value("password")}
          onChange={(next) => onChange("password", next)}
        />
        <Switch
          isSelected={draft.hidden === true}
          onChange={(selected) => onChange("hidden", selected === true)}
        >
          <Switch.Content className="bg-field-background flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border px-3">
            <span className="text-sm font-medium">
              {m["shared.qrTools.hidden"]({}, { locale })}
            </span>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </div>
    );
  }
  if (type === "contact") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            [
              "firstName",
              m["shared.qrTools.firstname"]({}, { locale }),
              "text",
            ],
            ["lastName", m["shared.qrTools.lastname"]({}, { locale }), "text"],
            [
              "organization",
              m["shared.qrTools.organization"]({}, { locale }),
              "text",
            ],
            [
              "title",
              m["tools.qrCodeGenerator.contactTitleLabel"]({}, { locale }),
              "text",
            ],
            ["phone", m["shared.qrTools.phone"]({}, { locale }), "tel"],
            ["email", m["shared.qrTools.email"]({}, { locale }), "email"],
            ["website", m["shared.qrTools.website"]({}, { locale }), "url"],
            ["address", m["shared.qrTools.address"]({}, { locale }), "text"],
          ] as const
        ).map(([key, label, inputType]) => (
          <TextField
            key={key}
            id={`qr-contact-${key}`}
            label={label}
            value={value(key)}
            type={inputType}
            error={key === "firstName" ? error("contact") : undefined}
            onChange={(next) => onChange(key, next)}
          />
        ))}
      </div>
    );
  }
  if (type === "sms") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="qr-sms-phone"
          label={m["tools.qrCodeGenerator.phoneLabel"]({}, { locale })}
          type="tel"
          inputMode="tel"
          value={value("phone")}
          error={error("smsPhone")}
          onChange={(next) => onChange("phone", next)}
        />
        <TextareaField
          id="qr-sms-message"
          label={m["shared.qrTools.message"]({}, { locale })}
          value={value("message")}
          onChange={(next) => onChange("message", next)}
        />
      </div>
    );
  }
  if (type === "phone") {
    return (
      <TextField
        id="qr-phone"
        label={m["tools.qrCodeGenerator.phoneLabel"]({}, { locale })}
        type="tel"
        inputMode="tel"
        value={value("phone")}
        error={error("phone")}
        onChange={(next) => onChange("phone", next)}
      />
    );
  }
  if (type === "email") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="qr-email-to"
          label={m["shared.qrTools.to"]({}, { locale })}
          type="email"
          inputMode="email"
          value={value("to")}
          error={error("emailTo")}
          onChange={(next) => onChange("to", next)}
        />
        <TextField
          id="qr-email-subject"
          label={m["shared.pdfEditing.readfieldSubject"]({}, { locale })}
          value={value("subject")}
          onChange={(next) => onChange("subject", next)}
        />
        <div className="sm:col-span-2">
          <TextareaField
            id="qr-email-body"
            label={m["shared.qrTools.body"]({}, { locale })}
            value={value("body")}
            onChange={(next) => onChange("body", next)}
          />
        </div>
      </div>
    );
  }
  if (type === "location") {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="qr-location-latitude"
          label={m["shared.qrTools.latitude"]({}, { locale })}
          type="number"
          inputMode="decimal"
          value={value("latitude")}
          error={error("locationCoordinates")}
          onChange={(next) => onChange("latitude", next)}
        />
        <TextField
          id="qr-location-longitude"
          label={m["shared.qrTools.longitude"]({}, { locale })}
          type="number"
          inputMode="decimal"
          value={value("longitude")}
          onChange={(next) => onChange("longitude", next)}
        />
        <TextField
          id="qr-location-altitude"
          label={m["tools.qrCodeGenerator.locationAltitudeLabel"](
            {},
            { locale },
          )}
          type="number"
          inputMode="decimal"
          value={value("altitude")}
          onChange={(next) => onChange("altitude", next)}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id="qr-calendar-title"
        label={m["shared.pdfEditing.readfieldTitle"]({}, { locale })}
        value={value("title")}
        error={error("calendarDetails")}
        onChange={(next) => onChange("title", next)}
      />
      <TextField
        id="qr-calendar-location"
        label={m["common.icalLocation"]({}, { locale })}
        value={value("location")}
        onChange={(next) => onChange("location", next)}
      />
      <TextField
        id="qr-calendar-start"
        label={m["shared.dateTools.start"]({}, { locale })}
        type="datetime-local"
        value={value("start")}
        onChange={(next) => onChange("start", next)}
      />
      <TextField
        id="qr-calendar-end"
        label={m["shared.dateTools.end"]({}, { locale })}
        type="datetime-local"
        value={value("end")}
        onChange={(next) => onChange("end", next)}
      />
      <div className="sm:col-span-2">
        <TextareaField
          id="qr-calendar-description"
          label={m["common.favicondescriptionlabel"]({}, { locale })}
          value={value("description")}
          onChange={(next) => onChange("description", next)}
        />
      </div>
    </div>
  );
}

function validatePayload(type: QrType, draft: Draft) {
  const missing = missingReason(type, draft);
  if (missing) {
    return {
      content: null,
      payload: "",
      missing,
      error: "" as ErrorCode | "",
    };
  }
  try {
    const content = contentFromDraft(type, draft);
    return {
      content,
      payload: qrPayload(content),
      missing: null,
      error: "" as ErrorCode | "",
    };
  } catch (error) {
    return {
      content: null,
      payload: "",
      missing: null,
      error: toErrorCode(error),
    };
  }
}

function missingReason(type: QrType, draft: Draft): MissingReason | null {
  const text = (key: string) => String(draft[key] ?? "").trim();
  if (type === "text") return text("text") ? null : "text";
  if (type === "wifi") return text("ssid") ? null : "wifiSsid";
  if (type === "contact") {
    return Object.values(draft).some((value) => String(value).trim())
      ? null
      : "contact";
  }
  if (type === "sms") return text("phone") ? null : "smsPhone";
  if (type === "phone") return text("phone") ? null : "phone";
  if (type === "email") return text("to") ? null : "emailTo";
  if (type === "location") {
    const latitude = Number(text("latitude"));
    const longitude = Number(text("longitude"));
    return text("latitude") &&
      text("longitude") &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
      ? null
      : "locationCoordinates";
  }
  return text("title") || text("start") ? null : "calendarDetails";
}

function contentFromDraft(type: QrType, draft: Draft): QrContent {
  const value = (key: string) => String(draft[key] ?? "");
  if (type === "text") {
    return qrContentSchema.parse({ type, text: value("text") });
  }
  if (type === "wifi") {
    return qrContentSchema.parse({
      type,
      ssid: value("ssid"),
      password: value("password"),
      security: value("security"),
      hidden: draft.hidden === true,
    });
  }
  if (type === "contact") {
    return qrContentSchema.parse({
      type,
      firstName: value("firstName"),
      lastName: value("lastName"),
      organization: value("organization"),
      title: value("title"),
      phone: value("phone"),
      email: value("email"),
      website: value("website"),
      address: value("address"),
    });
  }
  if (type === "sms") {
    return qrContentSchema.parse({
      type,
      phone: value("phone"),
      message: value("message"),
    });
  }
  if (type === "phone") {
    return qrContentSchema.parse({ type, phone: value("phone") });
  }
  if (type === "email") {
    return qrContentSchema.parse({
      type,
      to: value("to"),
      subject: value("subject"),
      body: value("body"),
    });
  }
  if (type === "location") {
    return qrContentSchema.parse({
      type,
      latitude: value("latitude"),
      longitude: value("longitude"),
      altitude: value("altitude"),
    });
  }
  return qrContentSchema.parse({
    type,
    title: value("title"),
    location: value("location"),
    start: value("start"),
    end: value("end"),
    description: value("description"),
  });
}

function missingMessage(reason: MissingReason, locale: "zh-CN" | "en-US") {
  const messages: Record<MissingReason, string> = {
    text: m["tools.qrCodeGenerator.missingText"]({}, { locale }),
    wifiSsid: m["tools.qrCodeGenerator.missingWifiSsid"]({}, { locale }),
    contact: m["tools.qrCodeGenerator.missingContact"]({}, { locale }),
    smsPhone: m["tools.qrCodeGenerator.missingSmsPhone"]({}, { locale }),
    phone: m["tools.qrCodeGenerator.missingPhone"]({}, { locale }),
    emailTo: m["tools.qrCodeGenerator.missingEmailTo"]({}, { locale }),
    locationCoordinates: m["tools.qrCodeGenerator.missingLocationCoordinates"](
      {},
      { locale },
    ),
    calendarDetails: m["tools.qrCodeGenerator.missingCalendar"]({}, { locale }),
  };
  return messages[reason];
}

function contentTypeLabel(type: QrType, locale: "zh-CN" | "en-US") {
  const labels: Record<QrType, string> = {
    text: m["tools.qrCodeGenerator.textLabel"]({}, { locale }),
    wifi: m["tools.qrCodeGenerator.typeWifi"]({}, { locale }),
    contact: m["tools.qrCodeGenerator.typeContact"]({}, { locale }),
    sms: m["tools.qrCodeGenerator.typeSms"]({}, { locale }),
    phone: m["tools.qrCodeGenerator.typePhone"]({}, { locale }),
    email: m["shared.qrTools.email"]({}, { locale }),
    location: m["tools.qrCodeGenerator.typeLocation"]({}, { locale }),
    calendar: m["shared.qrTools.calendar"]({}, { locale }),
  };
  return labels[type];
}

function correctionLabel(
  level: QrOptions["errorCorrectionLevel"],
  locale: "zh-CN" | "en-US",
) {
  return {
    L: m["tools.qrCodeGenerator.errorCorrectionLow"]({}, { locale }),
    M: m["tools.qrCodeGenerator.errorCorrectionMedium"]({}, { locale }),
    Q: m["tools.qrCodeGenerator.errorCorrectionQuartile"]({}, { locale }),
    H: m["tools.qrCodeGenerator.errorCorrectionHigh"]({}, { locale }),
  }[level];
}

function toErrorCode(error: unknown): ErrorCode {
  return error instanceof QrError && Object.hasOwn(qrErrorMessages, error.code)
    ? error.code
    : "invalid_input";
}

function errorMessage(error: ErrorCode) {
  return qrErrorMessages[error]({});
}

function RichText({ text }: { text: string }) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={part}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

export default function QrGenerator() {
  return (
    <ToolPage>
      <QrGeneratorContent />
    </ToolPage>
  );
}
