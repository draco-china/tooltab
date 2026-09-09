import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/features/home/page";
import { HomePageSkeleton } from "@/features/home/skeleton";
import { seo } from "@/lib/seo";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/{-$locale}/")({
  head: seo(),
  component: HomePage,
  pendingComponent: () => <HomePageSkeleton label={m["home.homeloading"]()} />,
});
