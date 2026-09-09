import {
  type ToolCategory,
  type ToolTask,
  orderedToolCategories as toolCategories,
} from "@/features/tools/catalog/categories";
import { type ToolDefinition, tools } from "@/features/tools/catalog/registry";
import type { Locale } from "@/paraglide/runtime.js";

export type LocalizedTool = {
  tool: ToolDefinition;
  name: string;
  description: string;
  searchText: string;
};

export const categoryById = new Map(
  toolCategories.map((category) => [category.id, category]),
);
export const taskByCategory = new Map(
  toolCategories.map((category) => [
    category.id,
    new Map(category.tasks.map((task) => [task.id, task])),
  ]),
);
export const toolById = new Map(tools.map((tool) => [tool.id, tool]));
export const toolsByCategory = new Map<ToolCategory, ToolDefinition[]>();
export const toolsByCategoryTask = new Map<
  ToolCategory,
  Map<ToolTask, ToolDefinition[]>
>();

for (const tool of tools) {
  const categoryTools = toolsByCategory.get(tool.category) ?? [];
  categoryTools.push(tool);
  toolsByCategory.set(tool.category, categoryTools);

  const categoryTasks = toolsByCategoryTask.get(tool.category) ?? new Map();
  const taskTools = categoryTasks.get(tool.task) ?? [];
  taskTools.push(tool);
  categoryTasks.set(tool.task, taskTools);
  toolsByCategoryTask.set(tool.category, categoryTasks);
}

export const toolCountByCategory = new Map(
  [...toolsByCategory].map(([category, categoryTools]) => [
    category,
    categoryTools.length,
  ]),
);

function localizeTool(tool: ToolDefinition, locale: Locale): LocalizedTool {
  const category = categoryById.get(tool.category);
  const task = taskByCategory.get(tool.category)?.get(tool.task);
  const name = tool.nameMessage({}, { locale });
  const description = tool.descriptionMessage({}, { locale });
  const categoryName = category ? category.nameMessage({}, { locale }) : "";
  const taskName = task ? task.nameMessage({}, { locale }) : "";

  return {
    tool,
    name,
    description,
    searchText: [name, description, ...tool.keywords, categoryName, taskName]
      .join(" ")
      .toLocaleLowerCase(locale),
  };
}

export function localizedToolCatalog(locale: Locale): LocalizedTool[] {
  return tools
    .map((tool) => localizeTool(tool, locale))
    .sort((left, right) =>
      left.name.localeCompare(right.name, locale, { numeric: true }),
    );
}

export function toolSearchText(tool: ToolDefinition, locale: Locale) {
  return localizeTool(tool, locale).searchText;
}

export function compareToolNames(
  left: ToolDefinition,
  right: ToolDefinition,
  locale: Locale,
) {
  return left
    .nameMessage({}, { locale })
    .localeCompare(right.nameMessage({}, { locale }), locale, {
      numeric: true,
    });
}
