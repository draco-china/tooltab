import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { Download, Search } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { buttonVariants } from "@heroui/styles";
import { useObjectUrl } from "@/hooks/use-object-url";
import {
  type GitignoreCategory,
  generateGitignore,
  gitignoreCatalog,
  gitignoreCategories,
  popularGitignores,
  searchGitignores,
} from "@workspace/tools/project/gitignore";

const STORAGE_KEY = "tools:gitignore-generator:selected-templates";

const categoryLabels = {
  language: m["tools.gitignoreGenerator.languagesLabel"],
  global: m["tools.gitignoreGenerator.globalLabel"],
  community: m["tools.gitignoreGenerator.communityLabel"],
} as const;

function normalizeSelection(values: readonly string[]) {
  const selected = new Set(values);
  return gitignoreCatalog
    .filter((template) => selected.has(template.name))
    .map((template) => template.name);
}

function HighlightedGitignore({
  label,
  placeholder,
  value,
}: {
  label: string;
  placeholder: string;
  value: string;
}) {
  const occurrences = new Map<string, number>();
  const lines = value.split("\n").map((text) => {
    const occurrence = occurrences.get(text) ?? 0;
    occurrences.set(text, occurrence + 1);
    return { key: `${text}\u0000${occurrence}`, text };
  });
  return (
    // biome-ignore lint/a11y/useSemanticElements: the upstream highlighted read-only preview intentionally exposes textbox semantics
    <div
      role="textbox"
      tabIndex={0}
      aria-label={label}
      aria-multiline="true"
      aria-readonly="true"
      className="min-h-full min-w-max p-3 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-focus/25"
    >
      {value.trim() ? (
        <pre>
          <code>
            {lines.map((line, index) => (
              <span
                key={line.key}
                className={
                  line.text.startsWith("#")
                    ? "text-muted"
                    : line.text.startsWith("!") || /[*?]/u.test(line.text)
                      ? "text-accent"
                      : ""
                }
              >
                {line.text || "\u00a0"}
                {index < lines.length - 1 ? "\n" : null}
              </span>
            ))}
          </code>
        </pre>
      ) : (
        <span className="text-muted">{placeholder}</span>
      )}
    </div>
  );
}

