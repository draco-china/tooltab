import { createFileRoute } from "@tanstack/react-router";
import { handleServiceRequest } from "@/features/api/runtime/http";

export const Route = createFileRoute("/api_/v1/$")({
  server: {
    handlers: {
      ANY: ({ request }) => handleServiceRequest(request),
    },
  },
});
