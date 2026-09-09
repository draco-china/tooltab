import { createFileRoute } from "@tanstack/react-router";
import { handleServiceRequest } from "@/features/api/runtime/http";
import { McpPage } from "@/features/mcp/page";
import { McpPageSkeleton } from "@/features/mcp/skeleton";
import { localeFromRouteParam } from "@/lib/locale-path";
import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/{-$locale}/mcp")({
  head: seo(m["apiMcp.mcptitle"], m["apiMcp.mcpintro"]),
  server: {
    handlers: {
      POST: ({ request }) =>
        new URL(request.url).pathname === "/mcp"
          ? handleServiceRequest(request)
          : new Response(null, { status: 404 }),
      DELETE: ({ request }) =>
        new URL(request.url).pathname === "/mcp"
          ? handleServiceRequest(request)
          : new Response(null, { status: 404 }),
    },
  },
  component: Mcp,
  pendingComponent: McpPageSkeleton,
});

function Mcp() {
  const { locale } = Route.useParams();
  return <McpPage locale={localeFromRouteParam(locale)} />;
}
