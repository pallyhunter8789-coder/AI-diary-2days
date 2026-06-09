import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 시간다이어리",
  description: "인공지능(AI) 서비스 이용자 시간 다이어리 설문조사",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full bg-[#eef1f6] antialiased">
        <div className="app-container">
          {children}
        </div>
      </body>
    </html>
  );
}
