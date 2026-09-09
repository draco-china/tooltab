import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Alert, Button, Card, Input, Label } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import {
  parseSipHashKey,
  randomSipHashKey,
  type SipHashAlgorithm,
} from "@workspace/tools/hash/siphash";
import { StreamingHashTool } from "./streaming-hash";

function SipHashTool({ algorithm }: { algorithm: SipHashAlgorithm }) {
  const id = useId();
  const [draft, setDraft] = useState("000102030405060708090a0b0c0d0e0f"),
    [error, setError] = useState(false);
  const key = useMemo(() => {
    try {
      return parseSipHashKey(draft);
    } catch {
      return null;
    }
  }, [draft]);
  function random() {
    try {
      setDraft(randomSipHashKey());
      setError(false);
    } catch {
      setError(true);
    }
  }
  return (
    <div className="grid gap-6" data-siphash-page>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["shared.siphash.configuration"]()}</Card.Title>
          <Card.Description>{m["shared.siphash.note"]()}</Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor={id}>{m["shared.siphash.key"]()}</Label>
            <Input
              id={id}
              value={draft}
              maxLength={4096}
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 font-mono"
              aria-invalid={key === null}
              aria-describedby={`${id}-hint`}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(false);
              }}
            />
            <p id={`${id}-hint`} className="text-sm text-muted">
              {m["shared.siphash.keyHint"]()}
            </p>
          </div>
          {key === null || error ? (
            <Alert status="danger" role="alert">
              <Alert.Indicator>
                <TriangleAlert aria-hidden className="size-4" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Description>
                  {(error
                    ? m["shared.siphash.randomFailed"]
                    : m["shared.siphash.invalidKey"])({})}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </ToolPanelCardContent>
        <ToolPanelCardFooter>
          <Button variant="outline" onPress={random}>
            {m["shared.siphash.random"]()}
          </Button>
        </ToolPanelCardFooter>
      </ToolPanelCard>
      <StreamingHashTool algorithm={algorithm} hashKey={key} />
    </div>
  );
}
function SipHash64ToolContent() {
  return <SipHashTool algorithm="SipHash-2-4" />;
}
function SipHash128ToolContent() {
  return <SipHashTool algorithm="SipHash-128-2-4" />;
}

export function SipHash128Tool() {
  return (
    <ToolPage>
      <SipHash128ToolContent />
    </ToolPage>
  );
}

export default function SipHash64Tool() {
  return (
    <ToolPage>
      <SipHash64ToolContent />
    </ToolPage>
  );
}
