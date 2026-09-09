import { Card } from "@heroui/react";
import type { ComponentProps } from "react";

export function ToolPanelCard({
  className = "",
  ...props
}: ComponentProps<typeof Card>) {
  return (
    <Card
      className={`h-full min-h-0 min-w-0 gap-0 overflow-hidden p-0 *:data-[slot=card-header]:min-w-0 *:data-[slot=card-header]:px-4 *:data-[slot=card-header]:pt-4 [&>[data-slot=card-header].border-b]:pb-4 ${className}`}
      {...props}
    />
  );
}

export function ToolPanelCardContent({
  className = "",
  ...props
}: ComponentProps<typeof Card.Content>) {
  return (
    <Card.Content
      className={`flex min-h-0 min-w-0 flex-1 flex-col px-4 ${className}`}
      {...props}
    />
  );
}

export function ToolPanelCardFooter({
  className = "",
  ...props
}: ComponentProps<typeof Card.Footer>) {
  return (
    <Card.Footer
      className={`mt-auto border-t border-border bg-default/50 p-4 ${className}`}
      {...props}
    />
  );
}

export function ToolPanelActionGroup({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={`flex max-w-full min-w-0 flex-wrap items-center gap-2 *:max-w-full *:whitespace-normal ${className}`}
      {...props}
    />
  );
}
