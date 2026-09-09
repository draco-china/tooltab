import { useEffect, useState } from "react";
import type { CodeTheme } from "@/components/base/code-highlighter.types";

export function useCodeTheme() {
  const [theme, setTheme] = useState<CodeTheme>("light");

  useEffect(() => {
    const root = document.documentElement;
    const update = () =>
      setTheme(root.classList.contains("dark") ? "dark" : "light");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
