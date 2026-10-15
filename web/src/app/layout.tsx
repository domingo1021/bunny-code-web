import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/layout/site-header";
import { Providers } from "./providers";
import "./globals.css";

/*
 * Typography.
 *
 * The subject here is monospaced text being typed, so the monospace carries
 * the personality and does the display work rather than being relegated to
 * small data labels. Archivo handles interface prose: a grotesque with enough
 * width and a slightly condensed feel, so it sits beside a mono without
 * looking like the same voice.
 *
 * Deliberately not Geist + Geist Mono, which is what the scaffold ships and
 * therefore what every Next.js project looks like.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bunny Code",
    template: "%s · Bunny Code",
  },
  description:
    "Record and replay coding sessions like video, version your projects, and compete in live 1v1 coding battles.",
  applicationName: "Bunny Code",
};

export const viewport: Viewport = {
  themeColor: "#15181f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrains.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <Providers>
          {/* First tab stop on every page: the editor screens are dense and
              tabbing past the whole nav to reach them is hostile. */}
          <a
            href="#main"
            className="focus:bg-brand focus:text-brand-ink sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
          >
            Skip to content
          </a>
          <SiteHeader />
          <div id="main" className="flex flex-1 flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
