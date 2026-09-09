import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { Bot, ChevronDown, Download, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { executeSeo } from "@workspace/tools/project/seo";
import {
  aiAgents,
  type RobotsGroup,
  robotsPreset,
  searchAgents,
} from "@workspace/tools/project/seo";

type Preset = "allowAll" | "disallowAll" | "blockAdmin";
type Rule = RobotsGroup["rules"][number];
type DraftRule = Rule & { id: string };
type DraftGroup = Omit<RobotsGroup, "crawlDelay" | "rules"> & {
  id: string;
  rules: DraftRule[];
  crawlDelay: string;
};
type Draft = {
  groups: DraftGroup[];
  sitemaps: string;
  host: string;
  advanced: boolean;
};

const STORAGE_KEY = "tools:robots-txt-generator:draft";
const STORAGE_DEBOUNCE_MS = 180;

function presetDraft(preset: Preset): Draft {
  const state = robotsPreset(preset);
  return {
    groups: state.groups.map((group, index) => ({
      ...group,
      id: `group-${index + 1}`,
      rules: group.rules.map((rule, ruleIndex) => ({
        ...rule,
        id: `group-${index + 1}-rule-${ruleIndex + 1}`,
      })),
      crawlDelay: "",
    })),
    sitemaps: state.sitemaps.join("\n"),
    host: state.host,
    advanced: state.advanced,
  };
}

function readDraft(value: string | null): Draft {
  const fallback = presetDraft("blockAdmin");
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return fallback;
    const source = parsed as Record<string, unknown>;
    const groups = Array.isArray(source.groups)
      ? source.groups.flatMap((item, index): DraftGroup[] => {
          if (!item || typeof item !== "object") return [];
          const group = item as Record<string, unknown>;
          const rules = Array.isArray(group.rules)
            ? group.rules.flatMap((entry, ruleIndex): DraftRule[] => {
                if (!entry || typeof entry !== "object") return [];
                const rule = entry as Record<string, unknown>;
                return (rule.type === "allow" || rule.type === "disallow") &&
                  typeof rule.path === "string"
                  ? [
                      {
                        id:
                          typeof rule.id === "string" && rule.id
                            ? rule.id
                            : `group-${index + 1}-rule-${ruleIndex + 1}`,
                        type: rule.type,
                        path: rule.path,
                      },
                    ]
                  : [];
              })
            : [];
          return [
            {
              id:
                typeof group.id === "string" && group.id
                  ? group.id
                  : `group-${index + 1}`,
              userAgents: Array.isArray(group.userAgents)
                ? group.userAgents.filter(
                    (agent): agent is string => typeof agent === "string",
                  )
                : ["*"],
              rules,
              crawlDelay:
                typeof group.crawlDelay === "string" ? group.crawlDelay : "",
            },
          ];
        })
      : [];
    return {
      groups: groups.length ? groups : fallback.groups,
      sitemaps:
        typeof source.sitemaps === "string"
          ? source.sitemaps
          : fallback.sitemaps,
      host: typeof source.host === "string" ? source.host : fallback.host,
      advanced:
        typeof source.advanced === "boolean"
          ? source.advanced
          : fallback.advanced,
    };
  } catch {
    return fallback;
  }
}

