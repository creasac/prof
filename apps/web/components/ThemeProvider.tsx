"use client";

import type { ThemePreference } from "@prof/contracts";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { authClient } from "../lib/auth-client";
import { loadAccountPreferences, saveAccountThemePreference } from "../lib/account-preferences-api";
import {
  applyThemePreferenceToDocument,
  getStoredThemePreference,
  persistThemePreference,
  resolveThemePreference,
  type ResolvedTheme,
} from "../lib/theme";

type ThemeContextValue = {
  isSavingTheme: boolean;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (nextThemePreference: ThemePreference) => Promise<void>;
  themeError: string | null;
  themePreference: ThemePreference;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialResolvedTheme(themePreference: ThemePreference): ResolvedTheme {
  if (themePreference === "dark") {
    return "dark";
  }

  return "light";
}

export function ThemeProvider({
  children,
  initialThemePreference,
}: {
  children: ReactNode;
  initialThemePreference: ThemePreference;
}) {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;
  const syncedUserIdRef = useRef<string | null>(null);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(initialThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(getInitialResolvedTheme(initialThemePreference));
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  function applyThemePreferenceState(nextThemePreference: ThemePreference) {
    const nextResolvedTheme = resolveThemePreference(nextThemePreference);
    setThemePreferenceState(nextThemePreference);
    setResolvedTheme(nextResolvedTheme);
    persistThemePreference(nextThemePreference);
    applyThemePreferenceToDocument(nextThemePreference, nextResolvedTheme);
  }

  useEffect(() => {
    const storedThemePreference = getStoredThemePreference();
    applyThemePreferenceState(storedThemePreference ?? initialThemePreference);
  }, [initialThemePreference]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const nextResolvedTheme = resolveThemePreference(themePreference);
      setResolvedTheme(nextResolvedTheme);
      applyThemePreferenceToDocument(themePreference, nextResolvedTheme);
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [themePreference]);

  useEffect(() => {
    if (!currentUserId) {
      syncedUserIdRef.current = null;
      return;
    }

    if (syncedUserIdRef.current === currentUserId) {
      return;
    }

    syncedUserIdRef.current = currentUserId;
    let cancelled = false;

    void loadAccountPreferences()
      .then((preferences) => {
        if (cancelled) {
          return;
        }

        setThemeError(null);
        applyThemePreferenceState(preferences.themePreference);
      })
      .catch(() => {
        // Keep the local preference if account sync is temporarily unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  async function setThemePreference(nextThemePreference: ThemePreference) {
    if (nextThemePreference === themePreference) {
      return;
    }

    const previousThemePreference = themePreference;
    setThemeError(null);
    applyThemePreferenceState(nextThemePreference);

    if (!currentUserId) {
      return;
    }

    setIsSavingTheme(true);

    try {
      const preferences = await saveAccountThemePreference(nextThemePreference);
      applyThemePreferenceState(preferences.themePreference);
    } catch (error) {
      applyThemePreferenceState(previousThemePreference);
      setThemeError(error instanceof Error ? error.message : "Failed to save theme preference.");
    } finally {
      setIsSavingTheme(false);
    }
  }

  return (
    <ThemeContext.Provider
      value={{
        isSavingTheme,
        resolvedTheme,
        setThemePreference,
        themeError,
        themePreference,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return value;
}
