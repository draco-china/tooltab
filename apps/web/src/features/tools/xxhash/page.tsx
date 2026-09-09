import { Alert, Card, Input, Label } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  parseSeed,
  usesSeed,
  type XxAlgorithm,
} from "@workspace/tools/hash/xxhash";
import { StreamingHashTool } from "./streaming-hash";
export function XxHashTool({ algorithm }: { algorithm: XxAlgorithm }) {
  const id = useId();
  const [input, setInput] = useState("0");
  let seed: bigint | null = 0n;
  try {
    seed = parseSeed(input);
  } catch {
    seed = null;
  }
  return (
    <div className="grid gap-8" data-xxhash-page>
      {usesSeed(algorithm) ? (
        <ToolPanelCard>
          <Card.Header className="border-b border-separator">
            <Card.Title>{m["shared.xxhash.configuration"]()}</Card.Title>
            <Card.Description>{m["shared.xxhash.seedHint"]()}</Card.Description>
          </Card.Header>
          <ToolPanelCardContent className="gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor={id}>{m["shared.xxhash.seed"]()}</Label>
              <Input
                id={id}
                className="min-h-11 font-mono"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                aria-invalid={seed === null}
              />
              {seed === null ? null : (
                <p className="text-sm break-all text-muted">
                  {m["shared.xxhash.effectiveSeed"]()}: {seed.toString()}
                </p>
              )}
            </div>
            {seed === null ? (
              <Alert status="danger" role="alert">
                <Alert.Indicator>
                  <TriangleAlert aria-hidden className="size-4" />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    {m["shared.xxhash.invalidSeed"]()}
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </ToolPanelCardContent>
        </ToolPanelCard>
      ) : null}
      <StreamingHashTool
        algorithm={algorithm}
        seed={usesSeed(algorithm) ? seed : 0n}
      />
      <ToolArticle>
        <p>{m["shared.xxhash.security"]()}</p>
      </ToolArticle>
    </div>
  );
}
export default function Xxh32Tool() {
  return <XxHashTool algorithm="XXH32" />;
}
export function Xxh64Tool() {
  return <XxHashTool algorithm="XXH64" />;
}
export function Xxh364Tool() {
  return <XxHashTool algorithm="XXH3-64" />;
}
export function Xxh3128Tool() {
  return <XxHashTool algorithm="XXH3-128" />;
}
