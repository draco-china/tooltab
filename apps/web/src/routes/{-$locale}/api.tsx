import { createFileRoute } from "@tanstack/react-router";
import { ApiPage } from "@/features/api/page";
import { localeFromRouteParam } from "@/lib/locale-path";
import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/{-$locale}/api")({
  head: seo(m["apiMcp.apititle"], m["apiMcp.apiintro"]),
  component: Api,
});

function Api() {
  const { locale } = Route.useParams();
  return <ApiPage locale={localeFromRouteParam(locale)} />;
}
