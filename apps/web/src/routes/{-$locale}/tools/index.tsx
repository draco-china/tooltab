import { createFileRoute } from "@tanstack/react-router";
import { ToolList } from "@/features/tool-directory/page";
import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/{-$locale}/tools/")({
  head: seo(m["home.category"]),
  component: ToolList,
});
