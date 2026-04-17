import { themePreferenceSchema, type ThemePreference } from "@prof/contracts";

export const THEME_PREFERENCE_STORAGE_KEY = "prof.theme-preference";
export const THEME_PREFERENCE_COOKIE_NAME = "prof_theme_preference";
export const SYSTEM_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export type ResolvedTheme = "light" | "dark";

const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
const THEME_META_COLORS: Record<ResolvedTheme, string> = {
  light: "#f8f6f0",
  dark: "#111418",
};

export function parseThemePreference(value: unknown): ThemePreference {
  const result = themePreferenceSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_THEME_PREFERENCE;
}

export function getStoredThemePreference(): ThemePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
  const result = themePreferenceSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function resolveThemePreference(themePreference: ThemePreference): ResolvedTheme {
  if (themePreference !== "system") {
    return themePreference;
  }

  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(SYSTEM_THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

export function persistThemePreference(themePreference: ThemePreference) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
  document.cookie = `${THEME_PREFERENCE_COOKIE_NAME}=${themePreference}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function getThemeColorForPreference(themePreference: ThemePreference) {
  if (themePreference === "dark") {
    return THEME_META_COLORS.dark;
  }

  return THEME_META_COLORS.light;
}

export function applyThemePreferenceToDocument(
  themePreference: ThemePreference,
  resolvedTheme: ResolvedTheme = resolveThemePreference(themePreference),
) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = themePreference;
  document.documentElement.style.colorScheme = themePreference === "system" ? "light dark" : resolvedTheme;
  updateThemeColorMeta(resolvedTheme);
}

function updateThemeColorMeta(resolvedTheme: ResolvedTheme) {
  if (typeof document === "undefined") {
    return;
  }

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  meta.content = THEME_META_COLORS[resolvedTheme];
}
