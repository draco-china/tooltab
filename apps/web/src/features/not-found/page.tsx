import { Link } from "@tanstack/react-router";
import { localePath } from "@/lib/locale-path";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

export function NotFoundPage() {
  return (
    <main className="page-container flex min-h-svh flex-col items-center justify-center py-12 text-center">
      <p className="text-sm font-medium text-muted tabular-nums">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
        {m["common.notfound"]()}
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-7 text-muted">
        {m["common.notfounddescription"]()}
      </p>
      <Link
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-default"
        to={localePath(getLocale())}
      >
        {m["navigation.home"]()}
      </Link>
    </main>
  );
}
