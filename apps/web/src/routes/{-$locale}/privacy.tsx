import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/legal/page";
import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/{-$locale}/privacy")({
  head: seo(m["legal.privacytitle"], m["legal.privacydetail"]),
  component: PrivacyPage,
});
