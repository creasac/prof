import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppShell } from "../components/AppShell";
import { ThemeProvider } from "../components/ThemeProvider";
import { THEME_PREFERENCE_COOKIE_NAME, getThemeColorForPreference, parseThemePreference } from "../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "prof - learn anything",
  description: "prof helps you learn anything.",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialThemePreference = parseThemePreference(cookieStore.get(THEME_PREFERENCE_COOKIE_NAME)?.value);

  return (
    <html lang="en" data-theme={initialThemePreference} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={getThemeColorForPreference(initialThemePreference)} />
      </head>
      <body>
        <ThemeProvider initialThemePreference={initialThemePreference}>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
