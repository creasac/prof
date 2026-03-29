import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "prof - learn anything",
  description: "prof helps you learn anything.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
