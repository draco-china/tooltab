import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Chip,
  InputGroup,
  ScrollShadow,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { LayoutGrid, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import {
  COLOR_FAMILIES,
  type ColorFamily,
  findNamedColors,
} from "@workspace/tools/color/names";

const SWATCHES: Record<Exclude<ColorFamily, "all">, string> = {
  red: "#FF0000",
  orange: "#FFA500",
  yellow: "#FFFF00",
  green: "#008000",
  cyan: "#00FFFF",
  blue: "#0000FF",
  purple: "#800080",
  pink: "#FFC0CB",
  brown: "#A52A2A",
  gray: "#808080",
  white: "#FFFFFF",
};
const FAMILY_LABELS = {
  all: m["shared.crcChecksum.all"],
  red: m["tools.htmlColorNames.namedRed"],
  orange: m["tools.htmlColorNames.namedOrange"],
  yellow: m["tools.htmlColorNames.namedYellow"],
  green: m["tools.htmlColorNames.namedGreen"],
  cyan: m["tools.htmlColorNames.namedCyan"],
  blue: m["tools.htmlColorNames.namedBlue"],
  purple: m["tools.htmlColorNames.namedPurple"],
  pink: m["tools.htmlColorNames.namedPink"],
  brown: m["tools.htmlColorNames.namedBrown"],
  gray: m["tools.htmlColorNames.namedGray"],
  white: m["tools.htmlColorNames.namedWhite"],
} as const;

function HtmlColorNamesContent() {
  const locale = getLocale();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ColorFamily>("all");
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(
    () => findNamedColors(deferredQuery, category),
    [category, deferredQuery],
  );
  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const active = query.trim().length > 0 || category !== "all";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Card.Title>
                {m["tools.htmlColorNames.catalogTitle"]()}
              </Card.Title>
              <Card.Description>
                {m["tools.htmlColorNames.catalogDescription"]()}
              </Card.Description>
            </div>
            <Chip variant="secondary" size="sm">
              {formatter.format(result.count)} /{" "}
              {formatter.format(result.total)}
            </Chip>
          </div>
        </Card.Header>
        <ToolPanelCardContent className="gap-5 py-4">
          <InputGroup variant="secondary" fullWidth>
            <InputGroup.Prefix>
              <Search aria-hidden className="size-4" />
            </InputGroup.Prefix>
            <InputGroup.Input
              type="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={1000}
              aria-label={m["tools.htmlColorNames.searchPlaceholder"]()}
              placeholder={m["tools.htmlColorNames.searchPlaceholder"]()}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </InputGroup>

          <ToggleButtonGroup
            isDetached
            selectionMode="single"
            selectedKeys={new Set([category])}
            aria-label={m["tools.htmlColorNames.searchPlaceholder"]()}
            className="flex w-full flex-wrap gap-2"
            onSelectionChange={(selection) => {
              const next = String([...selection][0] ?? "");
              if (COLOR_FAMILIES.includes(next as ColorFamily))
                setCategory(next as ColorFamily);
            }}
          >
            {COLOR_FAMILIES.map((family) => (
              <ToggleButton key={family} id={family} size="sm">
                <span className="flex items-center gap-2">
                  {family === "all" ? null : (
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full border border-border"
                      style={{ backgroundColor: SWATCHES[family] }}
                    />
                  )}
                  {FAMILY_LABELS[family]()}
                </span>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {result.count === 0 ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border bg-default/20 px-6 py-10 text-center">
              <div className="grid justify-items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-default">
                  <LayoutGrid aria-hidden className="size-4 text-muted" />
                </span>
                <p className="font-medium">
                  {m["tools.htmlColorNames.namedempty"]()}
                </p>
              </div>
            </div>
          ) : (
            <ScrollShadow
              orientation="vertical"
              className="h-136 w-full overflow-x-hidden md:h-168"
            >
              <div className="grid min-w-0 gap-3 pe-4 sm:grid-cols-2 xl:grid-cols-3">
                {result.colors.map((color) => (
                  <ColorTile key={color.name} color={color} />
                ))}
              </div>
            </ScrollShadow>
          )}
        </ToolPanelCardContent>
        <ToolPanelCardFooter className="justify-end">
          <Button
            variant="outline"
            isDisabled={!active}
            onPress={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            {m["common.actions.reset"]()}
          </Button>
        </ToolPanelCardFooter>
      </ToolPanelCard>

      <ToolArticle>
        <h2>{m["tools.htmlColorNames.articleWhatTitle"]()}</h2>
        <p>{m["tools.htmlColorNames.articleWhatBody"]()}</p>
        <p>
          <strong>{m["tools.htmlColorNames.articleBasicTitle"]()}</strong>{" "}
          {m["tools.htmlColorNames.articleBasicBody"]()}
        </p>
        <p>
          <strong>{m["tools.htmlColorNames.articleExtendedTitle"]()}</strong>{" "}
          {m["tools.htmlColorNames.articleExtendedBody"]()}
        </p>
        <h2>{m["tools.htmlColorNames.articleHelpTitle"]()}</h2>
        <p>{m["tools.htmlColorNames.articleHelpBody"]()}</p>
        <h2>{m["tools.htmlColorNames.articleUseTitle"]()}</h2>
        <p>{m["tools.htmlColorNames.articleUseBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

function ColorTile({
  color,
}: {
  color: ReturnType<typeof findNamedColors>["colors"][number];
}) {
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-border bg-default/20">
      <div
        role="img"
        className="h-20 border-b border-border"
        style={{ backgroundColor: color.hex }}
        aria-label={`${m["common.cssgenColor"]()}: ${color.name}`}
        title={`${m["common.cssgenColor"]()}: ${color.name}`}
      />
      <div className="space-y-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium">{color.name}</p>
            <p className="font-mono text-xs text-muted">{color.hex}</p>
          </div>
          <Chip variant="tertiary" size="sm">
            {FAMILY_LABELS[color.category]()}
          </Chip>
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{m["tools.htmlColorNames.hex"]()}</dt>
            <dd className="font-mono text-xs">{color.hex}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{m["tools.colorPicker.rgb"]()}</dt>
            <dd className="font-mono text-xs">{color.rgbLabel}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

export default function HtmlColorNames() {
  return (
    <ToolPage>
      <HtmlColorNamesContent />
    </ToolPage>
  );
}
