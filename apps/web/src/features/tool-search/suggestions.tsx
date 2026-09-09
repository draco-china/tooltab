import { Kbd, Surface } from "@heroui/react";
import type { ToolSearchSuggestion } from "@/features/tool-search/core";
import { m } from "@/paraglide/messages.js";
import type { Locale } from "@/paraglide/runtime.js";

export function toolSearchSuggestionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}

export function ToolSearchSuggestions({
  suggestions,
  highlightedIndex,
  listboxId,
  categoryLabels,
  locale,
  onPick,
  onHighlight,
}: {
  suggestions: readonly ToolSearchSuggestion[];
  highlightedIndex: number;
  listboxId: string;
  categoryLabels: Readonly<Record<string, string>>;
  locale: Locale;
  onPick: (suggestion: ToolSearchSuggestion) => void;
  onHighlight: (index: number) => void;
}) {
  return (
    <Surface className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden p-1.5 shadow-overlay">
      {suggestions.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="text-sm font-medium text-overlay-foreground">
            {m["home.toolsearchemptytitle"]({}, { locale })}
          </p>
          <p className="mt-1 text-xs text-muted">
            {m["home.toolsearchemptydescription"]({}, { locale })}
          </p>
        </div>
      ) : (
        <>
          <div
            id={listboxId}
            role="listbox"
            aria-label={m["home.toolsearchsuggestionslabel"]({}, { locale })}
            className="flex flex-col"
          >
            {suggestions.map((suggestion, index) => {
              const active = index === highlightedIndex;
              return (
                <div
                  key={suggestion.entry.slug}
                  id={toolSearchSuggestionId(listboxId, index)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onPick(suggestion);
                  }}
                  onMouseEnter={() => onHighlight(index)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${
                    active ? "bg-default" : ""
                  }`}
                >
                  <span className="min-w-0 truncate text-sm text-overlay-foreground">
                    {suggestion.pre}
                    <mark className="rounded-sm bg-accent-soft px-0.5 font-semibold text-accent-soft-foreground">
                      {suggestion.match}
                    </mark>
                    {suggestion.post}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-medium tracking-[0.12em] text-muted uppercase">
                      {categoryLabels[suggestion.entry.category] ??
                        suggestion.entry.category}
                    </span>
                    {active ? (
                      <Kbd aria-hidden variant="light" className="h-5 min-w-5">
                        <Kbd.Content>↵</Kbd.Content>
                      </Kbd>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-separator px-3 pt-2 pb-1 font-mono text-[11px] text-muted">
            <span>
              {(suggestions.length === 1
                ? m["home.toolsearchmatchcountone"]
                : m["home.toolsearchmatchcount"])(
                { count: suggestions.length },
                { locale },
              )}
            </span>
            <span className="truncate">
              {m["home.toolsearchsuggestionshint"]({}, { locale })}
            </span>
          </div>
        </>
      )}
    </Surface>
  );
}
