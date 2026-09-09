import { Card, Skeleton } from "@heroui/react";
import type { ComponentProps } from "react";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "./tool-panel-card";

export function ToolPanelSkeleton({
  className = "",
  ...props
}: ComponentProps<typeof ToolPanelCard>) {
  return (
    <ToolPanelCard
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
      {...props}
    />
  );
}

type ToolPanelSkeletonHeaderProps = Omit<
  ComponentProps<typeof Card.Header>,
  "children"
> & {
  descriptionClassName?: string;
  showDescription?: boolean;
  titleClassName?: string;
};

export function ToolPanelSkeletonHeader({
  className = "",
  descriptionClassName = "w-2/3",
  showDescription = true,
  titleClassName = "w-40",
  ...props
}: ToolPanelSkeletonHeaderProps) {
  return (
    <Card.Header
      className={`grid gap-2 border-b border-separator ${className}`}
      {...props}
    >
      <Skeleton className={`h-5 rounded-md ${titleClassName}`} />
      {showDescription ? (
        <Skeleton className={`h-4 rounded-md ${descriptionClassName}`} />
      ) : null}
    </Card.Header>
  );
}

export function ToolPanelSkeletonContent({
  className = "",
  ...props
}: ComponentProps<typeof ToolPanelCardContent>) {
  return (
    <ToolPanelCardContent className={`gap-4 py-4 ${className}`} {...props} />
  );
}

export function ToolPanelSkeletonFooter({
  className = "",
  ...props
}: ComponentProps<typeof ToolPanelCardFooter>) {
  return (
    <ToolPanelCardFooter
      className={`flex-wrap gap-2 ${className}`}
      {...props}
    />
  );
}
