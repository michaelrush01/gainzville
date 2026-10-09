import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Space_Mono, Sora } from "next/font/google";
import "./globals.css";

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  weight: ["600", "700"],
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gainzville-ai.vercel.app"),
  title: "Gainzville",
  description: "Smart protein on a student budget. Scan a meal, see the protein and what it cost you.",
  // Full-screen when added to an iPhone home screen
  appleWebApp: { capable: true, title: "Gainzville", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#120e1f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${chakra.variable} ${spaceMono.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ground text-text">
        <div className="mx-auto min-h-dvh w-full max-w-md">{children}</div>
      </body>
    </html>
  );
}
