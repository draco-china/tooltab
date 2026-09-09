import { createFileRoute } from "@tanstack/react-router";
import { SqlFormatter } from "@/features/tools/sql-formatter-and-linter/page";
import { sqlFormatterAndLinterHead } from "@/features/tools/sql-formatter-and-linter/head";

import { SqlFormatterSkeleton } from "@/features/tools/sql-formatter-and-linter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sql-formatter-and-linter",
)({
  head: sqlFormatterAndLinterHead,
  pendingComponent: SqlFormatterSkeleton,
  component: SqlFormatter,
});
