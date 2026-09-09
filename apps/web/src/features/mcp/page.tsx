import { useEffect, useState } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { DeveloperToolDirectory } from "@/features/mcp/developer-page";
import { apiOrigin } from "@/lib/site-origin";
import { m } from "@/paraglide/messages.js";
import type { Locale } from "@/paraglide/runtime.js";

export function McpPage({ locale }: { locale: Locale }) {
  const [origin, setOrigin] = useState(() => apiOrigin());
  useEffect(() => setOrigin(apiOrigin(window.location.origin)), []);

  const connection = JSON.stringify(
    { mcpServers: { tooltab: { url: `${origin}/mcp` } } },
    null,
    2,
  );

  return (
    <main className="grid min-w-0 gap-14 pb-12">
      <header className="max-w-3xl pt-4 sm:pt-8 lg:pt-14">
        <p className="mb-3 text-sm font-medium text-accent">
          Model Context Protocol
        </p>
        <h1 className="text-4xl font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
          {m["apiMcp.mcptitle"]({}, { locale })}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          {m["apiMcp.mcpintro"]({}, { locale })}
        </p>
      </header>

      <section aria-labelledby="mcp-connection-title" className="min-w-0">
        <div className="grid min-w-0 gap-8 rounded-2xl border border-border bg-surface p-5 sm:p-7 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)] lg:items-start lg:gap-10">
          <div className="grid gap-4">
            <div>
              <h2 id="mcp-connection-title" className="text-xl font-semibold">
                {m["apiMcp.mcpconnection"]({}, { locale })}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {m["apiMcp.mcpconnectiondescription"]({}, { locale })}
              </p>
            </div>
            <p className="border-l-2 border-accent/60 pl-3 text-sm leading-6 text-muted">
              {m["apiMcp.mcpprotocol"]({}, { locale })}
            </p>
          </div>
          <CodeBlock
            code={connection}
            title={m["apiMcp.mcpconnection"]({}, { locale })}
            copyLabel={`${m["common.actions.copy"]({}, { locale })} ${m["apiMcp.mcpconnection"]({}, { locale })}`}
            language="json"
            maxHeightClassName="max-h-72"
          />
        </div>
      </section>

      <DeveloperToolDirectory locale={locale} />
    </main>
  );
}
