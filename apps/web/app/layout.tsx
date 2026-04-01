import type { Metadata } from "next";

import { AppShell } from "../components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "prof - learn anything",
  description: "prof helps you learn anything.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
