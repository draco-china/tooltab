import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card, Chip, cn, Skeleton } from "@heroui/react";
import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { captureDeviceSnapshot, serializeSnapshot } from "./logic";
import type { DeviceSnapshot, InfoSection, InfoValue } from "./types";

function InfoRow({
  item,
  unavailable,
}: {
  item: InfoValue;
  unavailable: string;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">
        {item.label}
      </dt>
      <dd className="min-w-0">
        {item.unavailable ? (
          <Chip size="sm" variant="secondary">
            {unavailable}
          </Chip>
        ) : (
          <span
            className={cn(
              "block wrap-break-word text-sm",
              item.code && "break-all font-mono text-xs",
            )}
          >
            {item.value}
          </span>
        )}
      </dd>
    </div>
  );
}

function InfoSectionCard({
  section,
  unavailable,
}: {
  section: InfoSection;
  unavailable: string;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{section.title}</Card.Title>
        <Card.Description>{section.description}</Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="p-0">
        <dl className="divide-y divide-separator">
          {section.entries.map((item) => (
            <InfoRow key={item.id} item={item} unavailable={unavailable} />
          ))}
        </dl>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function DeviceInformationSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-6" role="status" aria-label={label}>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {["browser", "platform", "screen", "timezone"].map((key) => (
              <div
                className="grid min-h-24 content-start gap-3 rounded-lg border border-border p-4"
                key={key}
              >
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            ))}
          </div>
        </ToolPanelCardContent>
      </ToolPanelCard>
      <div className="grid gap-6 xl:grid-cols-2">
        {["browser", "display", "hardware", "network"].map((key) => (
          <ToolPanelCard key={key}>
            <Card.Header className="border-b border-separator">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-5/6" />
            </Card.Header>
            <ToolPanelCardContent className="gap-3 py-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </ToolPanelCardContent>
          </ToolPanelCard>
        ))}
      </div>
    </div>
  );
}

function DeviceInformationContent() {
  const locale = getLocale() === "zh-CN" ? "zh-CN" : "en-US";
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++revision.current;
    setRefreshing(true);
    try {
      const next = await captureDeviceSnapshot(locale);
      if (revision.current === current) setSnapshot(next);
    } finally {
      if (revision.current === current) setRefreshing(false);
    }
  }, [locale]);

  useEffect(() => {
    void refresh();
    return () => {
      // Invalidate the latest async generation at cleanup, not the generation captured at mount.
      revision.current++;
    };
  }, [refresh]);

  if (!snapshot)
    return (
      <DeviceInformationSkeleton
        label={m["tools.deviceInformation.loadingTitle"]()}
      />
    );

  const snapshotJson = serializeSnapshot(snapshot);
  return (
    <div className="grid gap-10">
      <div className="grid gap-6">
        <ToolPanelCard>
          <Card.Header className="grid gap-4 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="grid gap-1.5">
              <Card.Title>
                {m["tools.deviceInformation.snapshotTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.deviceInformation.snapshotDescription"]()}
              </Card.Description>
              <p className="text-xs text-muted-foreground">
                {m["tools.deviceInformation.capturedAt"]()}:{" "}
                {snapshot.capturedAtLabel}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                isDisabled={refreshing}
                onPress={() => void refresh()}
              >
                <RefreshCcw
                  aria-hidden
                  className={cn("size-4", refreshing && "animate-spin")}
                />
                {refreshing
                  ? m["tools.deviceInformation.refreshing"]()
                  : m["tools.deviceInformation.refresh"]()}
              </Button>
              <ToolCopyButton
                value={snapshotJson}
                copyLabel={m["shared.aesTools.encryptcopyjsonlabel"]()}
                copiedLabel={m["common.actions.copied"]()}
              />
            </div>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {snapshot.summary.map((item) => (
                <div
                  key={item.id}
                  className="grid min-h-24 content-start gap-2 rounded-lg border border-border bg-background p-4"
                >
                  <dt className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd
                    className={cn(
                      "wrap-break-word text-lg font-semibold leading-snug",
                      item.unavailable && "text-muted-foreground",
                    )}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <div className="grid gap-6 xl:grid-cols-2">
          {snapshot.sections.map((section) => (
            <InfoSectionCard
              key={section.id}
              section={section}
              unavailable={m["tools.deviceInformation.unavailable"]()}
            />
          ))}
        </div>
      </div>

      <ToolArticle>
        <h2>{m["tools.deviceInformation.articleWhatTitle"]()}</h2>
        <p>{m["tools.deviceInformation.articleWhatBody"]()}</p>
        <h2>{m["tools.deviceInformation.articleWhenTitle"]()}</h2>
        <p>{m["tools.deviceInformation.articleWhenBody"]()}</p>
        <h2>{m["tools.deviceInformation.article.privacyTitle"]()}</h2>
        <p>{m["tools.deviceInformation.articlePrivacyBody"]()}</p>
        <h2>{m["tools.deviceInformation.articleReadTitle"]()}</h2>
        <p>{m["tools.deviceInformation.articleReadBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default DeviceInformation;

export function DeviceInformation() {
  return (
    <ToolPage>
      <DeviceInformationContent />
    </ToolPage>
  );
}
