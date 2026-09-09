import { createFileRoute } from "@tanstack/react-router";
import { getPopularTools } from "@/features/api/runtime/popular-tools";

export async function handlePopularToolsRequest() {
  return Response.json(await getPopularTools(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api_/v1/popular-tools")({
  server: {
    handlers: {
      GET: handlePopularToolsRequest,
    },
  },
});
