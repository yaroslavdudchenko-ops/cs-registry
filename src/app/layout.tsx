import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Реестр компьютеризированных систем",
  description: "Единый источник правды о компьютеризированных системах организации",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="ru">
      <body className={`${sans.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