function lines(value: string) {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeAgents(current: string[], additions: string[]) {
  const source = current.map((item) => item.trim()).filter(Boolean);
  const output =
    source.length <= 1 && source.every((item) => item === "*") ? [] : source;
  const seen = new Set(output.map((item) => item.toLowerCase()));
  for (const agent of additions) {
    if (seen.has(agent.toLowerCase())) continue;
    seen.add(agent.toLowerCase());
    output.push(agent);
  }
  return output;
}

function matchingPreset(groups: DraftGroup[]): Preset | null {
  if (groups.length !== 1) return null;
  const group = groups[0];
  if (!group) return null;
  const agents = group.userAgents.map((value) => value.trim()).filter(Boolean);
  if (agents.length !== 1 || agents[0] !== "*") return null;
  const rules = group.rules.filter((rule) => rule.path.trim());
  if (!rules.length) return "allowAll";
  if (rules.length !== 1 || rules[0]?.type !== "disallow") return null;
  return rules[0].path.trim() === "/"
    ? "disallowAll"
    : rules[0].path.trim() === "/admin/"
      ? "blockAdmin"
      : null;
}

function validDelay(value: string) {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function RobotsTxtGeneratorContent() {
  const [draft, setDraft] = useState(() => presetDraft("blockAdmin"));
  const [hydrated, setHydrated] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const nextGroupId = useRef(2);
  const nextRuleId = useRef(2);

  useEffect(() => {
    try {
      const stored = readDraft(localStorage.getItem(STORAGE_KEY));
      setDraft(stored);
      nextGroupId.current = stored.groups.length + 1;
      nextRuleId.current =
        stored.groups.reduce((total, group) => total + group.rules.length, 0) +
        1;
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch {}
    }, STORAGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  const state = useMemo(
    () => ({
      groups: draft.groups.map(({ id: _id, crawlDelay, rules, ...group }) => ({
        ...group,
        rules: rules.map(({ id: _ruleId, ...rule }) => rule),
        crawlDelay:
          validDelay(crawlDelay) && crawlDelay.trim()
            ? Number(crawlDelay)
            : null,
      })),
      sitemaps: lines(draft.sitemaps),
      host: draft.host,
      advanced: draft.advanced,
    }),
    [draft],
  );
  const output = useMemo(() => {
    try {
      return executeSeo({ kind: "robots", state }).output;
    } catch {
      return "";
    }
  }, [state]);
  const activePreset = matchingPreset(draft.groups);

  useEffect(() => {
    if (!output) {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [output]);

  function updateGroup(id: string, update: (group: DraftGroup) => DraftGroup) {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === id ? update(group) : group,
      ),
    }));
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-6">
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.sitemapXmlGenerator.seopresets"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.robotsTxtGenerator.presetsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            <ToggleButtonGroup
              aria-label={m["tools.sitemapXmlGenerator.seopresets"]()}
              className="w-full justify-start"
              selectedKeys={activePreset ? new Set([activePreset]) : new Set()}
              selectionMode="single"
              onSelectionChange={(selection) => {
                const preset = String([...selection][0] ?? "") as Preset;
                if (
                  preset === "allowAll" ||
                  preset === "disallowAll" ||
                  preset === "blockAdmin"
                )
                  setDraft((current) => ({
                    ...current,
                    groups: presetDraft(preset).groups,
                  }));
              }}
            >
              <ToggleButton id="allowAll">
                {m["shared.seoGenerators.allowall"]()}
              </ToggleButton>
              <ToggleButton id="disallowAll">
                {m["shared.seoGenerators.blockall"]()}
              </ToggleButton>
              <ToggleButton id="blockAdmin">
                {m["tools.robotsTxtGenerator.presetBlockAdmin"]()}
              </ToggleButton>
            </ToggleButtonGroup>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>
              {m["tools.robotsTxtGenerator.siteSettings"]()}
            </Card.Title>
            <Card.Description>
              {m["tools.robotsTxtGenerator.siteSettingsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <TextField>
              <Label htmlFor="robots-sitemaps">
                {m["tools.robotsTxtGenerator.sitemaps"]()}
              </Label>
              <TextArea
                id="robots-sitemaps"
                aria-label={m["tools.robotsTxtGenerator.sitemaps"]()}
                className="min-h-28 resize-y font-mono text-sm"
                placeholder={m["tools.robotsTxtGenerator.sitemapPlaceholder"]()}
                rows={4}
                spellCheck={false}
                value={draft.sitemaps}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sitemaps: event.target.value,
                  }))
                }
              />
            </TextField>
            <div className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-separator px-4 py-3">
              <div className="grid gap-1">
                <span className="text-sm font-medium">
                  {m["tools.robotsTxtGenerator.advancedSettings"]()}
                </span>
                <span className="text-xs text-muted">
                  {m["tools.robotsTxtGenerator.host"]()}
                </span>
              </div>
              <Switch
                aria-label={m["tools.robotsTxtGenerator.advancedSettings"]()}
                isSelected={draft.advanced}
                onChange={(selected) =>
                  setDraft((current) => ({
                    ...current,
                    advanced: selected === true,
                  }))
                }
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>
            {draft.advanced ? (
              <TextField>
                <Label htmlFor="robots-host">
                  {m["tools.robotsTxtGenerator.host"]()}
                </Label>
                <Input
                  id="robots-host"
                  aria-label={m["tools.robotsTxtGenerator.host"]()}
                  className="font-mono text-sm"
                  placeholder={m[
                    "tools.csrGenerator.subjectCommonNamePlaceholder"
                  ]()}
                  spellCheck={false}
                  value={draft.host}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      host: event.target.value,
                    }))
                  }
                />
              </TextField>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["tools.robotsTxtGenerator.groups"]()}</Card.Title>
            <Card.Description>
              {m["tools.robotsTxtGenerator.groupsDescription"]()}
            </Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            {draft.groups.map((group, groupIndex) => {
              const invalidDelay = !validDelay(group.crawlDelay);
              return (
                <section
                  key={group.id}
                  className="grid gap-4 rounded-xl border border-separator bg-default/30 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      {m["tools.robotsTxtGenerator.groupTitle"]({
                        index: groupIndex + 1,
                      })}
                    </h3>
                    <Button
                      aria-label={m["tools.robotsTxtGenerator.removeGroup"]()}
                      isDisabled={draft.groups.length <= 1}
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          groups: current.groups.filter(
                            (item) => item.id !== group.id,
                          ),
                        }))
                      }
                    >
                      <Trash2 aria-hidden className="size-4" />
                      {m["tools.robotsTxtGenerator.removeGroup"]()}
                    </Button>
                  </div>
                  <TextField>
                    <Label htmlFor={`${group.id}-agents`}>
                      {m["tools.robotsTxtGenerator.userAgents"]()}
                    </Label>
                    <TextArea
                      id={`${group.id}-agents`}
                      aria-label={m["tools.robotsTxtGenerator.userAgents"]()}
                      className="min-h-28 resize-y font-mono text-sm"
                      placeholder={m[
                        "tools.robotsTxtGenerator.userAgentPlaceholder"
                      ]()}
                      rows={4}
                      spellCheck={false}
                      value={group.userAgents.join("\n")}
                      onChange={(event) =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          userAgents: event.target.value.split(/\r?\n/u),
                        }))
                      }
                    />
                  </TextField>
                  <ToolPanelActionGroup>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          userAgents: mergeAgents(
                            current.userAgents,
                            searchAgents,
                          ),
                        }))
                      }
                    >
                      <Search aria-hidden className="size-4" />
                      {m["tools.robotsTxtGenerator.presetSearchEngines"]()}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() =>
                        updateGroup(group.id, (current) => ({
                          ...current,
                          userAgents: mergeAgents(current.userAgents, aiAgents),
                        }))
                      }
                    >
                      <Bot aria-hidden className="size-4" />
                      {m["tools.sitemapXmlGenerator.seoaiagents"]()}
                    </Button>
                  </ToolPanelActionGroup>
                  <p className="text-xs text-muted">
                    {m["tools.robotsTxtGenerator.userAgentHint"]()}
                  </p>
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label>{m["tools.sitemapXmlGenerator.seorules"]()}</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() =>
                          updateGroup(group.id, (current) => ({
                            ...current,
                            rules: [
                              ...current.rules,
                              {
                                id: `rule-${nextRuleId.current++}`,
                                type: "disallow",
                                path: "",
                              },
                            ],
                          }))
                        }
                      >
                        <Plus aria-hidden className="size-4" />
                        {m["tools.sitemapXmlGenerator.seoaddrule"]()}
                      </Button>
                    </div>
                    {group.rules.length ? (
                      group.rules.map((rule, ruleIndex) => (
                        <div
                          key={rule.id}
                          className="grid items-end gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
                        >
                          <Select
                            aria-label={m[
                              "tools.robotsTxtGenerator.ruleType"
                            ]()}
                            fullWidth
                            selectedKey={rule.type}
                            variant="secondary"
                            onSelectionChange={(key) => {
                              if (key !== "allow" && key !== "disallow") return;
                              updateGroup(group.id, (current) => ({
                                ...current,
                                rules: current.rules.map((item, index) =>
                                  index === ruleIndex
                                    ? { ...item, type: key }
                                    : item,
                                ),
                              }));
                            }}
                          >
                            <Label>
                              {m["tools.robotsTxtGenerator.ruleType"]()}
                            </Label>
                            <Select.Trigger className="min-h-11">
                              <Select.Value />
                              <Select.Indicator>
                                <ChevronDown aria-hidden />
                              </Select.Indicator>
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                <ListBox.Item
                                  id="allow"
                                  textValue={m[
                                    "tools.sitemapXmlGenerator.seoallow"
                                  ]()}
                                >
                                  {m["tools.sitemapXmlGenerator.seoallow"]()}
                                </ListBox.Item>
                                <ListBox.Item
                                  id="disallow"
                                  textValue={m[
                                    "tools.sitemapXmlGenerator.seodisallow"
                                  ]()}
                                >
                                  {m["tools.sitemapXmlGenerator.seodisallow"]()}
                                </ListBox.Item>
                              </ListBox>
                            </Select.Popover>
                          </Select>
                          <TextField>
                            <Label htmlFor={`${group.id}-path-${ruleIndex}`}>
                              {m["tools.robotsTxtGenerator.rulePath"]()}
                            </Label>
                            <Input
                              id={`${group.id}-path-${ruleIndex}`}
                              aria-label={m[
                                "tools.robotsTxtGenerator.rulePath"
                              ]()}
                              className="font-mono text-sm"
                              placeholder={m[
                                "tools.robotsTxtGenerator.pathPlaceholder"
                              ]()}
                              spellCheck={false}
                              value={rule.path}
                              onChange={(event) =>
                                updateGroup(group.id, (current) => ({
                                  ...current,
                                  rules: current.rules.map((item, index) =>
                                    index === ruleIndex
                                      ? { ...item, path: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </TextField>
                          <Button
                            aria-label={m[
                              "tools.robotsTxtGenerator.removeRule"
                            ]()}
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            onPress={() =>
                              updateGroup(group.id, (current) => ({
                                ...current,
                                rules: current.rules.filter(
                                  (_, index) => index !== ruleIndex,
                                ),
                              }))
                            }
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-separator px-4 py-3 text-sm text-muted">
                        {m["tools.robotsTxtGenerator.ruleHint"]()}
                      </div>
                    )}
                    <p className="text-xs text-muted">
                      {m["tools.robotsTxtGenerator.ruleHint"]()}
                    </p>
                    {draft.advanced ? (
                      <TextField isInvalid={invalidDelay}>
                        <Label htmlFor={`${group.id}-delay`}>
                          {m["tools.robotsTxtGenerator.crawlDelay"]()}
                        </Label>
                        <Input
                          id={`${group.id}-delay`}
                          aria-label={m[
                            "tools.robotsTxtGenerator.crawlDelay"
                          ]()}
                          inputMode="decimal"
                          min={0}
                          placeholder={m[
                            "tools.robotsTxtGenerator.crawlDelayPlaceholder"
                          ]()}
                          step={0.1}
                          type="number"
                          value={group.crawlDelay}
                          onChange={(event) =>
                            updateGroup(group.id, (current) => ({
                              ...current,
                              crawlDelay: event.target.value,
                            }))
                          }
                        />
                        {invalidDelay ? (
                          <span className="text-xs text-danger">
                            {m["tools.robotsTxtGenerator.crawlDelayInvalid"]()}
                          </span>
                        ) : null}
                      </TextField>
                    ) : null}
                  </div>
                </section>
              );
            })}
            <div>
              <Button
                size="sm"
                variant="outline"
                onPress={() => {
                  const id = `group-${nextGroupId.current++}`;
                  setDraft((current) => ({
                    ...current,
                    groups: [
                      ...current.groups,
                      {
                        id,
                        userAgents: ["*"],
                        rules: [],
                        crawlDelay: "",
                      },
                    ],
                  }));
                }}
              >
                <Plus aria-hidden className="size-4" />
                {m["tools.sitemapXmlGenerator.seoaddgroup"]()}
              </Button>
            </div>
          </ToolPanelCardContent>
        </ToolPanelCard>

        <ToolPanelCard>
          <Card.Header className="flex flex-col gap-3 border-b border-separator sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Card.Title>{m["common.devOutput"]()}</Card.Title>
              <Card.Description>
                {m["tools.robotsTxtGenerator.outputDescription"]()}
              </Card.Description>
            </div>
            <ToolPanelActionGroup className="shrink-0 sm:justify-end">
              <ToolCopyButton
                copiedLabel={m["common.actions.copied"]()}
                copyLabel={m["tools.robotsTxtGenerator.copyOutput"]()}
                value={output}
              />
              <Button
                isDisabled={!downloadUrl}
                size="sm"
                variant="ghost"
                onPress={() => {
                  if (!downloadUrl) return;
                  const link = document.createElement("a");
                  link.href = downloadUrl;
                  link.download = "robots.txt";
                  link.click();
                }}
              >
                <Download aria-hidden className="size-4" />
                {m["tools.robotsTxtGenerator.download"]()}
              </Button>
            </ToolPanelActionGroup>
          </Card.Header>
          <ToolPanelCardContent className="py-4">
            {output ? (
              <TextArea
                aria-label={m["common.devOutput"]()}
                className="min-h-72 resize-y font-mono text-sm"
                readOnly
                rows={12}
                spellCheck={false}
                value={output}
              />
            ) : (
              <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-separator p-6 text-center text-sm text-muted">
                {m["tools.robotsTxtGenerator.emptyOutput"]()}
              </div>
            )}
          </ToolPanelCardContent>
        </ToolPanelCard>
      </div>

      <ToolArticle>
        <h2>{m["tools.robotsTxtGenerator.articleWhatTitle"]()}</h2>
        <p>{m["tools.robotsTxtGenerator.articleWhatBody"]()}</p>
        <h2>{m["tools.robotsTxtGenerator.articleConfigureTitle"]()}</h2>
        <p>{m["tools.robotsTxtGenerator.articleConfigureBody"]()}</p>
        <h2>{m["tools.robotsTxtGenerator.articlePublishTitle"]()}</h2>
        <p>
          {m["tools.robotsTxtGenerator.articlePublishBeforeLink"]()}
          <a href="https://example.com/robots.txt">
            https://example.com/robots.txt
          </a>
          {m["tools.robotsTxtGenerator.articlePublishAfterLink"]()}
        </p>
        <h2>{m["tools.robotsTxtGenerator.articleLimitationsTitle"]()}</h2>
        <p>{m["tools.robotsTxtGenerator.articleLimitationsBody"]()}</p>
      </ToolArticle>
    </div>
  );
}

export default function RobotsTxtGenerator() {
  return (
    <ToolPage>
      <RobotsTxtGeneratorContent />
    </ToolPage>
  );
}
