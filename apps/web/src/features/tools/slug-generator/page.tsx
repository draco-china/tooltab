import { m } from "@/paraglide/messages.js";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Label,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { RefreshCcw } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";

import { safeLocalStorage } from "@/lib/safe-storage";
import {
  DEFAULT_CASE,
  DEFAULT_SEPARATOR,
  generateSlug,
  isSlugCase,
  isSlugSeparator,
  type SlugCase,
  type SlugSeparator,
} from "@workspace/tools/text/slug";

const storageKeys = {
  input: "tools:slug-generator:input",
  separator: "tools:slug-generator:separator",
  case: "tools:slug-generator:case",
};

function SlugGeneratorPageContent() {
  const inputId = useId();
  const separatorId = useId();
  const caseId = useId();
  const [input, setInput] = useState("Hello World Example");
  const [separator, setSeparator] = useState<SlugSeparator>(DEFAULT_SEPARATOR);
  const [slugCase, setSlugCase] = useState<SlugCase>(DEFAULT_CASE);

  useEffect(() => {
    const savedInput = safeLocalStorage.getItem(storageKeys.input);
    const savedSeparator = safeLocalStorage.getItem(storageKeys.separator);
    const savedCase = safeLocalStorage.getItem(storageKeys.case);
    if (savedInput !== null) setInput(savedInput);
    if (savedSeparator && isSlugSeparator(savedSeparator))
      setSeparator(savedSeparator);
    if (savedCase && isSlugCase(savedCase)) setSlugCase(savedCase);
  }, []);
  useEffect(() => safeLocalStorage.setItem(storageKeys.input, input), [input]);
  useEffect(
    () => safeLocalStorage.setItem(storageKeys.separator, separator),
    [separator],
  );
  useEffect(
    () => safeLocalStorage.setItem(storageKeys.case, slugCase),
    [slugCase],
  );

  const output = useMemo(
    () => generateSlug(input, separator, slugCase),
    [input, separator, slugCase],
  );

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <ToolPanelCard>
          <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Card.Title>{m["tools.rotCipher.inputLabel"]()}</Card.Title>
            <Button size="sm" variant="ghost" onPress={() => setInput("")}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["shared.textAnalysis.clear"]()}
            </Button>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <TextArea
              id={inputId}
              name="input-text"
              rows={4}
              aria-label={m["tools.rotCipher.inputLabel"]()}
              autoComplete="off"
              value={input}
              placeholder={m["tools.slugGenerator.inputPlaceholder"]()}
              className="min-h-24 resize-y text-sm"
              onChange={(event) => setInput(event.currentTarget.value)}
            />
          </ToolPanelCardContent>
          <ToolPanelCardFooter className="flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-6">
              <OptionGroup
                id={separatorId}
                label={m["common.passseparator"]()}
                value={separator}
                options={[
                  ["-", `- (${m["tools.slugGenerator.hyphenLabel"]()})`],
                  ["_", `_ (${m["tools.slugGenerator.underscoreLabel"]()})`],
                  [".", `. (${m["tools.slugGenerator.dotLabel"]()})`],
                ]}
                onChange={(value) => {
                  if (isSlugSeparator(value)) setSeparator(value);
                }}
              />
              <OptionGroup
                id={caseId}
                label={m["tools.slugGenerator.caseLabel"]()}
                value={slugCase}
                options={[
                  ["lower", m["common.listslugLower"]()],
                  ["preserve", m["tools.slugGenerator.preserveLabel"]()],
                ]}
                onChange={(value) => {
                  if (isSlugCase(value)) setSlugCase(value);
                }}
              />
            </div>
          </ToolPanelCardFooter>
        </ToolPanelCard>

        <ToolPanelCard
          role="region"
          aria-label={m["tools.slugGenerator.outputLabel"]()}
        >
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <Card.Title>{m["tools.slugGenerator.outputLabel"]()}</Card.Title>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <ToolCopyButton
                value={output}
                copyLabel={m["tools.slugGenerator.copyLabel"]()}
                copiedLabel={m["common.actions.copied"]()}
                variant="ghost"
              />
            </ToolPanelActionGroup>
          </Card.Header>
          <ToolPanelCardContent className="min-h-24 justify-center py-4">
            {output ? (
              <code className="block text-sm break-all">{output}</code>
            ) : (
              <p className="text-sm text-muted">
                {m["tools.slugGenerator.outputPlaceholder"]()}
              </p>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.slugGenerator.articleWhatTitle"]()}</h2>
        <p>{m["tools.slugGenerator.articleWhatBody"]()}</p>
        <h3>{m["tools.emailValidator.article.examplesTitle"]()}</h3>
        <ul>
          <li>
            <code>Hello World!</code> → <code>hello-world</code>
          </li>
          <li>
            <code>My Blog Post Title</code> → <code>my-blog-post-title</code>
          </li>
          <li>
            <code>Product: iPhone 15 Pro</code> →{" "}
            <code>product-iphone-15-pro</code>
          </li>
        </ul>
        <h2>{m["tools.slugGenerator.articleWhyTitle"]()}</h2>
        <p>{m["tools.slugGenerator.articleWhyBody"]()}</p>
        <h2>{m["tools.slugGenerator.articleUnicodeTitle"]()}</h2>
        <p>{m["tools.slugGenerator.articleUnicodeBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function SlugGeneratorPage() {
  return (
    <ToolPage instructions={m["tools.slugGenerator.usage"]()}>
      <SlugGeneratorPageContent />
    </ToolPage>
  );
}

function OptionGroup({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label id={`${id}-label`}>{label}</Label>
      <ToggleButtonGroup
        aria-labelledby={`${id}-label`}
        selectionMode="single"
        selectedKeys={new Set([value])}
        isDetached
        className="flex flex-wrap gap-2"
        onSelectionChange={(keys) => {
          const next = [...keys][0];
          if (next) onChange(String(next));
        }}
      >
        {options.map(([key, text]) => (
          <ToggleButton
            id={key}
            key={key}
            size="sm"
            className="border border-border px-3"
          >
            {text}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
