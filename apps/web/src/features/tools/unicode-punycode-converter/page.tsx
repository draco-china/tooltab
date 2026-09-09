import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card, Input } from "@heroui/react";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";
import { convertDomain } from "@workspace/tools/network/address";
import { m } from "@/paraglide/messages.js";

const DEFAULT_ASCII = "xn--v86c4184b.com";
const DEFAULT_UNICODE = "🕸️.com";

function PunycodeConverterContent() {
  const [ascii, setAscii] = useState(DEFAULT_ASCII);
  const [unicode, setUnicode] = useState(DEFAULT_UNICODE);
  const [asciiInvalid, setAsciiInvalid] = useState(false);
  const [unicodeInvalid, setUnicodeInvalid] = useState(false);

  function changeAscii(value: string) {
    setAscii(value);
    try {
      setUnicode(convertDomain(value, "unicode").unicode);
      setAsciiInvalid(false);
    } catch {
      setAsciiInvalid(true);
    }
  }

  function changeUnicode(value: string) {
    setUnicode(value);
    try {
      setAscii(convertDomain(value, "ascii").ascii);
      setUnicodeInvalid(false);
    } catch {
      setUnicodeInvalid(true);
    }
  }

  function reset() {
    setAscii(DEFAULT_ASCII);
    setUnicode(DEFAULT_UNICODE);
    setAsciiInvalid(false);
    setUnicodeInvalid(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Card.Title>
            {m["tools.unicodePunycodeConverter.asciiDomainLabel"]()}
          </Card.Title>
          <ToolPanelActionGroup className="sm:col-start-2 sm:row-span-2 sm:row-start-1">
            <ToolCopyButton
              value={ascii}
              copyLabel={m["common.actions.copy"]()}
              copiedLabel={m["common.actions.copied"]()}
              variant="ghost"
            />
            <Button type="button" size="sm" variant="ghost" onPress={reset}>
              <RefreshCcw aria-hidden className="size-4" />
              {m["common.textcodecSample"]()}
            </Button>
          </ToolPanelActionGroup>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <Input
            name="ascii-domain"
            autoComplete="off"
            spellCheck={false}
            aria-label={m["tools.unicodePunycodeConverter.asciiDomainLabel"]()}
            aria-invalid={asciiInvalid || undefined}
            value={ascii}
            className="min-h-12 font-mono text-sm"
            onChange={(event) => changeAscii(event.currentTarget.value)}
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="grid gap-3 border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Card.Title>
            {m["tools.unicodePunycodeConverter.unicodeDomainLabel"]()}
          </Card.Title>
          <ToolCopyButton
            value={unicode}
            copyLabel={m["common.actions.copy"]()}
            copiedLabel={m["common.actions.copied"]()}
            variant="ghost"
            className="sm:col-start-2 sm:row-span-2 sm:row-start-1"
          />
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <Input
            name="unicode-domain"
            autoComplete="off"
            spellCheck={false}
            aria-label={m[
              "tools.unicodePunycodeConverter.unicodeDomainLabel"
            ]()}
            aria-invalid={unicodeInvalid || undefined}
            value={unicode}
            className="min-h-12 font-mono text-sm"
            onChange={(event) => changeUnicode(event.currentTarget.value)}
          />
        </ToolPanelCardContent>
      </ToolPanelCard>

      <ToolPanelCard className="lg:col-span-2">
        <Card.Header className="border-b border-separator">
          <Card.Title>
            {m["tools.unicodePunycodeConverter.whatIsPunycodeTitle"]()}
          </Card.Title>
        </Card.Header>
        <ToolPanelCardContent className="py-4">
          <p className="max-w-3xl text-sm leading-7 text-muted">
            {m["tools.unicodePunycodeConverter.whatIsPunycodeDescription"]()}
          </p>
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}

export function PunycodeConverter() {
  return (
    <ToolPage instructions={m["tools.unicodePunycodeConverter.usage"]()}>
      <PunycodeConverterContent />
    </ToolPage>
  );
}
