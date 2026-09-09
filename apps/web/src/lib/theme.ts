export const colorThemes = [
  {
    id: "default",
    name: "Default",
    swatch: "#0066cc",
  },
  { id: "sky", name: "Sky", swatch: "#00a9ed" },
  {
    id: "lavender",
    name: "Lavender",
    swatch: "#9570fc",
  },
  { id: "mint", name: "Mint", swatch: "#00b97c" },
  {
    id: "netflix",
    name: "Netflix",
    swatch: "#e31029",
  },
  { id: "uber", name: "Uber", swatch: "#525252" },
  {
    id: "spotify",
    name: "Spotify",
    swatch: "#43c251",
  },
  {
    id: "coinbase",
    name: "Coinbase",
    swatch: "#225fff",
  },
  {
    id: "airbnb",
    name: "Airbnb",
    swatch: "#ff2b54",
  },
  {
    id: "discord",
    name: "Discord",
    swatch: "#656aeb",
  },
  {
    id: "rabbit",
    name: "Rabbit",
    swatch: "#ff4100",
  },
  {
    id: "brutalism",
    name: "Brutalism",
    swatch: "#fad200",
  },
  { id: "mauve", name: "Mauve", swatch: "#ab72c1" },
] as const;

export type ColorTheme = (typeof colorThemes)[number]["id"];
export type ThemeMode = "light" | "dark";
export type ThemePreference = "system" | ThemeMode;

export const defaultColorTheme: ColorTheme = "default";
export const colorThemeIds = colorThemes.map((theme) => theme.id);

export function getThemeInitializationScript() {
  const palettes = JSON.stringify(colorThemeIds);
  return `try{const r=document.documentElement,m=localStorage.getItem('tooltab-theme'),d=m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches),p=localStorage.getItem('tooltab-palette'),a=${palettes};r.classList.toggle('dark',d);r.dataset.theme=d?'dark':'light';r.dataset.palette=a.includes(p)?p:'${defaultColorTheme}';r.style.colorScheme=d?'dark':'light'}catch{}`;
}

export function isColorTheme(value: string | null): value is ColorTheme {
  return colorThemes.some((theme) => theme.id === value);
}

export function isThemePreference(
  value: string | null,
): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveThemeMode(
  preference: ThemePreference,
  systemDark: boolean,
): ThemeMode {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function applyTheme(mode: ThemeMode, palette: ColorTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.theme = mode;
  root.dataset.palette = palette;
  root.style.colorScheme = mode;
}
