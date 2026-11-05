import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rent Me Out — one verified broker for every room",
    template: "%s · Rent Me Out",
  },
  description:
    "Owners tokenise the right to rent a room. Brokers buy it. Tenants check it in seconds. Built for ETHGlobal Mumbai 2026.",
  applicationName: "Rent Me Out",
  keywords: [
    "rental rights",
    "Hedera",
    "World ID",
    "Arkiv",
    "ERC-3643",
    "Mumbai",
  ],
};

export const viewport: Viewport = {
  themeColor: "#eef1f4",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
