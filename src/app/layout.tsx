import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/convex-client-provider";
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
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