function TemplateSelectionCard({
  query,
  selected,
  onQueryChange,
  onToggle,
  onClear,
}: {
  query: string;
  selected: readonly string[];
  onQueryChange: (value: string) => void;
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(
    () => searchGitignores(deferredQuery),
    [deferredQuery],
  );
  const grouped = useMemo(
    () =>
      Object.fromEntries(
        gitignoreCategories.map((category) => [
          category,
          matches.filter((template) => template.category === category),
        ]),
      ) as Record<GitignoreCategory, typeof matches>,
    [matches],
  );
  const countLabel = m["tools.gitignoreGenerator.selectedCountLabel"]({
    count: String(selected.length),
  });

  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>
          {m["tools.gitignoreGenerator.templatesLabel"]()}
        </Card.Title>
        <Card.Description>
          {m["tools.gitignoreGenerator.templatesDescription"]()}
        </Card.Description>
      </Card.Header>
      <ToolPanelCardContent className="gap-6 py-4">
        <TextField fullWidth className="gap-2">
          <Label>{m["tools.gitignoreGenerator.searchLabel"]()}</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted"
            />
            <Input
              className="min-h-11 ps-9"
              value={query}
              maxLength={1000}
              placeholder={m["tools.gitignoreGenerator.searchPlaceholder"]()}
              aria-label={m["tools.gitignoreGenerator.searchLabel"]()}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
          </div>
          <p className="text-sm text-muted">
            {m["tools.gitignoreGenerator.searchDescription"]()}
          </p>
        </TextField>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">
              {m["tools.gitignoreGenerator.quickSelectLabel"]()}
            </h2>
            <Chip size="sm" variant="soft">
              {popularGitignores.length}
            </Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularGitignores.map((name) => (
              <Button
                key={name}
                type="button"
                size="sm"
                variant={selected.includes(name) ? "primary" : "outline"}
                aria-pressed={selected.includes(name)}
                onPress={() => onToggle(name)}
              >
                {name}
              </Button>
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <h2 className="text-sm font-medium">
                {m["tools.gitignoreGenerator.selectedTemplatesLabel"]()}
              </h2>
              <p className="text-sm text-muted">{countLabel}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              isDisabled={!selected.length}
              onPress={onClear}
            >
              {m["common.curlClear"]()}
            </Button>
          </div>
          {selected.length ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((name) => (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-auto px-2.5 py-1 text-xs font-medium"
                  onPress={() => onToggle(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              {m["tools.gitignoreGenerator.emptySelectionLabel"]()}
            </p>
          )}
        </section>

        {matches.length ? (
          <div className="h-112 overflow-auto rounded-xl border border-border p-3">
            <div className="grid gap-6">
              {gitignoreCategories.map((category) => {
                const templates = grouped[category];
                return templates.length ? (
                  <section key={category} className="grid gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-medium">
                        {categoryLabels[category]()}
                      </h2>
                      <Chip size="sm" variant="soft">
                        {templates.length}
                      </Chip>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {templates.map((template) => {
                        const isSelected = selected.includes(template.name);
                        return (
                          <div
                            key={template.path}
                            className={`rounded-xl border px-3 py-2 ${
                              isSelected
                                ? "border-accent bg-accent/10"
                                : "border-border"
                            }`}
                          >
                            <Checkbox
                              aria-label={template.name}
                              isSelected={isSelected}
                              onChange={() => onToggle(template.name)}
                            >
                              <Checkbox.Content className="flex min-h-8 min-w-0 items-center gap-3">
                                <Checkbox.Control>
                                  <Checkbox.Indicator />
                                </Checkbox.Control>
                                <span
                                  title={template.name}
                                  className="min-w-0 truncate text-sm"
                                >
                                  {template.name}
                                </span>
                              </Checkbox.Content>
                            </Checkbox>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null;
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {m["tools.gitignoreGenerator.noTemplatesFoundLabel"]()}
          </p>
        )}
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PreviewCard({
  content,
  downloadUrl,
}: {
  content: string;
  downloadUrl: string | null;
}) {
  return (
    <ToolPanelCard>
      <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Card.Title>{m["common.archivepreview"]()}</Card.Title>
          <Card.Description>
            {m["tools.gitignoreGenerator.resultDescription"]()}
          </Card.Description>
        </div>
        <ToolPanelActionGroup className="shrink-0 sm:justify-end">
          <ToolCopyButton
            value={content}
            copyLabel={m["tools.gitignoreGenerator.copyResultLabel"]()}
            copiedLabel={m["common.actions.copied"]()}
            disabled={!content}
          />
          {downloadUrl ? (
            <a
              href={downloadUrl}
              download=".gitignore"
              className={buttonVariants({ size: "sm", variant: "primary" })}
            >
              <Download aria-hidden className="size-4" />
              {m["common.actions.download"]()}
            </a>
          ) : (
            <Button type="button" size="sm" variant="primary" isDisabled>
              <Download aria-hidden className="size-4" />
              {m["common.actions.download"]()}
            </Button>
          )}
        </ToolPanelActionGroup>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <div className="h-112 overflow-auto rounded-xl border border-border bg-default/20 sm:h-128">
          <HighlightedGitignore
            label={m["common.archivepreview"]()}
            placeholder={m["tools.gitignoreGenerator.emptySelectionLabel"]()}
            value={content}
          />
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function GitignoreGeneratorPageContent() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const content = useMemo(() => generateGitignore(selected), [selected]);
  const downloadBlob = useMemo(
    () =>
      content
        ? new Blob([content], { type: "text/plain;charset=utf-8" })
        : null,
    [content],
  );
  const downloadUrl = useObjectUrl(downloadBlob);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return;
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setSelected(
          normalizeSelection(
            parsed.filter((value) => typeof value === "string"),
          ),
        );
      }
    } catch {
      setSelected([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
    } catch {}
  }, [hydrated, selected]);

  function toggle(name: string) {
    startTransition(() => {
      setSelected((current) =>
        current.includes(name)
          ? current.filter((item) => item !== name)
          : normalizeSelection([...current, name]),
      );
    });
  }

  return (
    <div className="grid gap-8">
      <TemplateSelectionCard
        query={query}
        selected={selected}
        onQueryChange={setQuery}
        onToggle={toggle}
        onClear={() => startTransition(() => setSelected([]))}
      />
      <PreviewCard content={content} downloadUrl={downloadUrl} />
      <ToolArticle>
        <h2>{m["tools.gitignoreGenerator.articleWhatTitle"]()}</h2>
        <p>{m["tools.gitignoreGenerator.articleWhatBody"]()}</p>
        <ul>
          {[
            m["tools.gitignoreGenerator.articleExamples0"](),
            m["tools.gitignoreGenerator.articleExamples1"](),
            m["tools.gitignoreGenerator.articleExamples2"](),
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2>{m["tools.gitignoreGenerator.articleSourceTitle"]()}</h2>
        <p>{m["tools.gitignoreGenerator.articleSourceBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function GitignoreGeneratorPage() {
  return (
    <ToolPage>
      <GitignoreGeneratorPageContent />
    </ToolPage>
  );
}
