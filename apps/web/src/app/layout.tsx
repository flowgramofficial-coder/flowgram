import type { Metadata, Viewport } from "next";
import { CookieBanner } from "@/components/CookieBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FlowGram", template: "%s · FlowGram" },
  description: "Reply to every Instagram comment and first message automatically, in your own voice.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fafaf9" }, { media: "(prefers-color-scheme: dark)", color: "#090a0c" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}<CookieBanner /></body>
    </html>
  );
}
