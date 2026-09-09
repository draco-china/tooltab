import { createFileRoute } from "@tanstack/react-router";
import { dnsLookupHead } from "@/features/tools/dns-lookup/head";
import DnsLookupPage from "@/features/tools/dns-lookup/page";
import { DnsLookupRouteSkeleton } from "@/features/tools/dns-lookup/skeleton";
import { z } from "zod";

export const Route = createFileRoute("/{-$locale}/tools/dns-lookup")({
  head: dnsLookupHead,
  pendingComponent: DnsLookupRouteSkeleton,
  validateSearch: z.record(z.string(), z.string()).default({}),
  component: DnsLookup,
});

function DnsLookup() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <DnsLookupPage
      search={search}
      onSearchChange={(next) =>
        void navigate({
          search: (current) => {
            const merged = { ...current };
            for (const key of [
              "domain",
              "types",
              "resolver",
              "dnssec",
              "checkingDisabled",
            ])
              delete merged[key];
            return { ...merged, ...next };
          },
        })
      }
    />
  );
}
