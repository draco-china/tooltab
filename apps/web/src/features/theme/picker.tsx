import { Button, ColorSwatch, Popover } from "@heroui/react";
import { Check, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyTheme,
  type ColorTheme,
  colorThemes,
  defaultColorTheme,
  isColorTheme,
} from "@/lib/theme";
import { m } from "@/paraglide/messages.js";

export function ThemePicker() {
  const [palette, setPalette] = useState<ColorTheme>(defaultColorTheme);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tooltab-palette");
      if (isColorTheme(saved)) setPalette(saved);
    } catch {}
  }, []);
  function selectTheme(next: ColorTheme) {
    setPalette(next);
    try {
      localStorage.setItem("tooltab-palette", next);
    } catch {}
    const mode = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    applyTheme(mode, next);
  }
  return (
    <Popover>
      <Button
        aria-label={m["navigation.colortheme"]()}
        variant="ghost"
        size="md"
        isIconOnly
        className="size-11 min-w-11 rounded-lg"
      >
        <Palette aria-hidden className="size-5" />
      </Button>
      <Popover.Content
        placement="bottom end"
        className="w-96 max-w-[calc(100vw-1.5rem)]"
      >
        <Popover.Dialog className="p-3">
          <ul
            aria-label={m["navigation.colortheme"]()}
            className="grid grid-cols-5 gap-2"
          >
            {colorThemes.map((theme) => (
              <li key={theme.id}>
                <Button
                  aria-label={theme.name}
                  aria-pressed={palette === theme.id}
                  className="h-20 w-full min-w-0 flex-col gap-1.5 overflow-visible rounded-xl bg-transparent px-1 py-2 text-[0.68rem] hover:bg-transparent data-[hovered=true]:bg-transparent data-[pressed=true]:bg-transparent"
                  variant="ghost"
                  onPress={() => selectTheme(theme.id)}
                >
                  <span
                    className="relative rounded-full transition-[box-shadow,opacity] duration-200 hover:opacity-85"
                    style={{
                      boxShadow:
                        palette === theme.id
                          ? "0 0 0 2px var(--overlay), 0 0 0 4px var(--accent)"
                          : undefined,
                    }}
                  >
                    <ColorSwatch color={theme.swatch} size="lg" />
                    {palette === theme.id ? (
                      <Check
                        aria-hidden
                        className="absolute inset-0 m-auto size-4 text-accent-foreground drop-shadow-sm"
                        strokeWidth={3}
                      />
                    ) : null}
                  </span>
                  <span className="w-full truncate text-center">
                    {theme.name}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
