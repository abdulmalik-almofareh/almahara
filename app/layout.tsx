import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "المهرة",
  description: "منصة لإدارة حلقات تحفيظ القرآن الكريم: الواجبات والتسميع وتسجيل الأخطاء ومتابعة أولياء الأمور.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Amiri+Quran&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
