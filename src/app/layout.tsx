import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offboarding Revocation Demo",
  description:
    "Auto-revoke a running AI agent's access when a user is offboarded.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
