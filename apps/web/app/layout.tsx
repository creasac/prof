import type { Metadata } from "next";

import { AuthDock } from "../components/AuthDock";
import "./globals.css";

export const metadata: Metadata = {
  title: "prof - learn anything",
  description: "prof helps you learn anything.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthDock />
        {children}
      </body>
    </html>
  );
}
