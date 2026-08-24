import type { Metadata, Viewport } from "next";
import "./globals.css";
import AccessibilityControls from "./accessibility-controls";

export const metadata: Metadata = {
  title: "Droga Vida Popular",
  description: "Droga Vida Popular — saúde, cuidado e economia perto de você.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Droga Vida Popular",
    description: "Saúde, cuidado e economia perto de você.",
    type: "website",
    url: "https://site-do-erick.erick-fabrini3.chatgpt.site",
    siteName: "Droga Vida Popular",
    locale: "pt_BR",
    images: [{
      url: "https://site-do-erick.erick-fabrini3.chatgpt.site/og.png",
      width: 1200,
      height: 630,
      alt: "Droga Vida Popular — saúde, cuidado e economia perto de você.",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Droga Vida Popular",
    description: "Saúde, cuidado e economia perto de você.",
    images: ["https://site-do-erick.erick-fabrini3.chatgpt.site/og.png"],
  },
};

export const viewport: Viewport = { themeColor: "#e31b23", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}<AccessibilityControls /></body></html>;
}
