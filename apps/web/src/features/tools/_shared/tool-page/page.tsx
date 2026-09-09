import { Chip } from "@heroui/react";
import { notFound, useMatches } from "@tanstack/react-router";
import { Cloud } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { tools } from "@/features/tools/catalog/registry";
import { browserCapabilities } from "@/lib/capabilities";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { ToolPageShell } from "@/features/tools/_shared/tool-page/shell";

export function ToolPage({
  children,
  instructions,
}: {
  children: ReactNode;
  instructions?: string;
}) {
  const match = useMatches({ select: (matches) => matches.at(-1) });
  const toolId = match?.routeId.split("/").at(-1) ?? "";
  const locale = getLocale();
  const tool = tools.find((tool) => tool.id === toolId);
  const [capabilities, setCapabilities] = useState<ReturnType<
    typeof browserCapabilities
  > | null>(null);
  useEffect(() => setCapabilities(browserCapabilities()), []);
  const unsupported =
    capabilities &&
    tool &&
    ((tool.capabilities.canvas && !capabilities.canvas) ||
      (tool.capabilities.worker && !capabilities.worker));
  if (!tool) throw notFound();
  return (
    <main>
      <ToolPageShell
        title={tool.nameMessage({})}
        description={tool.descriptionMessage({})}
        action={
          tool.networkDestinations ? (
            <div className="flex flex-wrap items-center gap-2 justify-self-start lg:justify-self-end">
              <Chip variant="soft" color="warning" size="sm">
                <Cloud aria-hidden className="size-4" />
                {m["common.networkprocessing"]()}
              </Chip>
              <span className="text-xs text-muted">
                {m["common.networkdestinations"]({
                  destinations: tool.networkDestinations,
                })}
              </span>
            </div>
          ) : undefined
        }
      >
        <section
          data-tool-workspace
          aria-busy={
            !capabilities &&
            (tool.capabilities.canvas || tool.capabilities.worker)
          }
        >
          {unsupported ? (
            <p
              role="alert"
              className="grid min-h-32 place-items-center text-center text-muted"
            >
              {m["common.browserunsupported"]()}
            </p>
          ) : (
            <Fragment key={toolId}>{children}</Fragment>
          )}
        </section>
        <section className="grid gap-1" aria-label={m["common.howto"]()}>
          <h2 className="text-xl font-semibold tracking-tight">
            {m["common.howto"]()}
          </h2>
          <p className="text-sm leading-6 text-muted">
            {instructions ?? tool.instructionsMessage({})}
          </p>
        </section>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: tool.nameMessage({}),
            description: tool.descriptionMessage({}),
            applicationCategory:
              tool.category === "image-design"
                ? "MultimediaApplication"
                : "UtilitiesApplication",
            operatingSystem: "Web",
            isAccessibleForFree: true,
            inLanguage: locale,
          })}
        </script>
      </ToolPageShell>
    </main>
  );
}
