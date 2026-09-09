import { Button, InputGroup, Kbd } from "@heroui/react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  buildToolSearchSuggestions,
  normalizeToolSearchQuery,
  type ToolSearchEntry,
  type ToolSearchSuggestion,
} from "@/features/tool-search/core";
import {
  ToolSearchSuggestions,
  toolSearchSuggestionId,
} from "@/features/tool-search/suggestions";
import { localePath } from "@/lib/locale-path";
import { m } from "@/paraglide/messages.js";
import type { Locale } from "@/paraglide/runtime.js";

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable)
  );
}

export function ToolSearch({
  entries,
  locale,
  query,
  onQueryChange,
  onSubmitQuery,
  categoryLabels,
  variant = "directory",
}: {
  entries: readonly ToolSearchEntry[];
  locale: Locale;
  query: string;
  onQueryChange: (query: string) => void;
  onSubmitQuery?: (query: string) => void;
  categoryLabels: Readonly<Record<string, string>>;
  variant?: "directory" | "hero";
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const synchronizedQueryRef = useRef<string | undefined>(undefined);
  const listboxId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [shortcutHint, setShortcutHint] = useState("⌘K");
  const suggestions = buildToolSearchSuggestions(entries, query, locale);
  const isOpen =
    focused && normalizeToolSearchQuery(query) !== "" && !dismissed;
  const activeIndex = Math.min(
    highlightedIndex,
    Math.max(suggestions.length - 1, 0),
  );

  function updateQuery(nextQuery: string) {
    setDismissed(false);
    setHighlightedIndex(0);
    onQueryChange(nextQuery);
  }

  function openSuggestion(suggestion: ToolSearchSuggestion) {
    void navigate({
      href: localePath(locale, `/tools/${suggestion.entry.slug}`),
    });
  }

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const previousQuery = synchronizedQueryRef.current;
    synchronizedQueryRef.current = query;
    if (previousQuery === undefined) {
      // Uncontrolled SSR inputs can be edited before React attaches listeners.
      setFocused(document.activeElement === input);
      if (input.value !== query) onQueryChange(input.value);
      return;
    }
    if (
      previousQuery !== query &&
      !composingRef.current &&
      input.value !== query
    ) {
      input.value = query;
    }
  }, [query, onQueryChange]);

  useEffect(() => {
    if (!/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setShortcutHint("Ctrl K");
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const commandK =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={variant === "hero" ? "relative w-full" : "relative flex-1"}>
      <InputGroup
        variant="secondary"
        fullWidth
        className={variant === "hero" ? "min-h-12" : "min-h-10"}
      >
        <InputGroup.Prefix>
          <Search aria-hidden className="size-4" />
        </InputGroup.Prefix>
        <InputGroup.Input
          ref={inputRef}
          type="text"
          enterKeyHint="search"
          role="combobox"
          aria-label={m["home.toolsearchlabel"]({}, { locale })}
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && suggestions.length
              ? toolSearchSuggestionId(listboxId, activeIndex)
              : undefined
          }
          placeholder={m["home.toolsearchplaceholder"](
            { count: entries.length },
            { locale },
          )}
          defaultValue={query}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            updateQuery(event.currentTarget.value);
          }}
          onChange={(event) => {
            if (!composingRef.current) updateQuery(event.currentTarget.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              setDismissed(true);
              return;
            }
            if (event.key === "Enter") {
              const suggestion = isOpen ? suggestions[activeIndex] : undefined;
              if (suggestion) {
                event.preventDefault();
                openSuggestion(suggestion);
              } else {
                const normalized = normalizeToolSearchQuery(query);
                if (onSubmitQuery && normalized) {
                  event.preventDefault();
                  onSubmitQuery(normalized);
                }
              }
              return;
            }
            if (!isOpen || !suggestions.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedIndex((index) =>
                Math.min(index + 1, suggestions.length - 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedIndex((index) => Math.max(index - 1, 0));
            }
          }}
        />
        <InputGroup.Suffix>
          {query ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={m["home.toolsearchclear"]({}, { locale })}
              onMouseDown={(event) => event.preventDefault()}
              onPress={() => {
                updateQuery("");
                inputRef.current?.focus();
              }}
            >
              <X aria-hidden className="size-3.5" />
            </Button>
          ) : (
            <Kbd aria-hidden variant="light" className="hidden sm:flex">
              <Kbd.Content>{shortcutHint}</Kbd.Content>
            </Kbd>
          )}
        </InputGroup.Suffix>
      </InputGroup>
      {isOpen ? (
        <ToolSearchSuggestions
          suggestions={suggestions}
          highlightedIndex={activeIndex}
          listboxId={listboxId}
          categoryLabels={categoryLabels}
          locale={locale}
          onPick={openSuggestion}
          onHighlight={setHighlightedIndex}
        />
      ) : null}
    </div>
  );
}
