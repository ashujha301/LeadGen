import "@fontsource-variable/montserrat";
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/features/shell/app-shell";

export const metadata: Metadata = {
  title: "leadGen-demo",
  description: "Evidence-backed lead intelligence demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className="min-h-screen font-sans"
        style={{ fontFamily: "var(--font-montserrat, 'Montserrat Variable', system-ui, sans-serif)" }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
