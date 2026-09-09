import { normalizeToolSearchQuery } from "@/features/tool-search/core";
import type {
  ToolCategory,
  ToolTask,
} from "@/features/tools/catalog/categories";
import {
  categoryById,
  toolsByCategoryTask,
} from "@/features/tools/catalog/discovery";

export type ToolDirectoryState = Readonly<{
  query: string;
  category: "all" | ToolCategory;
  task: string;
}>;

export const emptyToolDirectoryState: ToolDirectoryState = {
  query: "",
  category: "all",
  task: "all",
};

export function readToolDirectoryState(search: string): ToolDirectoryState {
  const params = new URLSearchParams(search);
  const categoryParam = params.get("category");
  const category =
    categoryParam && categoryById.has(categoryParam as ToolCategory)
      ? (categoryParam as ToolCategory)
      : "all";
  const taskParam = params.get("task");
  const task =
    category !== "all" &&
    taskParam &&
    toolsByCategoryTask.get(category)?.has(taskParam as ToolTask)
      ? taskParam
      : "all";

  return {
    query: normalizeToolSearchQuery(params.get("query") ?? ""),
    category,
    task,
  };
}

export function writeToolDirectoryState(
  search: string,
  state: ToolDirectoryState,
) {
  const params = new URLSearchParams(search);

  for (const [key, value] of [
    ["query", normalizeToolSearchQuery(state.query)],
    ["category", state.category === "all" ? "" : state.category],
    ["task", state.task === "all" ? "" : state.task],
  ] as const) {
    if (value) params.set(key, value);
    else params.delete(key);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
