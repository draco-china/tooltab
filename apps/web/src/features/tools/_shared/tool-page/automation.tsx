import { CodeBlock } from "@/components/base/code-block";
import { automationExamples } from "@/lib/automation-catalog";
import { apiOrigin } from "@/lib/site-origin";
import { m } from "@/paraglide/messages.js";
export function ToolAutomation({
  toolId,
  instructions,
}: {
  toolId: string;
  instructions: string;
}) {
  if (!Object.hasOwn(automationExamples, toolId)) return null;
  const supportedId = toolId as keyof typeof automationExamples;
  const input = automationExamples[supportedId];
  const shellInput = JSON.stringify(input).replaceAll("'", "'\"'\"'");
  const api = `curl --fail-with-body ${apiOrigin()}/api/v1/tools/${toolId} \\\n  -H 'Content-Type: application/json' \\\n  -d '${shellInput}'`;
  return (
    <section className="grid gap-4" aria-label={m["common.howto"]()}>
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold tracking-tight">
          {m["common.howto"]()}
        </h2>
        <p className="text-sm leading-6 text-muted">{instructions}</p>
      </div>
      <CodeBlock
        code={api}
        title={m["apiMcp.automationtitle"]()}
        copyLabel={`${m["common.actions.copy"]()} ${m["apiMcp.automationtitle"]()}`}
        language="shell"
        maxHeightClassName="max-h-72"
        wrap
      />
    </section>
  );
}
