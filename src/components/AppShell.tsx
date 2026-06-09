import React from "react";

interface AppShellProps {
  title?: string;
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  children: React.ReactNode;
}

export default function AppShell({
  title,
  headerContent,
  footerContent,
  children,
}: AppShellProps) {
  return (
    <div className="flex flex-col h-full min-h-[100dvh] bg-white text-[#1b2430] font-sans">
      {/* 상단 고정 헤더 */}
      {(title || headerContent) && (
        <header className="flex-none bg-navy text-white px-4 pt-6 pb-4 relative z-20 shadow-md">
          {headerContent ? (
            headerContent
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-[#9fc7ec]">AI 시간다이어리</span>
              <h1 className="text-lg font-bold">{title}</h1>
            </div>
          )}
        </header>
      )}

      {/* 본문 스크롤 영역 */}
      <main className="flex-1 overflow-y-auto px-4 py-6 bg-[#fbfcfe]">
        {children}
      </main>

      {/* 하단 고정 액션 영역 */}
      {footerContent && (
        <footer className="flex-none border-t border-[#e5e9f0] bg-white p-4 flex gap-2 items-center">
          {footerContent}
        </footer>
      )}
    </div>
  );
}
