import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/legal/page";
import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/{-$locale}/terms")({
  head: seo(m["legal.termstitle"], m["legal.termsintro"]),
  component: TermsPage,
});
