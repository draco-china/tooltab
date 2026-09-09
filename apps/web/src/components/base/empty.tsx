import type { ComponentProps } from "react";

export function Empty({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={`flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance ${className}`}
      {...props}
    />
  );
}

export function EmptyHeader({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={`flex max-w-sm flex-col items-center gap-2 ${className}`}
      {...props}
    />
  );
}

export function EmptyMedia({
  className = "",
  variant = "default",
  ...props
}: ComponentProps<"div"> & { variant?: "default" | "icon" }) {
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={`mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0 ${
        variant === "icon"
          ? "size-8 rounded-lg bg-default text-foreground [&_svg:not([class*='size-'])]:size-4"
          : "bg-transparent"
      } ${className}`}
      {...props}
    />
  );
}

export function EmptyTitle({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={`text-sm font-medium tracking-tight ${className}`}
      {...props}
    />
  );
}

export function EmptyDescription({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-description"
      className={`text-sm leading-relaxed text-muted [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-link ${className}`}
      {...props}
    />
  );
}
