import { Button } from "@heroui/react";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import { useEffect, useMemo, useRef } from "react";
import { CodeBlock } from "@/components/base/code-block";
import { m } from "@/paraglide/messages.js";

hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
export function Output({
  value,
  filename,
  language,
}: {
  value: string;
  filename: string;
  language: "json" | "yaml";
}) {
  const outputKey = `${filename}\u0000${language}\u0000${value}`;
  const url = useRef<string | null>(null);
  const previousOutputKey = useRef(outputKey);
  useEffect(() => {
    return () => {
      if (url.current) {
        URL.revokeObjectURL(url.current);
        url.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (previousOutputKey.current === outputKey) return;
    previousOutputKey.current = outputKey;
    if (!url.current) return;
    URL.revokeObjectURL(url.current);
    url.current = null;
  }, [outputKey]);
  const html = useMemo(
    () => hljs.highlight(value.slice(0, 200000), { language }).value,
    [value, language],
  );
  const save = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(
      new Blob([value], {
        type:
          language === "json" ? "application/json" : "text/yaml;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url.current;
    a.download = filename;
    a.click();
  };
  return (
    <div className="space-y-3">
      <CodeBlock
        code={value}
        language={language.toUpperCase()}
        codeClassName="[&_.hljs-attr]:text-primary [&_.hljs-string]:text-chart-2"
      >
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes all user text and emits only its own syntax spans. */}
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </CodeBlock>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          variant="outline"
          isDisabled={!value}
          onClick={save}
        >
          {m["common.actions.download"]()}
        </Button>
      </div>
    </div>
  );
}
