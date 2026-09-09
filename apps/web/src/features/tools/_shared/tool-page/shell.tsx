import type { PropsWithChildren, ReactNode } from "react";

export function ToolPageShell({
  title,
  description,
  action,
  className = "",
  children,
}: PropsWithChildren<{
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={`flex flex-col gap-8 sm:gap-10 ${className}`}>
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl leading-none font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted sm:text-base">
            {description}
          </p>
        </div>
        {action ? (
          <div className="justify-self-start lg:justify-self-end">{action}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
