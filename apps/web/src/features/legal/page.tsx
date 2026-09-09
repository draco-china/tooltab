import type { LucideIcon } from "lucide-react";
import { Scale, ShieldCheck } from "lucide-react";
import { m } from "@/paraglide/messages.js";

type LegalSection = Readonly<{
  id: string;
  title: () => string;
  body: () => string;
}>;

function LegalPage({
  Icon,
  title,
  intro,
  sections,
}: {
  Icon: LucideIcon;
  title: () => string;
  intro: () => string;
  sections: readonly LegalSection[];
}) {
  return (
    <main className="grid min-w-0 gap-10 py-8 sm:gap-12 sm:py-12 lg:py-16">
      <header className="max-w-4xl">
        <div className="flex items-center gap-3">
          <Icon
            aria-hidden
            className="size-6 shrink-0 text-accent"
            strokeWidth={1.7}
          />
          <h1 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
            {title()}
          </h1>
        </div>
        <p className="mt-5 max-w-3xl text-base leading-7 text-muted sm:text-lg">
          {intro()}
        </p>
      </header>
      <div className="max-w-5xl rounded-2xl border border-border bg-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        {sections.map((section) => (
          <section
            key={section.id}
            className="grid gap-2 border-t border-border py-6 first:border-t-0 first:pt-0 last:pb-0 sm:gap-3 sm:py-7 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10"
          >
            <h2 className="text-base leading-7 font-semibold text-foreground">
              {section.title()}
            </h2>
            <p className="max-w-3xl text-[15px] leading-7 text-muted sm:text-base">
              {section.body()}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}

const privacySections = [
  {
    id: "local",
    title: m["legal.privacylocaltitle"],
    body: m["legal.privacylocalbody"],
  },
  {
    id: "network",
    title: m["legal.privacynetworktitle"],
    body: m["legal.privacynetwork"],
  },
  {
    id: "analytics",
    title: m["legal.privacyanalyticstitle"],
    body: m["legal.privacyanalytics"],
  },
  {
    id: "permissions",
    title: m["legal.privacypermissionstitle"],
    body: m["legal.privacypermissions"],
  },
  {
    id: "storage",
    title: m["legal.privacystoragetitle"],
    body: m["legal.privacystorage"],
  },
  {
    id: "downloads",
    title: m["legal.privacydownloadstitle"],
    body: m["legal.privacydownloads"],
  },
  {
    id: "services",
    title: m["legal.privacyservicestitle"],
    body: m["legal.privacyservices"],
  },
  {
    id: "links",
    title: m["legal.privacylinkstitle"],
    body: m["legal.privacylinks"],
  },
  {
    id: "changes",
    title: m["legal.privacychangestitle"],
    body: m["legal.privacychanges"],
  },
] as const satisfies readonly LegalSection[];

const termsSections = [
  {
    id: "local",
    title: m["legal.termslocaltitle"],
    body: m["legal.termslocalbody"],
  },
  {
    id: "responsibility",
    title: m["legal.termsresponsibilitytitle"],
    body: m["legal.termsresponsibilitybody"],
  },
  {
    id: "availability",
    title: m["legal.termsavailabilitytitle"],
    body: m["legal.termsavailabilitybody"],
  },
  {
    id: "platform",
    title: m["legal.termsplatformtitle"],
    body: m["legal.termsplatformbody"],
  },
  {
    id: "license",
    title: m["legal.termslicensetitle"],
    body: m["legal.termslicensebody"],
  },
  {
    id: "contact",
    title: m["legal.termscontacttitle"],
    body: m["legal.termscontactbody"],
  },
] as const satisfies readonly LegalSection[];

export function PrivacyPage() {
  return (
    <LegalPage
      Icon={ShieldCheck}
      title={m["legal.privacytitle"]}
      intro={m["legal.privacydetail"]}
      sections={privacySections}
    />
  );
}

export function TermsPage() {
  return (
    <LegalPage
      Icon={Scale}
      title={m["legal.termstitle"]}
      intro={m["legal.termsintro"]}
      sections={termsSections}
    />
  );
}
