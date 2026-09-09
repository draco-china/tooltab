import { m } from "@/paraglide/messages.js";
import { ToolPage } from "@/features/tools/_shared/tool-page/page";
import {
  Card,
  Checkbox,
  Input,
  Label,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { useEffect, useId, useState } from "react";
import { ToolArticle } from "@/components/base/tool-article";
import { ToolCopyButton } from "@/components/base/tool-copy-button";
import {
  ToolPanelCard,
  ToolPanelCardContent,
} from "@/components/base/tool-panel-card";

import {
  chmod,
  type Permissions,
  permissionDigits,
  type RIGHTS,
  type ROLES,
} from "@workspace/tools/system/permissions";

const DEFAULT_NUMERIC = "755";
const STORAGE_KEY = "tools:chmod-calculator:numeric";
type PermissionRole = (typeof ROLES)[number];
type PermissionKey = (typeof RIGHTS)[number];
type ChmodState = Readonly<{
  numericInput: string;
  symbolicInput: string;
  permissions: Permissions;
}>;

function createStateFromNumeric(numericInput: string): ChmodState {
  const result = chmod(numericInput);
  return {
    numericInput,
    symbolicInput: result.symbolic,
    permissions: result.permissions,
  };
}

function deriveNumericState(
  numericInput: string,
  previousState: ChmodState,
): ChmodState {
  if (numericInput === "") {
    return { ...previousState, numericInput, symbolicInput: "" };
  }
  try {
    return createStateFromNumeric(numericInput);
  } catch {
    return { ...previousState, numericInput };
  }
}

function deriveSymbolicState(
  symbolicInput: string,
  previousState: ChmodState,
): ChmodState {
  if (symbolicInput === "") {
    return { ...previousState, symbolicInput };
  }
  try {
    const result = chmod(symbolicInput, "symbolic");
    return {
      numericInput: result.numeric,
      symbolicInput,
      permissions: result.permissions,
    };
  } catch {
    return { ...previousState, symbolicInput };
  }
}

function isValidInput(input: string, format: "numeric" | "symbolic") {
  if (input === "") return true;
  try {
    chmod(input, format);
    return true;
  } catch {
    return false;
  }
}

function ChmodCalculatorContent() {
  const numericInputId = useId();
  const symbolicInputId = useId();
  const [state, setState] = useState<ChmodState>(() =>
    createStateFromNumeric(DEFAULT_NUMERIC),
  );
  const numericInputValid = isValidInput(state.numericInput, "numeric");
  const symbolicInputValid = isValidInput(state.symbolicInput, "symbolic");
  const chmodCommand = `chmod ${state.numericInput || "000"} <filename>`;

  useEffect(() => {
    try {
      const storedNumeric = localStorage.getItem(STORAGE_KEY);
      if (storedNumeric !== null) {
        setState((previousState) =>
          deriveNumericState(storedNumeric, previousState),
        );
      }
    } catch {
      // Storage is optional; the calculator remains available without it.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, state.numericInput);
    } catch {
      // Storage is optional; the calculator remains available without it.
    }
  }, [state.numericInput]);

  function updateFromMatrix(
    role: PermissionRole,
    permission: PermissionKey,
    checked: boolean,
  ) {
    setState((previousState) => {
      const permissions: Permissions = {
        owner: { ...previousState.permissions.owner },
        group: { ...previousState.permissions.group },
        others: { ...previousState.permissions.others },
      };
      permissions[role][permission] = checked;
      return createStateFromNumeric(permissionDigits(permissions));
    });
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-6" data-tool-panels>
        <PermissionMatrixCard
          permissions={state.permissions}
          onChange={updateFromMatrix}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <PresetsCard
            numericInput={state.numericInput}
            onSelect={(value) =>
              setState((previousState) =>
                deriveNumericState(value, previousState),
              )
            }
          />
          <PermissionInputCard
            id={numericInputId}
            isValid={numericInputValid}
            kind="numeric"
            value={state.numericInput}
            onChange={(value) =>
              setState((previousState) =>
                deriveNumericState(value, previousState),
              )
            }
          />
          <PermissionInputCard
            id={symbolicInputId}
            isValid={symbolicInputValid}
            kind="symbolic"
            value={state.symbolicInput}
            onChange={(value) =>
              setState((previousState) =>
                deriveSymbolicState(value, previousState),
              )
            }
          />
          <CommandCard value={chmodCommand} />
        </div>
      </div>
      <ChmodArticle />
    </div>
  );
}

function PermissionMatrixCard({
  permissions,
  onChange,
}: {
  permissions: Permissions;
  onChange: (
    role: PermissionRole,
    permission: PermissionKey,
    checked: boolean,
  ) => void;
}) {
  const roles = [
    ["owner", m["common.chmodOwner"]()],
    ["group", m["common.chmodGroup"]()],
    ["others", m["common.chmodOthers"]()],
  ] as const;
  const rights = [
    ["read", m["common.chmodRead"](), "r"],
    ["write", m["common.chmodWrite"](), "w"],
    ["execute", m["common.chmodExecute"](), "x"],
  ] as const;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.chmod.permissionMatrixLabel"]()}</Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="overflow-x-auto py-4">
        <table className="w-full min-w-md border-separate border-spacing-0 text-sm">
          <thead className="bg-surface-secondary">
            <tr className="border-b border-separator">
              <td
                className="border-b border-separator px-3 py-3 text-start font-medium"
                aria-hidden="true"
              />
              {rights.map(([key, label, short]) => (
                <th
                  key={key}
                  className="border-b border-separator px-3 py-3 text-center font-medium"
                  scope="col"
                >
                  {label} ({short})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map(([role, label]) => (
              <tr
                key={role}
                className="last:[&>td]:border-b-0 last:[&>th]:border-b-0"
              >
                <th
                  className="border-b border-separator px-3 py-3 text-start font-medium"
                  scope="row"
                >
                  {label}
                </th>
                {rights.map(([right, rightLabel]) => (
                  <td
                    key={right}
                    className="border-b border-separator px-3 py-3 text-center"
                  >
                    <div className="flex justify-center">
                      <Checkbox
                        aria-label={`${label} ${rightLabel}`}
                        isSelected={permissions[role][right]}
                        onChange={(checked) =>
                          onChange(role, right, checked === true)
                        }
                      >
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <span className="sr-only">
                            {label} {rightLabel}
                          </span>
                        </Checkbox.Content>
                      </Checkbox>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PresetsCard({
  numericInput,
  onSelect,
}: {
  numericInput: string;
  onSelect: (value: string) => void;
}) {
  const presets = [
    ["755", m["shared.chmod.executablePresetLabel"]()],
    ["644", m["shared.chmod.readOnlyPresetLabel"]()],
    ["777", m["shared.chmod.fullAccessPresetLabel"]()],
    ["700", m["shared.chmod.ownerOnlyPresetLabel"]()],
    ["600", m["shared.chmod.privateFilePresetLabel"]()],
    ["775", m["shared.chmod.sharedDirPresetLabel"]()],
  ] as const;
  const selectedPreset = presets.some(([value]) => value === numericInput)
    ? numericInput
    : null;
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.chmod.presetsTitle"]()}</Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <ToggleButtonGroup
          selectionMode="single"
          selectedKeys={selectedPreset ? new Set([selectedPreset]) : new Set()}
          aria-label={m["shared.chmod.presetsTitle"]()}
          isDetached
          className="flex w-full flex-wrap justify-start gap-3"
          onSelectionChange={(selection) => {
            const next = String([...selection][0] ?? "");
            if (presets.some(([value]) => value === next)) onSelect(next);
          }}
        >
          {presets.map(([value, label]) => (
            <ToggleButton
              key={value}
              id={value}
              aria-label={`${value} ${label}`}
              className="h-auto min-h-16 min-w-32 flex-col items-start justify-center gap-1 px-3 py-3 text-start whitespace-normal"
            >
              <span className="font-mono text-sm font-semibold">{value}</span>
              <span className="text-xs text-muted">{label}</span>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function PermissionInputCard({
  id,
  isValid,
  kind,
  value,
  onChange,
}: {
  id: string;
  isValid: boolean;
  kind: "numeric" | "symbolic";
  value: string;
  onChange: (value: string) => void;
}) {
  const label =
    kind === "numeric"
      ? m["shared.chmod.numericPermissionLabel"]()
      : m["shared.chmod.symbolicPermissionLabel"]();
  const placeholder =
    kind === "numeric"
      ? m["shared.chmod.numericPermissionPlaceholder"]()
      : m["shared.chmod.symbolicPermissionPlaceholder"]();
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{label}</Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <div className="grid gap-2">
          <Label htmlFor={id}>{label}</Label>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              id={id}
              aria-invalid={!isValid}
              inputMode={kind === "numeric" ? "numeric" : undefined}
              maxLength={kind === "numeric" ? 3 : 9}
              placeholder={placeholder}
              spellCheck={false}
              value={value}
              className="min-w-0 flex-1 font-mono"
              onChange={(event) => onChange(event.currentTarget.value)}
            />
            <ToolCopyButton
              value={value}
              copyLabel={m["common.actions.copyResult"]()}
              copiedLabel={m["common.actions.copied"]()}
              ariaLabel={`${m["common.actions.copyResult"]()}: ${label}`}
              size="icon-sm"
            />
          </div>
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function CommandCard({ value }: { value: string }) {
  return (
    <ToolPanelCard>
      <Card.Header className="border-b border-separator">
        <Card.Title>{m["shared.chmod.chmodCommandLabel"]()}</Card.Title>
      </Card.Header>
      <ToolPanelCardContent className="py-4">
        <div className="flex min-w-0 items-center gap-2">
          <code className="block min-w-0 flex-1 rounded-xl border border-border bg-default/20 px-4 py-3 text-sm break-all">
            {value}
          </code>
          <ToolCopyButton
            value={value}
            copyLabel={m["common.actions.copyResult"]()}
            copiedLabel={m["common.actions.copied"]()}
            ariaLabel={`${m["common.actions.copyResult"]()}: ${m["shared.chmod.chmodCommandLabel"]()}`}
            size="icon-sm"
          />
        </div>
      </ToolPanelCardContent>
    </ToolPanelCard>
  );
}

function ChmodArticle() {
  return (
    <ToolArticle>
      <h2>{m["shared.chmod.article.whatTitle"]()}</h2>
      <p>{m["shared.chmod.article.what"]()}</p>
      <h2>{m["shared.chmod.article.numericTitle"]()}</h2>
      <p>{m["shared.chmod.article.numeric"]()}</p>
      <h2>{m["shared.chmod.article.examplesTitle"]()}</h2>
      <ul>
        <li>{m["shared.chmod.article.exampleOne"]()}</li>
        <li>{m["shared.chmod.article.exampleTwo"]()}</li>
        <li>{m["shared.chmod.article.exampleThree"]()}</li>
        <li>{m["shared.chmod.article.exampleFour"]()}</li>
      </ul>
    </ToolArticle>
  );
}

export default function ChmodCalculator() {
  return (
    <ToolPage instructions={m["tools.chmodCalculator.usage"]()}>
      <ChmodCalculatorContent />
    </ToolPage>
  );
}
