import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import { Button, Card, Table } from "@heroui/react";
import { Download, Flag, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ToolPanelActionGroup,
  ToolPanelCard,
  ToolPanelCardContent,
  ToolPanelCardFooter,
} from "@/components/base/tool-panel-card";
import { m } from "@/paraglide/messages.js";
import { useObjectUrl } from "@/hooks/use-object-url";
import { getLocale } from "@/paraglide/runtime.js";
import {
  elapsed,
  emptyStopwatch,
  formatElapsed,
  LAP_LIMIT,
  lapCsv,
  lapRows,
  type StopwatchAction,
  transition,
  validStopwatch,
} from "@workspace/tools/time/stopwatch";

const STORAGE = "tooltab:stopwatch:v1";
function StopwatchContent() {
  const locale = getLocale();
  const [state, setState] = useState(emptyStopwatch),
    [now, setNow] = useState(0),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const value = JSON.parse(raw);
        if (validStopwatch(value)) {
          elapsed(value, Date.now());
          setState(value);
        } else setStorageError(true);
      }
    } catch {
      setStorageError(true);
    }
    setNow(Date.now());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      if (!state.running && !state.accumulatedMs && !state.laps.length)
        localStorage.removeItem(STORAGE);
      else localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      setStorageError(true);
    }
  }, [state, ready]);
  useEffect(() => {
    if (!state.running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [state.running]);
  const csv = useMemo(
    () =>
      lapCsv(state.laps, [
        m["tools.stopwatch.swlap"]({}, { locale }),
        m["tools.stopwatch.swtotal"]({}, { locale }),
        m["tools.stopwatch.swlapms"]({}, { locale }),
        m["tools.stopwatch.swtotalms"]({}, { locale }),
      ]),
    [state.laps, locale],
  );
  const csvBlob = useMemo(
    () => (csv ? new Blob([csv], { type: "text/csv;charset=utf-8" }) : null),
    [csv],
  );
  const url = useObjectUrl(csvBlob);
  const current = elapsed(state, now),
    rows = useMemo(() => lapRows(state.laps), [state.laps]);
  function act(action: StopwatchAction) {
    const time = Date.now();
    setNow(time);
    setState((value) => transition(value, action, time));
  }
  return (
    <div className="grid gap-6" data-tool-panels>
      <ToolPanelCard>
        <Card.Header className="border-b border-separator">
          <Card.Title>{m["common.swname"]()}</Card.Title>
          <Card.Description>
            {m["tools.stopwatch.swprivacy"]()}
          </Card.Description>
        </Card.Header>
        <ToolPanelCardContent className="items-center justify-center gap-4 py-12 text-center">
          <output
            aria-live="off"
            className="font-mono text-4xl tabular-nums sm:text-6xl"
            aria-label={m["tools.stopwatch.swelapsed"]()}
          >
            {formatElapsed(current)}
          </output>
          {state.running || current > 0 || state.laps.length > 0 ? (
            <p className="text-sm text-muted">
              {(state.running ? m["common.swrunning"] : m["common.swpaused"])(
                {},
              )}
            </p>
          ) : null}
          {storageError ? (
            <p role="status" className="text-sm text-warning">
              {m["tools.stopwatch.swstorageerror"]()}
            </p>
          ) : null}
        </ToolPanelCardContent>
        <ToolPanelCardFooter className="justify-center">
          <ToolPanelActionGroup className="justify-center">
            <Button
              isDisabled={!ready}
              onClick={() => act(state.running ? "pause" : "start")}
            >
              {state.running ? (
                <Pause aria-hidden className="size-4" />
              ) : (
                <Play aria-hidden className="size-4" />
              )}
              {(state.running
                ? m["common.swpause"]
                : current
                  ? m["common.swresume"]
                  : m["common.swstart"])({})}
            </Button>
            <Button
              variant="outline"
              isDisabled={
                !state.running || !current || state.laps.length >= LAP_LIMIT
              }
              onClick={() => act("lap")}
            >
              <Flag aria-hidden className="size-4" />
              {m["tools.stopwatch.swlap"]({}, { locale })}
            </Button>
            <Button
              variant="outline"
              isDisabled={state.running || (!current && !state.laps.length)}
              onClick={() => act("reset")}
            >
              <RotateCcw aria-hidden className="size-4" />
              {m["common.actions.reset"]()}
            </Button>
          </ToolPanelActionGroup>
        </ToolPanelCardFooter>
      </ToolPanelCard>

      <ToolPanelCard>
        <Card.Header className="border-b border-separator sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid min-w-0 gap-1">
            <Card.Title>{m["tools.stopwatch.swlaps"]()}</Card.Title>
            <Card.Description>
              {m["tools.stopwatch.swdescription"]()}
            </Card.Description>
          </div>
          <ToolPanelActionGroup className="justify-end">
            <Button
              variant="outline"
              isDisabled={!url}
              onPress={() => {
                if (!url) return;
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "stopwatch-laps.csv";
                anchor.click();
              }}
            >
              <Download aria-hidden className="size-4" />
              {m["tools.stopwatch.swexport"]()}
            </Button>
            <Button
              variant="ghost"
              isDisabled={!rows.length}
              onClick={() => act("clear-laps")}
            >
              <Trash2 aria-hidden className="size-4" />
              {m["tools.stopwatch.swclear"]()}
            </Button>
          </ToolPanelActionGroup>
        </Card.Header>
        <ToolPanelCardContent className="gap-4 py-4">
          {rows.length ? (
            <Table variant="secondary">
              <Table.ScrollContainer className="max-h-112">
                <Table.Content aria-label={m["tools.stopwatch.swlaps"]()}>
                  <Table.Header>
                    <Table.Column id="index" isRowHeader>
                      #
                    </Table.Column>
                    <Table.Column id="lap">
                      {m["tools.stopwatch.swlap"]({}, { locale })}
                    </Table.Column>
                    <Table.Column id="total">
                      {m["tools.stopwatch.swtotal"]({}, { locale })}
                    </Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {rows.map((row) => (
                      <Table.Row key={row.index} id={String(row.index)}>
                        <Table.Cell>{row.index}</Table.Cell>
                        <Table.Cell className="font-mono tabular-nums">
                          {formatElapsed(row.lapMs)}
                        </Table.Cell>
                        <Table.Cell className="font-mono tabular-nums">
                          {formatElapsed(row.totalMs)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          ) : (
            <div className="flex min-h-28 items-center justify-center text-sm text-muted">
              {m["tools.stopwatch.swempty"]()}
            </div>
          )}
          <p className="text-sm text-muted">{m["tools.stopwatch.swlimit"]()}</p>
        </ToolPanelCardContent>
      </ToolPanelCard>
    </div>
  );
}

export default function Stopwatch() {
  return (
    <ToolPage>
      <StopwatchContent />
    </ToolPage>
  );
}
